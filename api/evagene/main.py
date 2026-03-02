from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .routers import eggs, events, individuals, pedigrees, relationships

app = FastAPI(title="Evagene", description="Pedigree management for clinical and research geneticists")

app.include_router(individuals.router)
app.include_router(relationships.router)
app.include_router(events.router)
app.include_router(pedigrees.router)
app.include_router(eggs.router)


static_dir = Path(__file__).parent / "static"
app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
