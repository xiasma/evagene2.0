# Technical Architecture

## System overview

Evagene is a two-tier application: a Python REST API backend and a TypeScript canvas-based frontend. They communicate over HTTP/JSON and run as separate processes during development, with Vite proxying API requests from the UI dev server.

```
Browser (localhost:5173)
  │
  ├── /pedigrees/* ──→ index.html (SPA fallback)
  ├── /inspect/*   ──→ inspect.html (SPA fallback)
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
  └── Egg[]           (offspring links: relationship → child(ren))
```

Each entity can have **Events** attached (birth, death, diagnosis, marriage, etc.) and a free-form **properties** dict for extensibility.

### Entity relationships

- A **Pedigree** is a container holding references (by UUID) to individuals, relationships, and eggs
- A **Relationship** has a `members[]` list of individual UUIDs (typically 1–2)
- An **Egg** links a `relationship_id` to child individual(s), representing parentage:
  - `individual_id` — single child (normal case)
  - `individual_ids` — multiple children sharing one egg (monozygotic twins)
- **Events** are owned by a single entity (individual, relationship, egg, or pedigree) and tracked via an index in the store

### Twin model

Twins are represented through egg properties:

- `twin: true` — marks an egg as part of a twin pair (rendered as chevron arms)
- `twin_group: string` — groups eggs into distinct twin pairs within the same relationship (each group renders as a separate chevron)
- `monozygotic: true` — marks twins as identical. Monozygotic twins share a single egg entity via `individual_ids` (one egg maps to multiple children). Dizygotic twins have separate eggs with the same `twin_group`.

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

All mutations are synchronous dict operations. Cascade logic ensures that deleting an individual removes it from any pedigrees that reference it. The `update_egg` method applies all fields (including `None`) since the router uses `exclude_unset=True`, allowing explicit null assignment.

### API patterns

- **Create** (POST) — accepts a `*Create` schema, returns the full entity
- **Read** (GET) — returns the entity or 404
- **Update** (PATCH) — accepts a `*Update` schema with all-optional fields, merges into existing entity
- **Delete** (DELETE) — removes from store and all pedigree references, returns 204
- **Pedigree detail** (GET `/api/pedigrees/{id}`) — resolves all UUID references into full entity objects, returns `PedigreeDetail`
- **GEDCOM export** (GET `/api/pedigrees/{id}/export.ged`) — serializes the pedigree to GEDCOM 5.5.1 text. Supports `?ids=` query param for selection-only export
- **GEDCOM import** (POST `/api/pedigrees/{id}/import/gedcom`) — parses GEDCOM text; `?mode=parse` returns parsed entities without modifying the pedigree
- **XEG import** (POST `/api/pedigrees/{id}/import/xeg`) — parses Evagene v1 .xeg XML; `?mode=parse` returns parsed entities without modifying the pedigree

## Frontend architecture

### Stack

- **TypeScript** — strict mode, ES2020 target
- **HTML5 Canvas** — all rendering done via 2D context
- **Vite** — dev server with HMR, TypeScript compilation, production bundling, multi-page build

### Module layout

```
ui/src/
  main.ts              App entry, canvas setup, event handling, state management
  symbols.ts           Pedigree symbol drawing (4-layer system)
  recognise.ts         Freehand gesture recognition (circle/square/diamond)
  panel.ts             Individual properties editor (floating window)
  panel-relationship.ts  Relationship properties editor
  panel.css            Panel styling
  style.css            Global styles (light/dark mode)
  inspect.ts           Inspector page (blade UI)
  inspect.css          Inspector styling
```

### Multi-page build

`vite.config.ts` defines two entry points (`index.html`, `inspect.html`) and a custom `spaFallback()` plugin that rewrites `/pedigrees/*` to `index.html` and `/inspect/*` to `inspect.html` during development.

### Rendering pipeline

`render()` clears the canvas, applies the zoom/pan transform (`translate` + `scale`), then draws:

1. **Grid** — visible-area grid lines in world coordinates (when snap-to-grid is enabled)
2. **Relationship lines** — horizontal lines between coupled individuals
3. **Parental lines** — eggs grouped by relationship, then by twin_group:
   - **Regular eggs**: horizontal sibling bar + vertical drops to children
   - **Twin groups** (`twin_group` property): separate chevron per group from bar or origin to children
   - **Monozygotic twins** (`monozygotic` property): chevron with horizontal crossbar (A-shape)
