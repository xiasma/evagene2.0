from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException

from ..models import TreatmentType, TreatmentTypeCreate, TreatmentTypeUpdate
from ..store import store

router = APIRouter(prefix="/api/treatment-types", tags=["treatment_types"])


@router.post("", response_model=TreatmentType, status_code=201)
def create_treatment_type(body: TreatmentTypeCreate):
    return store.create_treatment_type(
        display_name=body.display_name,
        parent_id=body.parent_id,
        notes=body.notes,
        properties=body.properties,
    )


@router.get("", response_model=list[TreatmentType])
def list_treatment_types():
    return store.list_treatment_types()


@router.get("/{treatment_type_id}", response_model=TreatmentType)
def get_treatment_type(treatment_type_id: uuid.UUID):
    t = store.get_treatment_type(treatment_type_id)
    if t is None:
        raise HTTPException(404, "Treatment type not found")
    return t


@router.patch("/{treatment_type_id}", response_model=TreatmentType)
def update_treatment_type(treatment_type_id: uuid.UUID, body: TreatmentTypeUpdate):
    t = store.update_treatment_type(treatment_type_id, **body.model_dump(exclude_unset=True))
    if t is None:
        raise HTTPException(404, "Treatment type not found")
    return t


@router.delete("/{treatment_type_id}", status_code=204)
def delete_treatment_type(treatment_type_id: uuid.UUID):
    if not store.delete_treatment_type(treatment_type_id):
        raise HTTPException(404, "Treatment type not found")
