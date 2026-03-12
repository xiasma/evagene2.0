"""Risk analysis router — proxies to the R/BayesMendel sidecar."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from enum import Enum
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..store import store

router = APIRouter(prefix="/api/pedigrees/{pedigree_id}/risk", tags=["risk"])

RISK_SIDECAR_URL = "http://localhost:8001"

# --- Disease name → BayesMendel cancer field mapping ---

# Maps disease display_name (lowercased) or ICD-10 code to BayesMendel fields.
_DISEASE_MAP_BRCA: dict[str, tuple[str, str]] = {
    # (affected_field, age_field)
    "breast cancer":  ("affected_breast", "age_breast"),
    "c50":            ("affected_breast", "age_breast"),
    "ovarian cancer": ("affected_ovary", "age_ovary"),
    "c56":            ("affected_ovary", "age_ovary"),
}

_DISEASE_MAP_MMR: dict[str, tuple[str, str]] = {
    "colon cancer":       ("affected_colon", "age_colon"),
    "colorectal cancer":  ("affected_colon", "age_colon"),
    "c18":                ("affected_colon", "age_colon"),
    "endometrial cancer": ("affected_endometrium", "age_endometrium"),
    "c54.1":              ("affected_endometrium", "age_endometrium"),
    "c54":                ("affected_endometrium", "age_endometrium"),
}

_DISEASE_MAP_PANC: dict[str, tuple[str, str]] = {
    "pancreatic cancer": ("affected_pancreas", "age_pancreas"),
    "c25":               ("affected_pancreas", "age_pancreas"),
}


class RiskModel(str, Enum):
    BRCAPRO = "BRCAPRO"
    MMRpro = "MMRpro"
    PancPRO = "PancPRO"


class RiskRequest(BaseModel):
    model: RiskModel = RiskModel.BRCAPRO
    allef_type: str = "nonAJ"
    counselee_id: Optional[str] = None  # individual UUID; defaults to proband


class CarrierProbabilities(BaseModel):
    raw: dict[str, float] = Field(default_factory=dict)


class FutureRisk(BaseModel):
    age: int
    risks: dict[str, float] = Field(default_factory=dict)


class RiskResult(BaseModel):
    model: str
    counselee_id: str
    counselee_name: str = ""
    carrier_probabilities: dict[str, float] = Field(default_factory=dict)
    future_risks: list[FutureRisk] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    error: Optional[str] = None


class RiskModelsResponse(BaseModel):
    models: list[str]
    sidecar_available: bool


@router.get("/models", response_model=RiskModelsResponse)
async def list_risk_models(pedigree_id: uuid.UUID):
    """Check which risk models are available from the R sidecar."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{RISK_SIDECAR_URL}/models")
            resp.raise_for_status()
            data = resp.json()
            return RiskModelsResponse(
                models=data.get("models", []),
                sidecar_available=True,
            )
    except Exception:
        return RiskModelsResponse(models=[], sidecar_available=False)


