from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse, PlainTextResponse

from ..gedcom import parse_gedcom, serialize_gedcom
from ..models import Event, EventCreate, GedcomImportBody, Pedigree, PedigreeCreate, PedigreeDetail, PedigreeRestoreBody, PedigreeUpdate, XegImportBody
from ..xeg import parse_xeg
from ..store import store

router = APIRouter(prefix="/api/pedigrees", tags=["pedigrees"])


@router.post("", response_model=Pedigree, status_code=201)
def create_pedigree(body: PedigreeCreate):
    return store.create_pedigree(
        display_name=body.display_name,
        date_represented=body.date_represented,
        owner=body.owner,
        notes=body.notes,
        properties=body.properties,
    )


@router.get("", response_model=list[Pedigree])
def list_pedigrees():
    return store.list_pedigrees()


@router.get("/{pedigree_id}", response_model=PedigreeDetail)
def get_pedigree(pedigree_id: uuid.UUID):
    detail = store.get_pedigree_detail(pedigree_id)
    if detail is None:
        raise HTTPException(404, "Pedigree not found")
    return detail


@router.patch("/{pedigree_id}", response_model=Pedigree)
def update_pedigree(pedigree_id: uuid.UUID, body: PedigreeUpdate):
    ped = store.update_pedigree(pedigree_id, **body.model_dump(exclude_unset=True))
    if ped is None:
        raise HTTPException(404, "Pedigree not found")
    return ped


@router.put("/{pedigree_id}/restore", status_code=204)
def restore_pedigree(pedigree_id: uuid.UUID, body: PedigreeRestoreBody):
    if not store.restore_pedigree_snapshot(
        pedigree_id,
        body.individuals,
        body.relationships,
        body.eggs,
    ):
        raise HTTPException(404, "Pedigree not found")


@router.delete("/{pedigree_id}", status_code=204)
def delete_pedigree(pedigree_id: uuid.UUID):
    if not store.delete_pedigree(pedigree_id):
        raise HTTPException(404, "Pedigree not found")


@router.post("/{pedigree_id}/events", response_model=Event, status_code=201)
def add_event_to_pedigree(pedigree_id: uuid.UUID, body: EventCreate):
    if store.get_pedigree(pedigree_id) is None:
        raise HTTPException(404, "Pedigree not found")
    event = Event(**body.model_dump())
    result = store.add_event(pedigree_id, event)
    if result is None:
        raise HTTPException(404, "Pedigree not found")
    return result


@router.post("/{pedigree_id}/individuals/{individual_id}", status_code=204)
def add_individual_to_pedigree(pedigree_id: uuid.UUID, individual_id: uuid.UUID):
    if store.get_pedigree(pedigree_id) is None:
        raise HTTPException(404, "Pedigree not found")
    if store.get_individual(individual_id) is None:
        raise HTTPException(404, "Individual not found")
    store.add_individual_to_pedigree(pedigree_id, individual_id)


@router.delete("/{pedigree_id}/individuals/{individual_id}", status_code=204)
def remove_individual_from_pedigree(pedigree_id: uuid.UUID, individual_id: uuid.UUID):
    if not store.remove_individual_from_pedigree(pedigree_id, individual_id):
        raise HTTPException(404, "Pedigree or individual not found")


@router.post("/{pedigree_id}/relationships/{relationship_id}", status_code=204)
def add_relationship_to_pedigree(pedigree_id: uuid.UUID, relationship_id: uuid.UUID):
    if store.get_pedigree(pedigree_id) is None:
        raise HTTPException(404, "Pedigree not found")
    if store.get_relationship(relationship_id) is None:
        raise HTTPException(404, "Relationship not found")
    store.add_relationship_to_pedigree(pedigree_id, relationship_id)


@router.delete("/{pedigree_id}/relationships/{relationship_id}", status_code=204)
def remove_relationship_from_pedigree(pedigree_id: uuid.UUID, relationship_id: uuid.UUID):
    if not store.remove_relationship_from_pedigree(pedigree_id, relationship_id):
        raise HTTPException(404, "Pedigree or relationship not found")


@router.post("/{pedigree_id}/eggs/{egg_id}", status_code=204)
def add_egg_to_pedigree(pedigree_id: uuid.UUID, egg_id: uuid.UUID):
    if store.get_pedigree(pedigree_id) is None:
        raise HTTPException(404, "Pedigree not found")
    if store.get_egg(egg_id) is None:
        raise HTTPException(404, "Egg not found")
    store.add_egg_to_pedigree(pedigree_id, egg_id)


@router.get("/{pedigree_id}/export.ged")
def export_gedcom(
    pedigree_id: uuid.UUID,
    ids: Optional[str] = Query(None, description="Comma-separated individual UUIDs to export (subset)"),
):
    detail = store.get_pedigree_detail(pedigree_id)
    if detail is None:
        raise HTTPException(404, "Pedigree not found")

    inds = detail.individuals
    rels = detail.relationships
    egg_list = detail.eggs

    if ids:
        id_set = {uuid.UUID(i.strip()) for i in ids.split(",") if i.strip()}
        inds = [i for i in inds if i.id in id_set]
        rels = [r for r in rels if any(m in id_set for m in r.members)]
        rel_ids = {r.id for r in rels}
        egg_list = [
            e for e in egg_list
            if (
                (e.individual_id and e.individual_id in id_set)
                or any(iid in id_set for iid in e.individual_ids)
            )
            and (e.relationship_id and e.relationship_id in rel_ids)
        ]

    text = serialize_gedcom(
        inds, rels, egg_list,
        pedigree_name=detail.display_name,
    )
    return PlainTextResponse(
        text,
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="pedigree.ged"'},
    )


