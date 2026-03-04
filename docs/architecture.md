# Technical Architecture

## System overview

Evagene is a two-tier application: a Python REST API backend and a TypeScript canvas-based frontend. They communicate over HTTP/JSON and run as separate processes during development, with Vite proxying API requests from the UI dev server.

```
Browser (localhost:5173)
  │
  ├── Static assets ──→ Vite dev server
  │
  └── /api/* ──proxy──→ FastAPI (localhost:8000)
                           │
                           └── In-memory Store
```

## Data model

The domain is built around five core entities:

```
Pedigree
  ├── Individual[]    (people in the pedigree)
  ├── Relationship[]  (connections between individuals)
  └── Egg[]           (offspring links: relationship → child)
```

Each entity can have **Events** attached (birth, death, diagnosis, marriage, etc.) and a free-form **properties** dict for extensibility.

### Entity relationships

- A **Pedigree** is a container holding references (by UUID) to individuals, relationships, and eggs
- A **Relationship** has a `members[]` list of individual UUIDs (typically 1–2)
- An **Egg** links a `relationship_id` to an `individual_id`, representing parentage
- **Events** are owned by a single entity (individual, relationship, egg, or pedigree) and tracked via an index in the store

### Key enums

| Enum | Values |
|------|--------|
| BiologicalSex | female, male, unknown, ambiguous_female, ambiguous_male, intersex, none, other |
| DeathStatus | alive, unknown, dead, suicide_confirmed, suicide_unconfirmed, spontaneous_abortion, therapeutic_abortion, neonatal_death, stillborn, lived_one_day, pregnancy, other |
| AffectionStatus | unknown, clear, affected, possible_affection, heterozygous, affected_by_hearsay, carrier, examined, untested, immune, presymptomatic, other |
| FertilityStatus | unknown, fertile, infertile, infertile_by_choice, other |

These enums are defined in `api/evagene/models.py` and drive the symbol rendering in `ui/src/symbols.ts`.

## Backend architecture

### Stack

- **FastAPI** — async REST framework with automatic OpenAPI spec generation
- **Pydantic** — data validation, serialisation, and schema definition
- **Uvicorn** — ASGI server
- **In-memory store** — no database; data lives for the duration of the server process

### Module layout

```
api/evagene/
  main.py       App factory, router mounting
  models.py     Pydantic models + enums (~100 models/schemas)
  store.py      In-memory CRUD store with event indexing
  gedcom.py     GEDCOM 5.5.1 parser and serializer
  xeg.py        Evagene v1 .xeg XML parser
  routers/
    individuals.py
    relationships.py
    events.py
    pedigrees.py
    eggs.py
```

### Store design

`Store` is a singleton holding four dicts (`_individuals`, `_relationships`, `_eggs`, `_pedigrees`) keyed by UUID, plus an `_event_index` mapping event UUIDs to `(owner_id, list_index)` tuples for O(1) event lookups.

All mutations are synchronous dict operations. Cascade logic ensures that deleting an individual removes it from any pedigrees that reference it.

### API patterns

- **Create** (POST) — accepts a `*Create` schema, returns the full entity
- **Read** (GET) — returns the entity or 404
- **Update** (PATCH) — accepts a `*Update` schema with all-optional fields, merges into existing entity
- **Delete** (DELETE) — removes from store and all pedigree references, returns 204
- **Pedigree detail** (GET `/api/pedigrees/{id}`) — resolves all UUID references into full entity objects, returns `PedigreeDetail`
- **GEDCOM export** (GET `/api/pedigrees/{id}/export.ged`) — serializes the pedigree to GEDCOM 5.5.1 text
- **GEDCOM import** (POST `/api/pedigrees/{id}/import/gedcom`) — parses GEDCOM text and replaces the pedigree's entities
- **XEG import** (POST `/api/pedigrees/{id}/import/xeg`) — parses Evagene v1 .xeg XML and replaces the pedigree's entities

## Frontend architecture

### Stack

- **TypeScript** — strict mode, ES2020 target
- **HTML5 Canvas** — all rendering done via 2D context
- **Vite** — dev server with HMR, TypeScript compilation, production bundling

### Module layout

```
ui/src/
  main.ts        App entry, canvas setup, event handling, state management
  symbols.ts     Pedigree symbol drawing (4-layer system)
  recognise.ts   Freehand gesture recognition (circle/square/diamond)
  panel.ts       Floating properties editor (DOM, events, API calls)
  panel.css      Panel styling
  style.css      Global styles
```

