from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException

from ..models import Chromosome, ChromosomeCreate, ChromosomeUpdate
from ..store import store

router = APIRouter(prefix="/api/chromosomes", tags=["chromosomes"])


@router.post("", response_model=Chromosome, status_code=201)
def create_chromosome(body: ChromosomeCreate):
    return store.create_chromosome(
        display_name=body.display_name,
        base_pairs=body.base_pairs,
        source=body.source,
        autosome=body.autosome,
        notes=body.notes,
        properties=body.properties,
    )


@router.get("", response_model=list[Chromosome])
def list_chromosomes():
    return store.list_chromosomes()


@router.get("/{chromosome_id}", response_model=Chromosome)
def get_chromosome(chromosome_id: uuid.UUID):
    ch = store.get_chromosome(chromosome_id)
    if ch is None:
        raise HTTPException(404, "Chromosome not found")
    return ch


@router.patch("/{chromosome_id}", response_model=Chromosome)
def update_chromosome(chromosome_id: uuid.UUID, body: ChromosomeUpdate):
    ch = store.update_chromosome(chromosome_id, **body.model_dump(exclude_unset=True))
    if ch is None:
        raise HTTPException(404, "Chromosome not found")
    return ch


@router.delete("/{chromosome_id}", status_code=204)
def delete_chromosome(chromosome_id: uuid.UUID):
    if not store.delete_chromosome(chromosome_id):
        raise HTTPException(404, "Chromosome not found")


@router.post("/{chromosome_id}/markers/{marker_id}", status_code=204)
def add_marker_to_chromosome(chromosome_id: uuid.UUID, marker_id: uuid.UUID):
    if store.get_chromosome(chromosome_id) is None:
        raise HTTPException(404, "Chromosome not found")
    if store.get_marker(marker_id) is None:
        raise HTTPException(404, "Marker not found")
    store.add_marker_to_chromosome(chromosome_id, marker_id)


@router.delete("/{chromosome_id}/markers/{marker_id}", status_code=204)
def remove_marker_from_chromosome(chromosome_id: uuid.UUID, marker_id: uuid.UUID):
    if not store.remove_marker_from_chromosome(chromosome_id, marker_id):
        raise HTTPException(404, "Chromosome or marker link not found")
