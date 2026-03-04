from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException

from ..models import Disease, DiseaseCreate, DiseaseUpdate
from ..store import store

router = APIRouter(prefix="/api/diseases", tags=["diseases"])


@router.post("", response_model=Disease, status_code=201)
def create_disease(body: DiseaseCreate):
    return store.create_disease(
        display_name=body.display_name,
        color=body.color,
        notes=body.notes,
        properties=body.properties,
    )


@router.get("", response_model=list[Disease])
def list_diseases():
    return store.list_diseases()


@router.get("/{disease_id}", response_model=Disease)
def get_disease(disease_id: uuid.UUID):
    d = store.get_disease(disease_id)
    if d is None:
        raise HTTPException(404, "Disease not found")
    return d


@router.patch("/{disease_id}", response_model=Disease)
def update_disease(disease_id: uuid.UUID, body: DiseaseUpdate):
    d = store.update_disease(disease_id, **body.model_dump(exclude_unset=True))
    if d is None:
        raise HTTPException(404, "Disease not found")
    return d


@router.delete("/{disease_id}", status_code=204)
def delete_disease(disease_id: uuid.UUID):
    if not store.delete_disease(disease_id):
        raise HTTPException(404, "Disease not found")


@router.post("/{disease_id}/markers/{marker_id}", status_code=204)
def add_marker_to_disease(disease_id: uuid.UUID, marker_id: uuid.UUID):
    if store.get_disease(disease_id) is None:
        raise HTTPException(404, "Disease not found")
    if store.get_marker(marker_id) is None:
        raise HTTPException(404, "Marker not found")
    store.add_marker_to_disease(disease_id, marker_id)


@router.delete("/{disease_id}/markers/{marker_id}", status_code=204)
def remove_marker_from_disease(disease_id: uuid.UUID, marker_id: uuid.UUID):
    if not store.remove_marker_from_disease(disease_id, marker_id):
        raise HTTPException(404, "Disease or marker link not found")
