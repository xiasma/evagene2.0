# Evagene

Evagene is a pedigree management system for clinical and research geneticists. It provides an interactive canvas-based editor where users draw shapes to create individuals, connect them to form relationships, and annotate them with clinical data — all rendered using standard pedigree notation.

## What it does

- **Draw to create**: Freehand-draw a circle (female), square (male), or diamond (unknown sex) on the canvas to create an individual
- **Keyboard shortcuts**: Press `m`/`f`/`u` to add individuals, `p` for partner/marriage, `d` for disease palette, `n` for notes, `Delete` to remove, `Ctrl+A` to select all, `F2` to edit name
- **Connect individuals**: Draw a line between two shapes to create a relationship (marriage/partnership)
- **Parent-child lines**: Draw from a relationship line or parent to a child to establish parentage
- **Twin groups**: Draw a chevron (V-shape) between siblings to create dizygotic twins; draw a horizontal bar across chevron arms for monozygotic twins. Multiple twin pairs render as separate chevrons. Monozygotic twins share a single egg entity.
- **Selection**: Click to select, Ctrl/Shift+click for multi-select, lasso to select groups, lasso with Ctrl/Shift to add to selection
- **Properties editor**: Click any individual or relationship to open a floating, draggable panel for editing identity, clinical status, dates, notes, and contact information
- **Pedigree symbols**: Individuals render with standard genetic pedigree notation — affection status (filled/carrier/heterozygous), mortality (diagonal slash, X, text labels), fertility indicators (crossbars), and disease pie sectors
- **URL routing**: Each pedigree has a permanent URL (`/pedigrees/:id`) for direct access
- **Inspector**: Debug/explore pedigree data at `/inspect/:id` with an Azure Portal-style blade UI showing entities, pregnancies, twin groups, and integrity checks
- **Save/Load**: Save and load pedigrees as JSON files, with options to replace or add to the current pedigree, and to export selection only or the whole pedigree
- **GEDCOM import/export**: Interoperate with genealogy software via GEDCOM 5.5.1 format
- **XEG import**: Import legacy pedigrees from Evagene v1 (.xeg XML format)
- **Zoom and pan**: Scroll wheel zoom, pinch-to-zoom on touch, toolbar buttons, and Space+drag panning

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