### Rendering pipeline

`render()` clears the canvas, applies the zoom/pan transform (`translate` + `scale`), then draws three layers:

1. **Grid** — visible-area grid lines in world coordinates (when snap-to-grid is enabled)
2. **Relationship lines** — horizontal lines between coupled individuals
3. **Parental lines** — orthogonal paths from relationship midpoints (or single parents) down to children, via eggs
4. **Individual symbols** — calls `drawIndividual()` from `symbols.ts` which renders 4 sub-layers:
   - Base shape (circle/square/diamond/triangle, with dashed variants)
   - Affection overlay (fill, clip, inner circle, text markers)
   - Mortality overlay (diagonal lines, text labels)
   - Fertility indicator (stem + crossbars)

### Gesture recognition

`recognise.ts` classifies freehand strokes:

1. Resample the point array to 64 evenly-spaced points
2. Compute circularity (coefficient of variation of distances from centroid)
3. If circular enough → **circle**
4. Otherwise, detect corners via turning angle threshold
5. 4 corners with high closure → **square** or **diamond** (based on orientation)
6. Anything else → **unrecognised**

### Interaction model

Pointer events on the canvas follow a priority chain:

1. **Hit relationship line** → start parental line drawing
2. **Hit bottom of individual** → start parental line from parent
3. **Hit top of individual** → start parental line from child
4. **Hit side of individual** → start connection drawing
5. **Hit individual body** → drag (or single-click to open properties panel)
6. **Hit nothing** → freehand drawing (shape recognition or lasso selection)

A `pointerMoved` flag distinguishes clicks from drags: if the pointer doesn't move between down and up, it's a click that opens the properties panel.

### Zoom and pan

The canvas supports zoom and pan via a `zoomScale` / `panX` / `panY` transform applied in `render()`:

- **Scroll wheel** — zooms towards the cursor position
- **Pinch-to-zoom** — two-finger touch gesture zooms towards the midpoint
- **Middle-click or Ctrl+click drag** — pans the canvas
- **Toolbar buttons** — zoom in (+), zoom out (−), reset (1:1)

All pointer coordinates are converted from screen space to world space via `screenToWorld()`, so all hit-testing and drawing logic works in world coordinates regardless of zoom level.

### File I/O

The toolbar provides four file operations:

- **Save** — downloads the full pedigree detail as a JSON file (client-side)
- **Load** — reads a JSON file, pushes an undo snapshot, then restores the pedigree via the API
- **Export .ged** — fetches GEDCOM 5.5.1 text from `GET /api/pedigrees/{id}/export.ged` and downloads it
- **Import .ged** — reads a GEDCOM file, pushes an undo snapshot, then posts it to `POST /api/pedigrees/{id}/import/gedcom`
- **Import .xeg** — reads an Evagene v1 XML file, pushes an undo snapshot, then posts it to `POST /api/pedigrees/{id}/import/xeg`

GEDCOM round-trip fidelity is maintained through custom underscore-prefixed tags (`_X`, `_Y`, `_PROBAND`, `_AFFECTION`, `_FERTILITY`, `_DEATH_STATUS`, `_TWIN`, `_MONOZYGOTIC`) that preserve Evagene-specific data.

### Properties panel

`panel.ts` creates a floating, draggable window with form fields organised into sections (Identity, Clinical, Dates, Notes, Contact). Field changes are sent to the API:

- **Dropdowns/checkboxes** — fire immediately on change
- **Text inputs** — debounced at 500ms
- **Status fields** (death, affection, fertility) — stored in the individual's `properties` dict, requiring a read-merge-write pattern
- **Contact fields** — stored in `contacts.self` as VCard-style phone/email arrays

### State management

All state lives in module-level variables in `main.ts`:

- `pedigreeId` — current working pedigree
- `individuals`, `relationships`, `eggs` — arrays refreshed from API after every mutation
- `selectedIds` — lasso multi-selection
- `selectedIndividualId` — single-click selection for the properties panel
- Drawing/dragging/connecting flags for the interaction state machine

After any mutation (create, move, edit properties), the app calls `refreshState()` to re-fetch the full pedigree detail from the API, then `render()` to redraw.
