from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException

from ..models import EntityReference, EntityReferenceCreate, Event, EventUpdate
from ..store import store

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("/{event_id}", response_model=Event)
def get_event(event_id: uuid.UUID):
    ev = store.get_event(event_id)
    if ev is None:
        raise HTTPException(404, "Event not found")
    return ev


@router.patch("/{event_id}", response_model=Event)
def update_event(event_id: uuid.UUID, body: EventUpdate):
    ev = store.update_event(event_id, **body.model_dump(exclude_unset=True))
    if ev is None:
        raise HTTPException(404, "Event not found")
    return ev


@router.delete("/{event_id}", status_code=204)
def delete_event(event_id: uuid.UUID):
    if not store.delete_event(event_id):
        raise HTTPException(404, "Event not found")


@router.post("/{event_id}/references", response_model=Event, status_code=201)
def add_reference(event_id: uuid.UUID, body: EntityReferenceCreate):
    ev = store.get_event(event_id)
    if ev is None:
        raise HTTPException(404, "Event not found")
    ev.entity_references.append(EntityReference(**body.model_dump()))
    return ev


@router.delete("/{event_id}/references/{ref_index}", response_model=Event)
def remove_reference(event_id: uuid.UUID, ref_index: int):
    ev = store.get_event(event_id)
    if ev is None:
        raise HTTPException(404, "Event not found")
    if ref_index < 0 or ref_index >= len(ev.entity_references):
        raise HTTPException(404, "Reference index out of range")
    ev.entity_references.pop(ref_index)
    return ev
