from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException

from ..models import Ethnicity, EthnicityCreate, EthnicityUpdate
from ..store import store

router = APIRouter(prefix="/api/ethnicities", tags=["ethnicities"])


@router.post("", response_model=Ethnicity, status_code=201)
def create_ethnicity(body: EthnicityCreate):
    return store.create_ethnicity(
        display_name=body.display_name,
        parent_id=body.parent_id,
        notes=body.notes,
        properties=body.properties,
    )


@router.get("", response_model=list[Ethnicity])
def list_ethnicities():
    return store.list_ethnicities()


@router.get("/{ethnicity_id}", response_model=Ethnicity)
def get_ethnicity(ethnicity_id: uuid.UUID):
    e = store.get_ethnicity(ethnicity_id)
    if e is None:
        raise HTTPException(404, "Ethnicity not found")
    return e


@router.patch("/{ethnicity_id}", response_model=Ethnicity)
def update_ethnicity(ethnicity_id: uuid.UUID, body: EthnicityUpdate):
    e = store.update_ethnicity(ethnicity_id, **body.model_dump(exclude_unset=True))
    if e is None:
        raise HTTPException(404, "Ethnicity not found")
    return e


@router.delete("/{ethnicity_id}", status_code=204)
def delete_ethnicity(ethnicity_id: uuid.UUID):
    if not store.delete_ethnicity(ethnicity_id):
        raise HTTPException(404, "Ethnicity not found")