4. **Individual symbols** — calls `drawIndividual()` from `symbols.ts` (4-layer system: base shape → affection → mortality → fertility)
5. **Highlights** — hover and selection highlights (cyan glow, 3px selected stroke)
6. **Find highlights** — search result indicators
7. **Floating notes** — text annotations at arbitrary positions

### Interaction model

Pointer events on the canvas follow a priority chain:

1. **Hit relationship line** → start parental line drawing
2. **Hit bottom of individual** → start parental line from parent
3. **Hit top of individual** → start parental line from child
4. **Hit side of individual** → start connection drawing
5. **Hit individual body** → drag (or single-click to open properties panel)
6. **Hit nothing** → freehand drawing (shape recognition or lasso selection)

Ctrl/Shift modifiers enable extended selection (multi-select on click, additive lasso).

### Zoom and pan

- **Scroll wheel** — zooms towards the cursor position
- **Pinch-to-zoom** — two-finger touch gesture zooms towards the midpoint
- **Space+drag** — pans the canvas (grab cursor feedback)
- **Middle-click drag** — pans the canvas
- **Toolbar buttons** — zoom in (+), zoom out (−), reset (1:1)

All pointer coordinates are converted from screen space to world space via `screenToWorld()`, so all hit-testing and drawing logic works in world coordinates regardless of zoom level.

### File I/O

The toolbar provides file operations with modal dialogs:

- **Save** — downloads the full pedigree detail as JSON. If individuals are selected, offers "Selection only" or "Whole pedigree"
- **Load** — reads a JSON file with choice of "Replace" or "Add to pedigree"
- **Export .ged** — same selection options as Save
- **Import .ged** / **Import .xeg** — "Replace" or "Add to pedigree" modes (Add uses `?mode=parse` to get entities without server-side modification)

GEDCOM round-trip fidelity is maintained through custom underscore-prefixed tags (`_X`, `_Y`, `_PROBAND`, `_AFFECTION`, `_FERTILITY`, `_DEATH_STATUS`, `_TWIN`, `_MONOZYGOTIC`) that preserve Evagene-specific data.

### Properties panel

`panel.ts` creates a floating, draggable window with form fields organised into sections (Identity, Clinical, Dates, Notes, Contact). `panel-relationship.ts` provides the equivalent for relationships. New elements auto-select and focus the display name input.

Field changes are sent to the API:

- **Dropdowns/checkboxes** — fire immediately on change
- **Text inputs** — debounced at 500ms
- **Status fields** (death, affection, fertility) — stored in the individual's `properties` dict, requiring a read-merge-write pattern
- **Contact fields** — stored in `contacts.self` as VCard-style phone/email arrays

### State management

All state lives in module-level variables in `main.ts`:

- `pedigreeId` — current working pedigree
- `individuals`, `relationships`, `eggs` — arrays refreshed from API after every mutation. Eggs with `individual_ids` are expanded into virtual per-child entries for rendering.
- `selectedIds` — multi-selection (Ctrl/Shift+click, lasso)
- `selectedIndividualId` — single-click selection for the properties panel
- `selectedElement` — currently selected connection/line element (for delete, highlight)
- Drawing/dragging/connecting/panning flags for the interaction state machine
- `siblingBarOffsets`, `chevronApexOffsets` — user-adjusted positions for sibling bars and chevron apexes

After any mutation (create, move, edit properties), the app calls `refreshState()` to re-fetch the full pedigree detail from the API, then `render()` to redraw.

### Inspector

The inspector (`/inspect/:id`) is a separate page that provides a read-only debug view of pedigree data using an Azure Portal-style blade UI. Clicking entities opens detail blades to the right. Features:

- **Overview blade** — lists all individuals, relationships, eggs, pregnancies (grouped by relationship and twin group), and integrity checks
- **Entity blades** — show full details with clickable cross-references
- **Pregnancy grouping** — eggs grouped by twin_group with DZ/MZ labels, shared egg indicators for monozygotic twins
- **Integrity checks** — validates referential integrity across all entities
