# Evagene UI

The Evagene frontend is a canvas-based pedigree editor built with TypeScript and Vite. Users interact by drawing shapes, connecting individuals, and editing properties through a floating panel — all rendered on an HTML5 Canvas using standard genetic pedigree notation.

## Running the UI

```bash
cd ui
npm install
npm run dev
```

The dev server starts on `http://localhost:5173`. The API server must also be running on port 8000 (Vite proxies `/api/*` requests).

## User interactions

### Creating individuals

Draw a shape on the canvas:

- **Circle** → female
- **Square** → male
- **Diamond** → unknown sex

The gesture recogniser classifies freehand strokes by analysing circularity and corner count.

### Creating relationships

Draw a line from the **side** of one individual to the **side** of another. A horizontal connection line appears between them.

### Creating parent-child links

Draw a line from any of these sources to a child individual:

- The **relationship line** between two partners
- The **bottom** of a single parent
- The **top** of a child (drawing upward to a relationship line or parent)

An orthogonal path (vertical-horizontal-vertical) is drawn from the relationship midpoint to the child.

### Selecting and moving

- **Single click** an individual to open the properties panel
- **Drag** an individual to reposition it
- **Lasso select** by drawing a closed loop around multiple individuals, then drag the group

### Properties panel

Click an individual to open a floating, draggable editor with sections:

- **Identity** — display name, given names, surname, title, surname at birth
- **Clinical** — sex, mortality, affection, fertility, proband (angle slider 0-360), generation
- **Dates** — date of birth, date of death (setting a death date automatically sets mortality to "dead" and creates a death event)
- **Notes** — free text
- **Contact** — home/work/mobile telephone, email

Changes save automatically (dropdowns and sliders immediately, text fields after 500ms debounce).

## Pedigree symbols

Individuals render with layered overlays reflecting their clinical status:

| Layer | Examples |
|-------|----------|
| Base shape | Circle (female), square (male), diamond (unknown), dashed outlines (ambiguous), triangle (abortion) |
| Affection | Solid fill (affected), right-half fill (heterozygous), inner circle (carrier), center strip (hearsay) |
| Mortality | Diagonal slash (dead), X (suicide), text labels (NND, SB, P) |
| Fertility | Stem + crossbars (infertile), single bar (by choice) |
| Proband | Arrow pointing at individual at the angle set by the proband slider, with optional label text |

## Building for production

```bash
npm run build    # Output in dist/
```

## Testing

```bash
npx vitest run
```

Tests cover the gesture recognition module (circle, square, diamond classification).
