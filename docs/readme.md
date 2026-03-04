# Evagene

Evagene is a pedigree management system for clinical and research geneticists. It provides an interactive canvas-based editor where users draw shapes to create individuals, connect them to form relationships, and annotate them with clinical data — all rendered using standard pedigree notation.

## What it does

- **Draw to create**: Freehand-draw a circle (female), square (male), or diamond (unknown sex) on the canvas to create an individual
- **Connect individuals**: Draw a line between two shapes to create a relationship (marriage/partnership)
- **Parent-child lines**: Draw from a relationship line or parent to a child to establish parentage
- **Lasso select**: Draw a closed loop around multiple individuals to select and drag them as a group
- **Properties editor**: Click any individual to open a floating, draggable panel for editing identity, clinical status, dates, notes, and contact information
- **Pedigree symbols**: Individuals render with standard genetic pedigree notation — affection status (filled/carrier/heterozygous), mortality (diagonal slash, X, text labels), and fertility indicators (crossbars)
- **Save/Load**: Save and load pedigrees as JSON files for local storage
- **GEDCOM import/export**: Interoperate with genealogy software via GEDCOM 5.5.1 format
- **XEG import**: Import legacy pedigrees from Evagene v1 (.xeg XML format)
- **Zoom and pan**: Scroll wheel zoom, pinch-to-zoom on touch, toolbar buttons, and middle-click/Ctrl+click panning

## Project structure

```
evagene/
  api/          Python FastAPI backend (in-memory data store)
  ui/           TypeScript + Vite frontend (HTML5 Canvas)
  docs/         Solution-level documentation (this folder)
```

## Technology stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, Uvicorn, Pydantic |
| Frontend | TypeScript, HTML5 Canvas, Vite |
| Testing | pytest (API), Vitest (UI) |
| Data | In-memory store (no database) |

## Documentation

- [Getting started](getting_started.md) — installation, setup, and running the application
- [Technical architecture](architecture.md) — system design, data model, and implementation details
- [API documentation](../api/docs/readme.md) — backend overview
- [API architecture](../api/docs/architecture.md) — backend technical details
- [UI documentation](../ui/docs/readme.md) — frontend overview
- [UI architecture](../ui/docs/architecture.md) — frontend technical details
