from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException

from ..models import Marker, MarkerCreate, MarkerUpdate
from ..store import store

router = APIRouter(prefix="/api/markers", tags=["markers"])


@router.post("", response_model=Marker, status_code=201)
def create_marker(body: MarkerCreate):
    return store.create_marker(**body.model_dump())


@router.get("", response_model=list[Marker])
def list_markers():
    return store.list_markers()


@router.get("/{marker_id}", response_model=Marker)
def get_marker(marker_id: uuid.UUID):
    m = store.get_marker(marker_id)
    if m is None:
        raise HTTPException(404, "Marker not found")
    return m


@router.patch("/{marker_id}", response_model=Marker)
def update_marker(marker_id: uuid.UUID, body: MarkerUpdate):
    m = store.update_marker(marker_id, **body.model_dump(exclude_unset=True))
    if m is None:
        raise HTTPException(404, "Marker not found")
    return m


@router.delete("/{marker_id}", status_code=204)
def delete_marker(marker_id: uuid.UUID):
    if not store.delete_marker(marker_id):
        raise HTTPException(404, "Marker not found")
