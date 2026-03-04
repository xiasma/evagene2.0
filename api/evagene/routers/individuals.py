from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException

from ..models import (
    Event, Individual, IndividualCreate, IndividualDisease,
    IndividualDiseaseCreate, IndividualEventCreate, IndividualMarker,
    IndividualMarkerCreate, IndividualMarkerUpdate, IndividualUpdate,
    Manifestation, ManifestationCreate, ManifestationUpdate,
)
from ..store import store

router = APIRouter(prefix="/api/individuals", tags=["individuals"])


@router.post("", response_model=Individual, status_code=201)
def create_individual(body: IndividualCreate | None = None):
    if body is None:
        return store.create_individual()
    diseases = [IndividualDisease(disease_id=d.disease_id) for d in body.diseases]
    markers = [IndividualMarker(**m.model_dump()) for m in body.markers]
    return store.create_individual(
        display_name=body.display_name,
        name=body.name,
        biological_sex=body.biological_sex,
        x=body.x,
        y=body.y,
        notes=body.notes,
        proband=body.proband,
        proband_text=body.proband_text,
        generation=body.generation,
        contacts=body.contacts,
        consent_to_share=body.consent_to_share,
        height_mm=body.height_mm,
        weight_g=body.weight_g,
        alcohol_units_per_week=body.alcohol_units_per_week,
        smoker=body.smoker,
        smoking_per_day=body.smoking_per_day,
        species_id=body.species_id,
        diseases=diseases,
        markers=markers,
        properties=body.properties,
    )


@router.get("", response_model=list[Individual])
def list_individuals():
    return store.list_individuals()


@router.get("/{individual_id}", response_model=Individual)
def get_individual(individual_id: uuid.UUID):
    ind = store.get_individual(individual_id)
    if ind is None:
        raise HTTPException(404, "Individual not found")
    return ind


@router.patch("/{individual_id}", response_model=Individual)
def update_individual(individual_id: uuid.UUID, body: IndividualUpdate):
    ind = store.update_individual(individual_id, **body.model_dump(exclude_unset=True))
    if ind is None:
        raise HTTPException(404, "Individual not found")
    return ind


@router.delete("/{individual_id}", status_code=204)
def delete_individual(individual_id: uuid.UUID):
    if not store.delete_individual(individual_id):
        raise HTTPException(404, "Individual not found")


@router.post("/{individual_id}/events", response_model=Event, status_code=201)
def add_event_to_individual(individual_id: uuid.UUID, body: IndividualEventCreate):
    if store.get_individual(individual_id) is None:
        raise HTTPException(404, "Individual not found")
    event = Event(**body.model_dump())
    result = store.add_event(individual_id, event)
    if result is None:
        raise HTTPException(404, "Individual not found")
    return result


# --- Individual diseases ---


@router.post("/{individual_id}/diseases", response_model=IndividualDisease, status_code=201)
def add_disease_to_individual(individual_id: uuid.UUID, body: IndividualDiseaseCreate):
    result = store.add_disease_to_individual(individual_id, body.disease_id)
    if result is None:
        raise HTTPException(404, "Individual not found")
    return result


@router.delete("/{individual_id}/diseases/{disease_id}", status_code=204)
def remove_disease_from_individual(individual_id: uuid.UUID, disease_id: uuid.UUID):
    if not store.remove_disease_from_individual(individual_id, disease_id):
        raise HTTPException(404, "Individual or disease link not found")


# --- Manifestations ---


@router.post(
    "/{individual_id}/diseases/{disease_id}/manifestations",
    response_model=Manifestation,
    status_code=201,
)
def add_manifestation(individual_id: uuid.UUID, disease_id: uuid.UUID, body: ManifestationCreate):
    manif = Manifestation(**body.model_dump())
    result = store.add_manifestation(individual_id, disease_id, manif)
    if result is None:
        raise HTTPException(404, "Individual or disease not found")
    return result


@router.get(
    "/{individual_id}/diseases/{disease_id}/manifestations",
    response_model=list[Manifestation],
)
def list_manifestations(individual_id: uuid.UUID, disease_id: uuid.UUID):
    result = store.list_manifestations(individual_id, disease_id)
    if result is None:
        raise HTTPException(404, "Individual or disease not found")
    return result


@router.patch(
    "/{individual_id}/diseases/{disease_id}/manifestations/{manif_id}",
    response_model=Manifestation,
)
def update_manifestation(
    individual_id: uuid.UUID, disease_id: uuid.UUID, manif_id: uuid.UUID, body: ManifestationUpdate
):
    result = store.update_manifestation(
        individual_id, disease_id, manif_id, **body.model_dump(exclude_unset=True)
    )
    if result is None:
        raise HTTPException(404, "Manifestation not found")
    return result


@router.delete(
    "/{individual_id}/diseases/{disease_id}/manifestations/{manif_id}",
    status_code=204,
)
def delete_manifestation(individual_id: uuid.UUID, disease_id: uuid.UUID, manif_id: uuid.UUID):
    if not store.delete_manifestation(individual_id, disease_id, manif_id):
        raise HTTPException(404, "Manifestation not found")


# --- Individual markers ---


@router.post("/{individual_id}/markers", response_model=IndividualMarker, status_code=201)
def add_marker_to_individual(individual_id: uuid.UUID, body: IndividualMarkerCreate):
    marker = IndividualMarker(**body.model_dump())
    result = store.add_marker_to_individual(individual_id, marker)
    if result is None:
        raise HTTPException(404, "Individual not found")
    return result


@router.patch("/{individual_id}/markers/{marker_id}", response_model=IndividualMarker)
def update_individual_marker(individual_id: uuid.UUID, marker_id: uuid.UUID, body: IndividualMarkerUpdate):
    result = store.update_individual_marker(
        individual_id, marker_id, **body.model_dump(exclude_unset=True)
    )
    if result is None:
        raise HTTPException(404, "Individual or marker not found")
    return result


@router.delete("/{individual_id}/markers/{marker_id}", status_code=204)
def remove_marker_from_individual(individual_id: uuid.UUID, marker_id: uuid.UUID):
    if not store.remove_marker_from_individual(individual_id, marker_id):
        raise HTTPException(404, "Individual or marker not found")
