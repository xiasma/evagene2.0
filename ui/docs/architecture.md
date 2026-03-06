# UI Technical Architecture

## Module structure

```
ui/
  index.html           Editor entry point
  inspect.html         Inspector entry point
  vite.config.ts       Multi-page build + SPA fallback plugin + API proxy
  src/
    main.ts              Application entry, canvas, event handling, state
    symbols.ts           Pedigree symbol rendering (4-layer system)
    recognise.ts         Freehand gesture recognition
    panel.ts             Individual properties editor (floating window)
    panel-relationship.ts  Relationship properties editor
    panel.css            Panel styling
    style.css            Global styles (CSS variables, light/dark mode)
    inspect.ts           Inspector page (blade UI)
    inspect.css          Inspector styling
```

## Build tooling

- **Vite** — dev server with HMR, TypeScript compilation, production bundler
- **TypeScript** — strict mode, ES2020 target, bundler module resolution
- **Vitest** — unit test runner (compatible with Vite's transform pipeline)
- **Proxy**: Vite forwards `/api/*` to `http://localhost:8000` during development
- **Multi-page build**: `rollupOptions.input` specifies both `index.html` and `inspect.html`
- **SPA fallback**: Custom `spaFallback()` Vite plugin rewrites `/pedigrees/*` to `index.html` and `/inspect/*` to `inspect.html` (skips `/api` and asset URLs)

## Application entry (`main.ts`)

### Initialisation flow

1. Inject HTML into `#app` (heading, toolbar, canvas, toast, disease palette)
2. Set up canvas sizing (DPR-aware) with resize listener
3. Parse URL for pedigree ID (`/pedigrees/:id`), or POST to create a new one
4. Update browser URL with `history.replaceState`
5. Initialise panels, disease palette, and keyboard shortcuts
6. Attach pointer event handlers to the canvas

### State management

All state is module-level variables — no framework, no store library:

```
pedigreeId               Current pedigree UUID
individuals[]            Placed individuals (from API)
relationships[]          Relationships (from API)
eggs[]                   Offspring links (expanded from API — shared eggs become virtual per-child entries)
selectedIds              Set<string> — multi-selection (Ctrl/Shift+click, lasso)
selectedIndividualId     string | null — single-click selection for panel
selectedElement          HitElement | null — selected connection/line element
hoveredElement           HitElement | null — element under cursor
siblingBarOffsets        Map<string, number> — user-adjusted sibling bar Y positions
chevronApexOffsets       Map<string, number> — user-adjusted chevron apex Y positions
floatingNotes            FloatingNote[] — text annotations stored in pedigree properties
drawing/dragging/connecting/panning  — interaction state flags
points[]                 Current stroke points
zoomScale                Current zoom level (default 1, range 0.1–5)
panX, panY               Canvas pan offset in screen pixels
spaceDown                Space key held (for pan mode)
```

After every mutation (create, move, edit), `refreshState()` fetches the full `PedigreeDetail` from the API, expands shared eggs via `expandEggs()`, and calls `render()` to redraw.

### Egg expansion

The API returns eggs with either `individual_id` (single child) or `individual_ids` (multiple children for monozygotic twins). `expandEggs()` creates virtual per-child `PlacedEgg` entries from shared eggs so the rendering pipeline (which works with `individual_id`) doesn't need to handle the multi-child case directly. `captureSnapshot()` deduplicates expanded eggs before saving to undo stack.

### Twin group system

Twins are rendered as chevrons emanating from the sibling bar or parental origin. Multiple twin pairs under the same relationship are distinguished by the `twin_group` property on their eggs:

- `getTwinGroups(relId)` — groups twin eggs by `twin_group`, drops groups with <2 eggs
- `getAllChevronApexInfos(rel)` — returns apex position for every twin group
- `getChevronApexInfo(rel, groupEggs?)` — computes apex for a specific group

The renderer iterates over groups, drawing a separate chevron per group. Hit-test functions (`hitChevronApex`, `hitTwinArm`, `hitMonozygoticBar`) iterate over all groups. Monozygotic groups render a horizontal crossbar between the chevron arms.

### Interaction state machine

Pointer events follow a priority chain on `pointerdown`:

```
pointerdown
  ├─ Space held? → pan mode (grab cursor)
  ├─ Hit sibling bar? → drag bar vertically
  ├─ Hit chevron apex? → drag apex vertically
  ├─ Hit parental stem? → start adding sibling
  ├─ Hit parental line?      → sibling mode
  ├─ Hit relationship line?  → parental line mode
  ├─ Hit bottom of shape?    → parental line from parent
  ├─ Hit top of shape?       → parental line from child
  ├─ Hit side of shape?      → connection drawing mode
  ├─ Hit shape body?
  │   ├─ Ctrl/Shift? → toggle in/out of multi-selection
  │   ├─ Already selected?   → group drag
  │   └─ Not selected?       → single drag (track for click detection)
  └─ Hit nothing?            → freehand drawing mode

pointermove
  → set pointerMoved = true
  → update drag positions, bar offsets, or extend freehand stroke

pointerup
  ├─ !pointerMoved && clickHitId?  → single click → open panel
  ├─ Dragging?                      → persist positions via PATCH
  ├─ Parental line (child source)?
  │   ├─ Endpoint hits top of another child? → sibling/twin
  │   │   ├─ Chevron stroke?  → dizygotic twin (twin_group assigned)
  │   │   └─ Flat stroke?     → distinct sibling
  │   ├─ Endpoint hits relationship/marriage? → merge relationships
  │   ├─ Endpoint hits individual?           → parent-child
  │   └─ Otherwise → reject stroke
  ├─ Connecting?                    → check endpoint, create relationship
  ├─ Monozygotic bar?              → horizontal stroke crossing twin chevron arms
  │                                   → merge eggs into shared egg, modal for sex conflicts
  ├─ Closed loop?                   → lasso selection (Ctrl/Shift for additive)
  └─ Open stroke?                   → gesture recognition → create individual
```

### Hit testing

Hit-test functions check pointer position against individuals, relationships, and structural lines:

| Function | Zone | Tolerance |
|----------|------|-----------|
| `hitParentalStem` | Vertical line from origin to sibling bar | 12px |
| `hitSiblingBar` | Horizontal sibling bar | 12px |
| `hitSiblingDrop` | Vertical drop from bar to child (regular eggs only) | 12px |
| `hitChevronApex` | Chevron apex point (per twin group) | 12px |
| `hitTwinArm` | Diagonal chevron arm (per twin group) | 12px |
| `hitMonozygoticBar` | Horizontal crossbar on monozygotic chevron (per twin group) | 12px |
| `hitRelationshipLine` | Horizontal line between partners | 12px |
| `hitBottom` | Bottom-center of shape | 12px |
| `hitTop` | Top-center of shape | 12px |
| `hitSide` | Left/right midpoints | 10px |
| Body hit | Center of shape | SHAPE_SIZE/2 + 4px |

`SHAPE_EDGE` (22 * SHAPE_SIZE/48 = ~18.33px) is the actual rendered shape edge, distinct from `SHAPE_SIZE/2` (20px) used for hit-test radius. Relationship lines terminate at `SHAPE_EDGE` for pixel-perfect alignment.

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

### Chevron detection

`detectChevron(points)` uses a dual-metric approach to distinguish V-shapes (twins) from U-shapes (stepped siblings):

- **flatRatio**: bounding box width:height ratio (V-shapes are flatter)
- **directness**: ratio of diagonal distance to path length (V-shapes are more direct)

Both metrics must pass thresholds for a chevron classification.

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

When `proband > 0`, an arrow is drawn pointing at the individual from the angle specified (0° = up/12 o'clock, clockwise).

**Selection stroke**: Selected individuals render with `lineWidth = 3` (vs default 2).

## Properties panels

### Individual panel (`panel.ts`)

A floating, position-fixed DOM element draggable by its title bar. Communicates with `main.ts` through callbacks:

```typescript
interface PanelCallbacks {
  onUpdate: () => Promise<void>  // refreshState + render
  onClose: () => void            // clear selection + render
  onBeforeMutation: () => void   // capture undo snapshot
  api: <T>(path: string, options?: RequestInit) => Promise<T>
}
```

Exports `focusDisplayName()` for auto-focus on new elements.

### Relationship panel (`panel-relationship.ts`)

Same pattern as the individual panel, for editing relationship properties. Exports `focusRelationshipDisplayName()`.

### Field sections

Fields are grouped into sections (Identity, Clinical, Dates, Notes, Contact), each built from helper functions (`makeField`, `makeSelect`).

### API integration patterns

| Field type | Trigger | API call |
|------------|---------|----------|
| Dropdowns (sex, mortality, affection, fertility) | `change` event (immediate) | PATCH individual |
| Proband slider (0–360) | `input` event (immediate) | PATCH individual |
| Text inputs | `input` event (500ms debounce) | PATCH individual |
| Status properties (death, affection, fertility) | Via dropdown | Read individual → merge into `properties` dict → PATCH |
| Date of death | `input` event (500ms debounce) | Set `date_of_death` property + auto-set `death_status` to "dead" + create death event |
| Contact fields (phone, email) | `input` event (500ms debounce) | Build `contacts.self` object → PATCH |

## Inspector (`inspect.ts`)

A separate page entry point (`inspect.html`) providing a read-only debug view of pedigree data.

### Architecture

- Fetches `PedigreeDetail` from API on load (URL: `/inspect/:id`)
- Builds an Azure Portal-style blade UI where clicking entities opens detail blades to the right
- `addBlade(title, content, afterIndex)` manages the blade stack; `removeBladesAfter(index)` trims

### Blades

- **Overview blade** — pedigree metadata, all individuals (with sex icons), relationships (with member names), pregnancies (grouped by relationship and twin_group with DZ/MZ labels), raw eggs, integrity checks
- **Individual blade** — summary, properties, events, diseases, markers, relationships as member, eggs as child, parent relationships
- **Relationship blade** — members, pregnancies/eggs (grouped by twin_group), properties, events
- **Egg blade** — child/children (handles `individual_ids` for shared eggs), parent relationship, properties, events

### Pregnancy grouping

In both the overview and relationship blades, eggs are grouped by `twin_group`:

- Ungrouped eggs appear as individual pregnancies
- Twin groups show DZ/MZ label, egg count, and all children
- Shared eggs (monozygotic) display "(N children)" in the blade title

### Integrity checks

`runIntegrityChecks()` validates:

- Pedigree ID lists match actual entities
- Relationship members exist
- Egg individual/relationship references exist (checks both `individual_id` and `individual_ids`)
- Duplicate members in relationships
- Orphan eggs (no individual and no relationship)

## Rendering pipeline (`render()`)

1. Clear the canvas
2. Apply zoom/pan transform (`translate` + `scale`)
3. Draw grid (visible world-coordinate area only, when snap-to-grid is enabled)
4. Draw relationship lines (horizontal segments between paired individuals, terminating at `SHAPE_EDGE`)
5. Draw parental lines — eggs grouped by `relationship_id`:
   - Group twin eggs by `twin_group` via `getTwinGroups()`
   - Regular eggs (not in any twin group): horizontal sibling bar + vertical drops
   - Twin groups: separate chevron per group from shared apex (on bar or computed from origin)
   - Monozygotic groups: chevron with horizontal crossbar (A-shape)
   - Multiple twin groups with no regular children: horizontal bar connecting all group apexes
6. Draw hover and selection highlights (cyan glow, per-element-type highlight paths)
7. Draw find highlights (search result indicators)
8. Draw individual symbols (via `drawIndividual` from `symbols.ts`)
9. Draw floating notes
10. Restore canvas transform

The render function reads directly from the module-level `individuals`, `relationships`, and `eggs` arrays. Selection state determines stroke colour (cyan for selected/hover, default for unselected).

## Zoom and pan

The canvas supports a zoom/pan transform via `zoomScale`, `panX`, `panY` state variables:

- `render()` wraps all drawing in `ctx.save()` / `ctx.translate(panX, panY)` / `ctx.scale(zoomScale, zoomScale)` / `ctx.restore()`
- `pointerPos()` converts screen coordinates to world coordinates via `screenToWorld()`: `worldX = (screenX - panX) / zoomScale`
- Scroll wheel zooms towards cursor by adjusting both scale and pan to keep the world point under the cursor fixed
- Pinch-to-zoom uses `touchstart`/`touchmove` with two-finger distance tracking
- Space+drag pans with grab/grabbing cursor feedback
- Grid lines are drawn only in the visible world-coordinate area for performance

## File I/O handlers

Toolbar buttons handle file operations with modal dialogs:

- **Save** — `GET /api/pedigrees/{id}` → `JSON.stringify` → Blob → download. When individuals are selected, offers "Selection only" or "Whole pedigree"
- **Load** — file input → `JSON.parse` → modal ("Replace" or "Add to pedigree") → `pushUndo()` → `PUT /api/pedigrees/{id}/restore` or `addEntitiesToPedigree()` → `refreshState()`
- **Export .ged** — same selection options as Save
- **Import .ged** — file input → modal ("Replace" or "Add to pedigree") → `pushUndo()` → `POST` with `?mode=parse` for Add, or direct import for Replace → `refreshState()`
- **Import .xeg** — same as Import .ged

All operations push an undo snapshot before mutating state, so they can be reversed with Ctrl+Z.
