from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException

from ..models import Event, Relationship, RelationshipCreate, RelationshipEventCreate
from ..store import store

router = APIRouter(prefix="/api/relationships", tags=["relationships"])


@router.post("", response_model=Relationship, status_code=201)
def create_relationship(body: RelationshipCreate):
    return store.create_relationship(
        members=body.members,
        display_name=body.display_name,
        notes=body.notes,
        properties=body.properties,
    )


@router.get("", response_model=list[Relationship])
def list_relationships():
    return store.list_relationships()


@router.get("/{relationship_id}", response_model=Relationship)
def get_relationship(relationship_id: uuid.UUID):
    rel = store.get_relationship(relationship_id)
    if rel is None:
        raise HTTPException(404, "Relationship not found")
    return rel


@router.delete("/{relationship_id}", status_code=204)
def delete_relationship(relationship_id: uuid.UUID):
    if not store.delete_relationship(relationship_id):
        raise HTTPException(404, "Relationship not found")


@router.post("/{relationship_id}/members/{individual_id}", status_code=204)
def add_member(relationship_id: uuid.UUID, individual_id: uuid.UUID):
    if not store.add_member(relationship_id, individual_id):
        raise HTTPException(404, "Relationship not found")


@router.delete("/{relationship_id}/members/{individual_id}", status_code=204)
def remove_member(relationship_id: uuid.UUID, individual_id: uuid.UUID):
    if not store.remove_member(relationship_id, individual_id):
        raise HTTPException(404, "Relationship or member not found")


@router.post("/{relationship_id}/events", response_model=Event, status_code=201)
def add_event_to_relationship(relationship_id: uuid.UUID, body: RelationshipEventCreate):
    if store.get_relationship(relationship_id) is None:
        raise HTTPException(404, "Relationship not found")
    event = Event(**body.model_dump())
    result = store.add_event(relationship_id, event)
    if result is None:
        raise HTTPException(404, "Relationship not found")
    return result
