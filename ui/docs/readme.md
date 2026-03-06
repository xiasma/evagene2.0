# Evagene UI

The Evagene frontend is a canvas-based pedigree editor built with TypeScript and Vite. Users interact by drawing shapes, connecting individuals, and editing properties through floating panels — all rendered on an HTML5 Canvas using standard genetic pedigree notation.

## Running the UI

```bash
cd ui
npm install
npm run dev
```

The dev server starts on `http://localhost:5173`. The API server must also be running on port 8000 (Vite proxies `/api/*` requests).

## URL routing

- `/pedigrees/:id` — opens a specific pedigree in the editor
- `/inspect/:id` — opens the debug inspector for a pedigree
- `/` — creates a new pedigree and redirects to its URL

## User interactions

### Creating individuals

Draw a shape on the canvas, or use keyboard shortcuts:

- **Circle** → female (or press `f`)
- **Square** → male (or press `m`)
- **Diamond** → unknown sex (or press `u`)

The gesture recogniser classifies freehand strokes by analysing circularity and corner count. Keyboard shortcuts place new individuals near the current selection or at a computed position.

### Creating relationships

Draw a line from the **side** of one individual to the **side** of another. A horizontal connection line appears between them. Or press `p` to add a partner to the selected individual, or create a marriage between two selected individuals.

### Creating parent-child links

Draw a line from any of these sources to a child individual:

- The **relationship line** between two partners
- An existing **parental line** (to add a sibling to the same relationship)
- The **bottom** of a single parent
- The **top** of a child (drawing upward to a relationship line or parent)

An orthogonal path (vertical-horizontal-vertical) is drawn from the relationship midpoint to the child. Drawing from a parental line creates a new sibling under the same relationship.

### Sibling and twin connections

Draw from the **top** of one child to the **top** of another child (both must share a parent relationship):

- **Flat/horizontal stroke** → distinct siblings (new pregnancy + new egg)
- **Chevron (V-shape) stroke** → dizygotic twins (shared pregnancy, separate eggs, rendered as a chevron)

To mark twins as monozygotic, draw a horizontal line between the chevron arms. Monozygotic twins share a single egg entity. Multiple twin pairs under the same relationship render as separate chevrons, each identified by a `twin_group` ID.

### Selecting and moving

- **Single click** an individual to select and open the properties panel
- **Ctrl+click** or **Shift+click** to add/remove from selection
- **Drag** an individual or group to reposition
- **Lasso select** by drawing a closed loop around multiple individuals
- **Lasso with Ctrl/Shift** adds to existing selection instead of replacing
- **Ctrl+A** selects all individuals
- **F2** focuses the display name field of the selected element

New individuals and relationships auto-select and focus the display name input.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `m` | Add a new male individual |
| `f` | Add a new female individual |
| `u` | Add a new individual of unknown sex |
| `p` | Add partner / create marriage |
| `d` | Toggle disease palette |
| `n` | Add floating note |
| `g` | Toggle grid |
| `Delete` / `Backspace` | Delete selected elements |
| `Ctrl+A` | Select all |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+C` | Copy |
| `Ctrl+V` | Paste |
| `F2` | Focus display name |
| `Escape` | Close panel / clear selection |

### Zoom and pan

- **Scroll wheel** — zoom in/out towards cursor
- **Pinch** — two-finger pinch-to-zoom on touch devices
- **Space+drag** — pan the canvas (grab cursor feedback)
- **Middle-click drag** — pan the canvas
- **Toolbar buttons** — `+` (zoom in), `−` (zoom out), `1:1` (reset to default)

### Save and load

- **Save** — downloads the current pedigree as a JSON file. Offers "Selection only" or "Whole pedigree" when individuals are selected
- **Load** — loads a previously saved JSON file with choice of "Replace" or "Add to pedigree" (supports undo)
- **Export .ged** — downloads the pedigree in GEDCOM 5.5.1 format (with selection option)
- **Import .ged** — loads a GEDCOM file with "Replace" or "Add to pedigree" (supports undo)
- **Import .xeg** — loads an Evagene v1 .xeg file with "Replace" or "Add to pedigree" (supports undo)

### Properties panel

Click an individual to open a floating, draggable editor with sections:

- **Identity** — display name, given names, surname, title, surname at birth
- **Clinical** — sex, mortality, affection, fertility, proband (angle slider 0-360), generation
- **Dates** — date of birth, date of death (setting a death date automatically sets mortality to "dead" and creates a death event)
- **Notes** — free text
- **Contact** — home/work/mobile telephone, email

Click a relationship to open its properties panel with display name, notes, and relationship-specific fields.

Changes save automatically (dropdowns and sliders immediately, text fields after 500ms debounce).

### Inspector

Navigate to `/inspect/:id` to open the debug inspector. It provides an Azure Portal-style blade UI:

- **Overview blade** — lists all individuals, relationships, and pregnancies (grouped by relationship and twin group with DZ/MZ labels). Includes integrity checks.
- **Entity blades** — click any entity to open a detail blade showing all fields, properties, events, and cross-references
- **Shared eggs** — monozygotic twin eggs display multiple children

## Pedigree symbols

Individuals render with layered overlays reflecting their clinical status:

| Layer | Examples |
|-------|----------|
| Base shape | Circle (female), square (male), diamond (unknown), dashed outlines (ambiguous), triangle (abortion) |
| Affection | Solid fill (affected), right-half fill (heterozygous), inner circle (carrier), center strip (hearsay) |
| Disease sectors | Coloured pie sectors for assigned diseases |
| Mortality | Diagonal slash (dead), X (suicide), text labels (NND, SB, P) |
| Fertility | Stem + crossbars (infertile), single bar (by choice) |
| Proband | Arrow pointing at individual at the angle set by the proband slider, with optional label text |
| Selection | Cyan glow outline (3px stroke for selected, 5px for hover) |

## Building for production

```bash
npm run build    # Output in dist/ (two entry points: index.html + inspect.html)
```

## Testing

```bash
npx vitest run
```

Tests cover the gesture recognition module (circle, square, diamond classification).
