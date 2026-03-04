from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException

from ..models import Event, EventCreate, Pedigree, PedigreeCreate, PedigreeDetail, PedigreeRestoreBody, PedigreeUpdate
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


@router.delete("/{pedigree_id}/eggs/{egg_id}", status_code=204)
def remove_egg_from_pedigree(pedigree_id: uuid.UUID, egg_id: uuid.UUID):
    if not store.remove_egg_from_pedigree(pedigree_id, egg_id):
        raise HTTPException(404, "Pedigree or egg not found")
