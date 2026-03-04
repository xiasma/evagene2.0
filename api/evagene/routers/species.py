from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException

from ..models import Species, SpeciesCreate, SpeciesUpdate
from ..store import store

router = APIRouter(prefix="/api/species", tags=["species"])


@router.post("", response_model=Species, status_code=201)
def create_species(body: SpeciesCreate):
    return store.create_species(
        display_name=body.display_name,
        ploidy=body.ploidy,
        notes=body.notes,
        properties=body.properties,
    )


@router.get("", response_model=list[Species])
def list_species():
    return store.list_species()


@router.get("/{species_id}", response_model=Species)
def get_species(species_id: uuid.UUID):
    sp = store.get_species(species_id)
    if sp is None:
        raise HTTPException(404, "Species not found")
    return sp


@router.patch("/{species_id}", response_model=Species)
def update_species(species_id: uuid.UUID, body: SpeciesUpdate):
    sp = store.update_species(species_id, **body.model_dump(exclude_unset=True))
    if sp is None:
        raise HTTPException(404, "Species not found")
    return sp


@router.delete("/{species_id}", status_code=204)
def delete_species(species_id: uuid.UUID):
    if not store.delete_species(species_id):
        raise HTTPException(404, "Species not found")


@router.post("/{species_id}/chromosomes/{chr_id}", status_code=204)
def add_chromosome_to_species(species_id: uuid.UUID, chr_id: uuid.UUID):
    if store.get_species(species_id) is None:
        raise HTTPException(404, "Species not found")
    if store.get_chromosome(chr_id) is None:
        raise HTTPException(404, "Chromosome not found")
    store.add_chromosome_to_species(species_id, chr_id)


@router.delete("/{species_id}/chromosomes/{chr_id}", status_code=204)
def remove_chromosome_from_species(species_id: uuid.UUID, chr_id: uuid.UUID):
    if not store.remove_chromosome_from_species(species_id, chr_id):
        raise HTTPException(404, "Species or chromosome link not found")
