# Getting Started

## Prerequisites

- **Python 3.11+** — [python.org/downloads](https://www.python.org/downloads/)
- **Node.js 18+** — [nodejs.org](https://nodejs.org/)
- **Git** — [git-scm.com](https://git-scm.com/)

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd evagene
```

### 2. Set up the API

```bash
# Create a virtual environment
py -3.11 -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Set up the UI

```bash
cd ui
npm install
cd ..
```

## Running the application

You need two terminals — one for the API server and one for the UI dev server.

### Terminal 1: Start the API

```bash
# From the project root, with venv activated
uvicorn api.evagene.main:app --reload
```

The API starts on `http://localhost:8000`. You can browse the auto-generated API docs at `http://localhost:8000/docs`.

### Terminal 2: Start the UI

```bash
cd ui
npm run dev
```

The UI dev server starts on `http://localhost:5173`. Open this URL in your browser.

The Vite dev server proxies all `/api/*` requests to the API on port 8000, so both servers must be running.

## URL routing

- **Editor**: `http://localhost:5173/pedigrees/:id` — opens a specific pedigree by ID
- **Inspector**: `http://localhost:5173/inspect/:id` — opens the debug inspector for a pedigree
- **Home**: `http://localhost:5173/` — creates a new pedigree and redirects to its URL

## Using the application

1. **Draw shapes** on the canvas — circle for female, square for male, diamond for unknown
2. **Connect two individuals** by drawing a line from the side of one shape to the side of another
3. **Create parent-child lines** by drawing from a relationship line (or the bottom of a parent) down to a child
4. **Create twins** by drawing a chevron (V-shape) between two siblings under the same parents. Draw a horizontal bar across the chevron arms to mark them as monozygotic
5. **Select individuals** — click to select one, Ctrl/Shift+click for multi-select, draw a closed loop (lasso) to select a group. Lasso with Ctrl/Shift adds to existing selection
6. **Drag** selected individuals to reposition them
7. **Click an individual** to open the properties panel — edit sex, mortality, affection, fertility, name, dates, notes, and contact info
8. **Drag the properties panel** by its title bar to reposition it; close it with the X button
9. **Zoom** with the scroll wheel, pinch gesture, or toolbar buttons (+, −, 1:1)
10. **Pan** by holding Space and dragging, or middle-click dragging
11. **Save/Load** your work as JSON using the toolbar buttons. Import offers "Replace" or "Add to pedigree" modes. Export offers "Selection only" or "Whole pedigree" when individuals are selected.
12. **Export/Import GEDCOM** files (.ged) for interoperability with genealogy software
13. **Import XEG** files (.xeg) from Evagene v1 for legacy pedigree migration

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `m` | Add a new male individual |
| `f` | Add a new female individual |
| `u` | Add a new individual of unknown sex |
| `p` | Add a partner (opposite sex) if one selected; create marriage if two selected |
| `d` | Toggle the disease palette |
| `n` | Add a floating note |
| `g` | Toggle grid visibility |
| `Delete` / `Backspace` | Delete selected elements |
| `Ctrl+A` | Select all individuals |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+C` | Copy selection |
| `Ctrl+V` | Paste |
| `F2` | Focus the display name field of the selected element |
| `Escape` | Close panel / clear selection |

## Running tests

### API tests

```bash
cd api
python -m pytest tests/ -v
```

### UI tests

```bash
cd ui
npx vitest run
```

## Build for production

```bash
cd ui
npm run build
```

The compiled output goes to `ui/dist/` with two entry points (`index.html` for the editor, `inspect.html` for the inspector). To serve it, configure the FastAPI app to serve the `dist/` folder as static files, or deploy behind a reverse proxy.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ModuleNotFoundError` when starting API | Ensure the virtual environment is activated |
| UI shows network errors | Check that the API server is running on port 8000 |
| Shapes not recognised | Draw slower and larger; circles need to be roughly round, squares roughly square |
| Properties panel doesn't save | Check browser console for API errors; ensure both servers are running |
| Blank page on `/inspect/:id` | Restart the Vite dev server after config changes |