@router.post("/calculate", response_model=RiskResult)
async def calculate_risk(
    pedigree_id: uuid.UUID,
    body: RiskRequest,
):
    """Run a BayesMendel risk model on the pedigree."""
    detail = store.get_pedigree_detail(pedigree_id)
    if detail is None:
        raise HTTPException(404, "Pedigree not found")

    individuals = detail.individuals
    relationships = detail.relationships
    eggs = detail.eggs

    if not individuals:
        raise HTTPException(400, "Pedigree has no individuals")

    # --- Find counselee (proband) ---
    counselee = None
    if body.counselee_id:
        cid = uuid.UUID(body.counselee_id)
        counselee = next((i for i in individuals if i.id == cid), None)
    if counselee is None:
        # Find the individual with highest proband value
        counselee = max(individuals, key=lambda i: i.proband)
    if counselee.proband == 0:
        raise HTTPException(400, "No proband designated in this pedigree. Set an individual as proband first.")

    # --- Build parent lookup from eggs + relationships ---
    # egg.individual_id → child, egg.relationship_id → relationship → members (2 parents)
    child_to_parents: dict[uuid.UUID, tuple[uuid.UUID | None, uuid.UUID | None]] = {}
    ind_by_id = {i.id: i for i in individuals}
    rel_by_id = {r.id: r for r in relationships}

    for egg in eggs:
        child_ids = egg.individual_ids if egg.individual_ids else ([egg.individual_id] if egg.individual_id else [])
        if not egg.relationship_id:
            continue
        rel = rel_by_id.get(egg.relationship_id)
        if not rel or len(rel.members) < 2:
            continue
        # Determine father/mother from members
        m0 = ind_by_id.get(rel.members[0])
        m1 = ind_by_id.get(rel.members[1])
        if not m0 or not m1:
            continue
        father_id = mother_id = None
        if m0.biological_sex and m0.biological_sex.value == "male":
            father_id, mother_id = m0.id, m1.id
        elif m1.biological_sex and m1.biological_sex.value == "male":
            father_id, mother_id = m1.id, m0.id
        else:
            # Both female or unknown — assign arbitrarily
            father_id, mother_id = m0.id, m1.id

        for cid in child_ids:
            if cid:
                child_to_parents[cid] = (father_id, mother_id)

    # --- Derive ages from events ---
    today = date.today()
    pedigree_date = None
    if detail.date_represented:
        try:
            pedigree_date = date.fromisoformat(detail.date_represented)
        except ValueError:
            pass
    reference_date = pedigree_date or today

    def get_age(ind) -> int | None:
        birth_date = None
        death_date = None
        for ev in ind.events:
            if ev.type == "birth" and ev.date:
                try:
                    birth_date = date.fromisoformat(ev.date)
                except ValueError:
                    pass
            elif ev.type == "death" and ev.date:
                try:
                    death_date = date.fromisoformat(ev.date)
                except ValueError:
                    pass
        if birth_date is None:
            return None
        end = death_date or reference_date
        age = end.year - birth_date.year - ((end.month, end.day) < (birth_date.month, birth_date.day))
        return max(1, age)

    def get_diagnosis_age(ind, disease_names: set[str]) -> int | None:
        """Get age at diagnosis for a disease matching any of the given names."""
        # Check individual's diseases
        matched_disease_ids = set()
        for d in ind.diseases:
            dis = store.diseases.get(d.disease_id)
            if dis:
                name_lower = dis.display_name.lower()
                icd = (dis.icd10_code or "").lower()
                if name_lower in disease_names or icd in disease_names:
                    matched_disease_ids.add(d.disease_id)

        if not matched_disease_ids:
            return None

        # Look for diagnosis event
        birth_date = None
        for ev in ind.events:
            if ev.type == "birth" and ev.date:
                try:
                    birth_date = date.fromisoformat(ev.date)
                except ValueError:
                    pass

        for ev in ind.events:
            if ev.type == "diagnosis" and ev.date:
                try:
                    diag_date = date.fromisoformat(ev.date)
                    if birth_date:
                        age = diag_date.year - birth_date.year - (
                            (diag_date.month, diag_date.day) < (birth_date.month, birth_date.day)
                        )
                        return max(1, age)
                except ValueError:
                    pass

        # No diagnosis date found — use current age as proxy
        return get_age(ind)

    # --- Choose disease map based on model ---
    if body.model == RiskModel.BRCAPRO:
        disease_map = _DISEASE_MAP_BRCA
    elif body.model == RiskModel.MMRpro:
        disease_map = _DISEASE_MAP_MMR
    elif body.model == RiskModel.PancPRO:
        disease_map = _DISEASE_MAP_PANC
    else:
        raise HTTPException(400, f"Unknown model: {body.model}")

    # Collect all disease name keys for lookups
    all_disease_keys = set(disease_map.keys())

    # --- Assign integer IDs ---
    # BayesMendel expects sequential integer IDs; build mapping
    warnings: list[str] = []
    int_id_map: dict[uuid.UUID, int] = {}
    next_int_id = 1
    for ind in individuals:
        int_id_map[ind.id] = next_int_id
        next_int_id += 1

    counselee_int_id = int_id_map[counselee.id]

    # --- Build members array ---
    members = []
    for ind in individuals:
        age = get_age(ind)
        if age is None:
            warnings.append(f"{ind.display_name or str(ind.id)[:8]}: no birth date — excluded")
            continue

        sex = "Male" if ind.biological_sex and ind.biological_sex.value == "male" else "Female"
        father_uuid, mother_uuid = child_to_parents.get(ind.id, (None, None))

        member: dict = {
            "id": int_id_map[ind.id],
            "sex": sex,
            "father_id": int_id_map.get(father_uuid, 0) if father_uuid else 0,
            "mother_id": int_id_map.get(mother_uuid, 0) if mother_uuid else 0,
            "age": age,
        }

        # Check diseases and set affected fields + diagnosis ages
        for ind_disease in ind.diseases:
            dis = store.diseases.get(ind_disease.disease_id)
            if not dis:
                continue
            name_lower = dis.display_name.lower()
            icd = (dis.icd10_code or "").lower()

            for key, (aff_field, age_field) in disease_map.items():
                if name_lower == key or icd == key:
                    member[aff_field] = 1
                    diag_age = get_diagnosis_age(ind, {key})
                    if diag_age:
                        member[age_field] = diag_age

        members.append(member)

    if not members:
        raise HTTPException(400, "No individuals with birth dates in this pedigree")

    if counselee_int_id not in {m["id"] for m in members}:
        raise HTTPException(400, "Proband has no birth date — cannot calculate risk")

    # --- Call R sidecar ---
    payload = {
        "counselee_id": counselee_int_id,
        "allef_type": body.allef_type,
        "members": members,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{RISK_SIDECAR_URL}/calculate",
                params={"model": body.model.value},
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.ConnectError:
        raise HTTPException(503, "Risk analysis sidecar is not running. Start it with: Rscript risk/run.R")
    except httpx.HTTPStatusError as e:
        raise HTTPException(502, f"Risk sidecar error: {e.response.text}")
    except Exception as e:
        raise HTTPException(502, f"Risk sidecar error: {str(e)}")

    if "error" in data:
        return RiskResult(
            model=body.model.value,
            counselee_id=str(counselee.id),
            counselee_name=counselee.display_name,
            error=data["error"],
            warnings=warnings,
        )

    # --- Format response ---
    carrier_probs = {}
    if "carrier_probabilities" in data:
        for k, v in data["carrier_probabilities"].items():
            carrier_probs[k] = round(float(v), 6) if v is not None else 0.0

    future_risks: list[FutureRisk] = []
    if "future_risks" in data:
        for row in data["future_risks"]:
            age_val = None
            risks = {}
            for k, v in row.items():
                if k.lower().startswith("by") and "age" in k.lower():
                    age_val = int(v)
                else:
                    risks[k] = round(float(v), 6) if v is not None else 0.0
            if age_val is not None:
                future_risks.append(FutureRisk(age=age_val, risks=risks))

    return RiskResult(
        model=body.model.value,
        counselee_id=str(counselee.id),
        counselee_name=counselee.display_name,
        carrier_probabilities=carrier_probs,
        future_risks=future_risks,
        warnings=warnings,
    )
