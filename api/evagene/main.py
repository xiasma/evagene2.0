from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .routers import (
    chromosomes, diseases, eggs, ethnicities, events, individuals, markers,
    pedigrees, relationships, risk, species, treatment_types,
)

app = FastAPI(title="Evagene", description="Pedigree management for clinical and research geneticists")

app.include_router(individuals.router)
app.include_router(relationships.router)
app.include_router(events.router)
app.include_router(pedigrees.router)
app.include_router(eggs.router)
app.include_router(species.router)
app.include_router(chromosomes.router)
app.include_router(markers.router)
app.include_router(diseases.router)
app.include_router(ethnicities.router)
app.include_router(treatment_types.router)
app.include_router(risk.router)


static_dir = Path(__file__).parent / "static"
app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
