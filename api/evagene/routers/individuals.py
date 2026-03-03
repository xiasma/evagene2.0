from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException

from ..models import Event, Individual, IndividualCreate, IndividualEventCreate, IndividualUpdate
from ..store import store

router = APIRouter(prefix="/api/individuals", tags=["individuals"])


@router.post("", response_model=Individual, status_code=201)
def create_individual(body: IndividualCreate | None = None):
    if body is None:
        return store.create_individual()
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