@router.post("/{pedigree_id}/import/gedcom", status_code=204)
def import_gedcom(
    pedigree_id: uuid.UUID,
    body: GedcomImportBody,
    mode: Optional[str] = Query(None, description="Set to 'parse' to return parsed entities without replacing"),
):
    if store.get_pedigree(pedigree_id) is None:
        raise HTTPException(404, "Pedigree not found")
    individuals, relationships, eggs = parse_gedcom(body.content)
    if mode == "parse":
        return JSONResponse({
            "individuals": [i.model_dump(mode="json") for i in individuals],
            "relationships": [r.model_dump(mode="json") for r in relationships],
            "eggs": [e.model_dump(mode="json") for e in eggs],
        })
    store.restore_pedigree_snapshot(pedigree_id, individuals, relationships, eggs)


@router.post("/{pedigree_id}/import/xeg", status_code=204)
def import_xeg(
    pedigree_id: uuid.UUID,
    body: XegImportBody,
    mode: Optional[str] = Query(None, description="Set to 'parse' to return parsed entities without replacing"),
):
    if store.get_pedigree(pedigree_id) is None:
        raise HTTPException(404, "Pedigree not found")
    individuals, relationships, eggs, diseases = parse_xeg(body.content)
    if mode == "parse":
        return JSONResponse({
            "individuals": [i.model_dump(mode="json") for i in individuals],
            "relationships": [r.model_dump(mode="json") for r in relationships],
            "eggs": [e.model_dump(mode="json") for e in eggs],
            "diseases": [d.model_dump(mode="json") for d in diseases],
        })
    # Register diseases from XEG into the catalog
    for d in diseases:
        if d.id not in store.diseases:
            store.diseases[d.id] = d
    store.restore_pedigree_snapshot(pedigree_id, individuals, relationships, eggs)


@router.delete("/{pedigree_id}/eggs/{egg_id}", status_code=204)
def remove_egg_from_pedigree(pedigree_id: uuid.UUID, egg_id: uuid.UUID):
    if not store.remove_egg_from_pedigree(pedigree_id, egg_id):
        raise HTTPException(404, "Pedigree or egg not found")


@router.post("/{pedigree_id}/calculate-consanguinity")
def calculate_consanguinity(
    pedigree_id: uuid.UUID,
    force: bool = Query(False, description="Override manually set values"),
):
    """Calculate kinship coefficients for all relationships in the pedigree.

    Uses Wright's path coefficient method. The kinship coefficient f(A,B)
    between two individuals is: f(A,B) = sum over common ancestors C of
    (1/2)^(n1+n2+1) * (1 + f_C) where n1 and n2 are path lengths from
    A and B to C, and f_C is the inbreeding coefficient of C.
    """
    detail = store.get_pedigree_detail(pedigree_id)
    if detail is None:
        raise HTTPException(404, "Pedigree not found")

    # Build parent lookup: child_id → set of parent individual IDs
    parents: dict[uuid.UUID, set[uuid.UUID]] = {}
    for egg in detail.eggs:
        child_ids = egg.individual_ids if egg.individual_ids else ([egg.individual_id] if egg.individual_id else [])
        for cid in child_ids:
            if cid not in parents:
                parents[cid] = set()
            if egg.relationship_id:
                rel = next((r for r in detail.relationships if r.id == egg.relationship_id), None)
                if rel:
                    for mid in rel.members:
                        parents[cid].add(mid)

    # Memoised kinship coefficient using tabular method
    _kinship_cache: dict[tuple[uuid.UUID, uuid.UUID], float] = {}

    def kinship(a: uuid.UUID, b: uuid.UUID) -> float:
        """Compute kinship coefficient f(a, b)."""
        # Canonical key (order-independent)
        key = (min(a, b), max(a, b))
        if key in _kinship_cache:
            return _kinship_cache[key]

        # Prevent infinite recursion — mark as computing
        _kinship_cache[key] = 0.0

        if a == b:
            # f(a,a) = (1 + f_a) / 2 where f_a is inbreeding coefficient
            pa = parents.get(a, set())
            if len(pa) >= 2:
                p_list = sorted(pa)
                f_a = kinship(p_list[0], p_list[1])
            else:
                f_a = 0.0
            result = (1.0 + f_a) / 2.0
        else:
            # f(a,b) = (1/2) * (f(a, father_b) + f(a, mother_b))
            # Use b's parents; if b has no parents, f(a,b) = 0
            pb = parents.get(b, set())
            if not pb:
                result = 0.0
            else:
                result = sum(kinship(a, p) for p in pb) / (2.0 * len(pb)) * len(pb) / 1.0
                # Correct formula: f(a,b) = (1/2) * sum_over_parents_of_b( f(a, parent) )
                # For 2 parents: f(a,b) = (f(a, p1) + f(a, p2)) / 2
                result = sum(kinship(a, p) for p in pb) / 2.0

        _kinship_cache[key] = result
        return result

    # Calculate and update each relationship
    updated = []
    for rel in detail.relationships:
        if not force and rel.consanguinity_override:
            updated.append({
                "relationship_id": str(rel.id),
                "consanguinity": rel.consanguinity,
                "overridden": True,
            })
            continue

        if len(rel.members) >= 2:
            f = kinship(rel.members[0], rel.members[1])
            # Round to avoid floating point noise
            f = round(f, 6)
        else:
            f = None

        store.update_relationship(rel.id, consanguinity=f)
        updated.append({
            "relationship_id": str(rel.id),
            "consanguinity": f,
            "overridden": False,
        })

    return {"results": updated}
