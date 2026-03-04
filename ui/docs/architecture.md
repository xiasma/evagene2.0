# UI Technical Architecture

## Module structure

```
ui/src/
  main.ts        Application entry, canvas, event handling, state
  symbols.ts     Pedigree symbol rendering (4-layer system)
  recognise.ts   Freehand gesture recognition
  panel.ts       Floating properties editor panel
  panel.css      Panel styling
  style.css      Global styles
```

## Build tooling

- **Vite** — dev server with HMR, TypeScript compilation, production bundler
- **TypeScript** — strict mode, ES2020 target, bundler module resolution
- **Vitest** — unit test runner (compatible with Vite's transform pipeline)
- **Proxy**: Vite forwards `/api/*` to `http://localhost:8000` during development (`vite.config.ts`)

## Application entry (`main.ts`)

### Initialisation flow

1. Inject HTML into `#app` (heading, canvas, sidebar container, toast)
2. Set up canvas sizing (DPR-aware) with resize listener
3. POST to create a working pedigree
4. Initialise the properties panel with callbacks
5. Attach pointer event handlers to the canvas

### State management

All state is module-level variables — no framework, no store library:

```
pedigreeId          Current pedigree UUID
individuals[]       Placed individuals (from API)
relationships[]     Relationships (from API)
eggs[]              Offspring links (from API)
selectedIds         Set<string> — lasso multi-selection
selectedIndividualId  string | null — single-click selection
drawing/dragging/connecting/drawingParentalLine/panning  — interaction flags
points[]            Current stroke points
zoomScale           Current zoom level (default 1, range 0.1–5)
panX, panY          Canvas pan offset in screen pixels
```

After every mutation (create, move, edit), `refreshState()` fetches the full `PedigreeDetail` from the API and `render()` redraws the canvas. This keeps the UI in sync without local state diffing.

### Interaction state machine

Pointer events follow a priority chain on `pointerdown`:

```
pointerdown
  ├─ Middle-click or Ctrl+click? → pan mode (screen-space drag)
  ├─ Hit parental line?      → sibling mode (add child to same relationship)
  ├─ Hit relationship line?  → parental line mode
  ├─ Hit bottom of shape?    → parental line from parent
  ├─ Hit top of shape?       → parental line from child
  ├─ Hit side of shape?      → connection drawing mode
  ├─ Hit shape body?
  │   ├─ Already selected?   → group drag
  │   └─ Not selected?       → single drag (track for click detection)
  └─ Hit nothing?            → freehand drawing mode

pointermove
  → set pointerMoved = true
  → update drag positions or extend freehand stroke

pointerup
  ├─ !pointerMoved && clickHitId?  → single click → open panel
  ├─ Dragging?                      → persist positions via PATCH
  ├─ Parental line (child source)?
  │   ├─ Endpoint hits top of another child? → sibling/twin
  │   │   ├─ Chevron stroke?  → dizygotic twin (shared egg, no new pregnancy)
  │   │   └─ Flat stroke?     → distinct sibling (new pregnancy + egg)
  │   ├─ Endpoint hits relationship line?    → add as child
  │   └─ Endpoint hits individual?           → parent-child
  ├─ Parental line (other)?                  → check endpoint, create offspring
  ├─ Connecting?                    → check endpoint, create relationship
  ├─ Monozygotic bar?              → horizontal stroke crossing twin chevron arms
  │                                   → if sexes differ: modal dialog (choose sex or ignore)
  ├─ Closed loop?                   → lasso selection
  └─ Open stroke?                   → gesture recognition → create individual
```

### Hit testing

Six hit-test functions check pointer position against individuals and relationship lines:

| Function | Zone | Tolerance |
|----------|------|-----------|
| `hitParentalLine` | 3-segment orthogonal path (origin→midY→child) | 12px |
| `hitRelationshipLine` | Horizontal line between partners | 12px |
| `hitBottom` | Bottom-center of shape | 12px |
| `hitTop` | Top-center of shape | 12px |
| `hitSide` | Left/right midpoints | 10px |
| Body hit | Center of shape | SHAPE_SIZE/2 + 4px |

## Gesture recognition (`recognise.ts`)

### Algorithm

1. **Resample** the raw point array to 64 evenly-spaced points
2. **Compute centroid** and distances from each point to centroid
3. **Circularity test**: coefficient of variation of distances < threshold → circle
4. **Corner detection**: compute turning angles between consecutive segments; angles above threshold are corners
5. **Classification**:
   - 4 corners + closed → square or diamond (distinguished by corner orientation)
   - Otherwise → unrecognised
6. **Closure check**: distance between first and last point relative to bounding box

### Exports

```typescript
function recognise(points: Point[]): Shape    // "circle" | "square" | "diamond" | "unrecognised"
function centroid(points: Point[]): Point
type Point = { x: number; y: number }
type Shape = "circle" | "square" | "diamond" | "unrecognised"
```

## Symbol rendering (`symbols.ts`)

### Coordinate system

XAML symbols use a 48x48 coordinate space centered at (24, 24). The app uses `SHAPE_SIZE = 40`. Scale factor: `size / 48`. All XAML coordinates are transformed to canvas coordinates via:

```
canvasX = centerX + (xamlX - 24) * scale
canvasY = centerY + (xamlY - 24) * scale
```

### Drawing layers

`drawIndividual()` renders five layers using `Path2D` objects:

**Layer 1 — Base shape** (driven by `biological_sex` + `death_status`):

| Sex | Shape |
|-----|-------|
| female | Circle r=22 |
| male | Square (2,2)→(46,46) |
| unknown | Diamond |
| ambiguous_female | Circle, dashed |
| ambiguous_male | Square, dashed |
| intersex | Circle + square, both dashed |
| none | Triple nested diamonds |

Mortality overrides: `lived_one_day` → small circle, `spontaneous_abortion` / `therapeutic_abortion` → upper triangle.

**Layer 2 — Affection overlay** (driven by `affection_status`):

Techniques used: solid fill, clip-to-region fill, inner circle stroke, text markers ("?"), small shapes (square, X), lines.

**Layer 3 — Mortality overlay** (driven by `death_status`):

Diagonal lines (dead, suicide), text labels below shape (NND, SB), text inside shape (P for pregnancy).

**Layer 4 — Fertility indicator** (driven by `fertility_status`):

Stem below the shape with horizontal crossbars (double for infertile, single for by choice).

**Layer 5 — Proband arrow** (driven by `proband` angle, 0–360):

When `proband > 0`, an arrow is drawn pointing at the individual from the angle specified (0° = up/12 o'clock, clockwise). The arrow shaft extends outward from the shape edge. If `probandText` is set, it is rendered as a label near the tail of the arrow.

## Properties panel (`panel.ts`)

### Architecture

The panel is a floating, position-fixed DOM element (not part of canvas layout) that can be dragged by its title bar. It communicates with `main.ts` through a callbacks interface:

```typescript
interface PanelCallbacks {
  onUpdate: () => Promise<void>  // refreshState + render
  onClose: () => void            // clear selection + render
  api: <T>(path: string, options?: RequestInit) => Promise<T>
}
```

### Field sections

Fields are grouped into five sections (Identity, Clinical, Dates, Notes, Contact), each built from helper functions (`makeField`, `makeSelect`).

### API integration patterns

| Field type | Trigger | API call |
|------------|---------|----------|
| Dropdowns (sex, mortality, affection, fertility) | `change` event (immediate) | PATCH individual |
| Proband slider (0–360) | `input` event (immediate) | PATCH individual |
| Text inputs | `input` event (500ms debounce) | PATCH individual |
| Status properties (death, affection, fertility) | Via dropdown | Read individual → merge into `properties` dict → PATCH |
| Date of death | `input` event (500ms debounce) | Set `date_of_death` property + auto-set `death_status` to "dead" if not already a death status + create death event |
| Contact fields (phone, email) | `input` event (500ms debounce) | Build `contacts.self` object → PATCH |

### Drag implementation

The title bar captures pointer events. On `pointerdown`, it records the offset between the cursor and the panel's top-left corner. On `pointermove`, it sets `left`/`top` styles to follow the cursor. The panel stays within the viewport via CSS `position: fixed`.

### Zoom and pan

The canvas supports a zoom/pan transform via `zoomScale`, `panX`, `panY` state variables:

- `render()` wraps all drawing in `ctx.save()` / `ctx.translate(panX, panY)` / `ctx.scale(zoomScale, zoomScale)` / `ctx.restore()`
- `pointerPos()` converts screen coordinates to world coordinates via `screenToWorld()`: `worldX = (screenX - panX) / zoomScale`
- Scroll wheel zooms towards cursor by adjusting both scale and pan to keep the world point under the cursor fixed
- Pinch-to-zoom uses `touchstart`/`touchmove` with two-finger distance tracking
- Grid lines are drawn only in the visible world-coordinate area for performance

### File I/O handlers

Four toolbar buttons handle file operations:

- **Save** — `GET /api/pedigrees/{id}` → `JSON.stringify` → Blob → download link
- **Load** — file input → `JSON.parse` → `pushUndo()` → `PUT /api/pedigrees/{id}/restore` + `PATCH` metadata → `refreshState()`
- **Export .ged** — `fetch` export endpoint → blob → download
- **Import .ged** — file input → `pushUndo()` → `POST /api/pedigrees/{id}/import/gedcom` → `refreshState()`
- **Import .xeg** — file input → `pushUndo()` → `POST /api/pedigrees/{id}/import/xeg` → `refreshState()`

All load/import operations push an undo snapshot before mutating state, so they can be reversed with Ctrl+Z.

## Rendering pipeline (`render()`)

1. Clear the canvas
2. Apply zoom/pan transform (`translate` + `scale`)
3. Draw grid (visible world-coordinate area only, when snap-to-grid is enabled)
4. Draw relationship lines (horizontal segments between paired individuals)
5. Draw parental lines — eggs are grouped by `relationship_id`:
   - **Regular eggs**: orthogonal stepped paths (origin → midY → child)
   - **Twin eggs** (`properties.twin`): diagonal chevron from a shared apex to each twin child
   - **Monozygotic twins** (`properties.monozygotic`): chevron with horizontal bar across the arms (A-shape)
8. Draw individual symbols (via `drawIndividual` from `symbols.ts`)
9. Restore canvas transform

The render function reads directly from the module-level `individuals`, `relationships`, and `eggs` arrays. Selection state (`selectedIds`, `selectedIndividualId`) determines stroke colour (blue for selected, slate for default).
