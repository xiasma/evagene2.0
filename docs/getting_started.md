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

## Using the application

1. **Draw shapes** on the canvas — circle for female, square for male, diamond for unknown
2. **Connect two individuals** by drawing a line from the side of one shape to the side of another
3. **Create parent-child lines** by drawing from a relationship line (or the bottom of a parent) down to a child
4. **Select multiple individuals** by drawing a closed loop (lasso) around them, then drag the group
5. **Click an individual** to open the properties panel — edit sex, mortality, affection, fertility, name, dates, notes, and contact info
6. **Drag the properties panel** by its title bar to reposition it; close it with the X button

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

The compiled output goes to `ui/dist/`. To serve it, configure the FastAPI app to serve the `dist/` folder as static files, or deploy behind a reverse proxy.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ModuleNotFoundError` when starting API | Ensure the virtual environment is activated |
| UI shows network errors | Check that the API server is running on port 8000 |
| Shapes not recognised | Draw slower and larger; circles need to be roughly round, squares roughly square |
| Properties panel doesn't save | Check browser console for API errors; ensure both servers are running |
