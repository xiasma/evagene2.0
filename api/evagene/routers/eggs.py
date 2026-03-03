from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException

from ..models import Egg, EggCreate, Event, EventCreate
from ..store import store

router = APIRouter(prefix="/api/eggs", tags=["eggs"])


@router.post("", response_model=Egg, status_code=201)
def create_egg(body: EggCreate):
    return store.create_egg(
        display_name=body.display_name,
        notes=body.notes,
        properties=body.properties,
        individual_id=body.individual_id,
    )


@router.get("", response_model=list[Egg])
def list_eggs():
    return store.list_eggs()


@router.get("/{egg_id}", response_model=Egg)
def get_egg(egg_id: uuid.UUID):
    egg = store.get_egg(egg_id)
    if egg is None:
        raise HTTPException(404, "Egg not found")
    return egg


@router.delete("/{egg_id}", status_code=204)
def delete_egg(egg_id: uuid.UUID):
    if not store.delete_egg(egg_id):
        raise HTTPException(404, "Egg not found")


@router.post("/{egg_id}/events", response_model=Event, status_code=201)
def add_event_to_egg(egg_id: uuid.UUID, body: EventCreate):
    if store.get_egg(egg_id) is None:
        raise HTTPException(404, "Egg not found")
    event = Event(**body.model_dump())
    result = store.add_event(egg_id, event)
    if result is None:
        raise HTTPException(404, "Egg not found")
    return result
