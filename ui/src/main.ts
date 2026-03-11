import "./style.css";
import { recognise, centroid, Point, Shape } from "./recognise";
import { drawIndividual, SymbolSpec, SymbolColors } from "./symbols";
import { initPanel, openPanel, closePanel, focusDisplayName } from "./panel";
import { initPedigreePanel, openPedigreePanel, closePedigreePanel } from "./panel-pedigree";
import { initRelationshipPanel, openRelationshipPanel, closeRelationshipPanel, focusRelationshipDisplayName } from "./panel-relationship";
import { initEggPanel, openEggPanel, closeEggPanel } from "./panel-egg";
import { initGeneticsPanel, openGeneticsPanel, closeGeneticsPanel } from "./panel-genetics";
import { initDiseasePalette, openDiseasePalette, closeDiseasePalette, isDiseasePaletteOpen, refreshDiseasePalette } from "./disease-palette";
import { PanelCallbacks } from "./panel-utils";
import { cssVar, toggleTheme, fontSettings, updateFontSettings, getCanvasFontWithSize } from "./theme";

// --- Types ---

interface IndividualDiseaseEntry {
  disease_id: string;
  manifestations: unknown[];
  properties: Record<string, unknown>;
}

interface PlacedIndividual {
  id: string;
  x: number;
  y: number;
  biological_sex: string | null;
  properties: Record<string, unknown>;
  proband: number;
  proband_text: string;
  display_name: string;
  name: { given?: string[]; family?: string; prefix?: string; suffix?: string };
  notes: string;
  diseases: IndividualDiseaseEntry[];
}

interface DiseaseInfo {
  id: string;
  display_name: string;
  color: string;
}

interface PlacedRelationship {
  id: string;
  members: string[];
  consanguinity: number | null;
  consanguinity_override: boolean;
  properties: Record<string, unknown>;
  events: { id: string; type: string; display_name: string; date: string | null; properties: Record<string, unknown> }[];
}

interface PlacedEgg {
  id: string;
  individual_id: string | null;
  individual_ids: string[];
  relationship_id: string | null;
  properties: Record<string, unknown>;
}

/** Expand eggs with individual_ids into one virtual PlacedEgg per child.
 *  Virtual entries share the same egg id but have different individual_id. */
function expandEggs(rawEggs: PlacedEgg[]): PlacedEgg[] {
  const result: PlacedEgg[] = [];
  for (const egg of rawEggs) {
    if (egg.individual_ids && egg.individual_ids.length > 0) {
      for (const iid of egg.individual_ids) {
        result.push({ ...egg, individual_id: iid });
      }
    } else {
      result.push(egg);
    }
  }
  return result;
}

interface FloatingNote {
  id: string;
  text: string;
  x: number;
  y: number;
  visible: boolean;
}

// --- DOM ---

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="app-header">
    <h1>Evagene</h1>
    <p>Pedigree editor</p>
    <div class="toolbar">
      <button id="btn-undo" title="Undo (Ctrl+Z)">Undo</button>
      <button id="btn-redo" title="Redo (Ctrl+Y)">Redo</button>
      <span class="separator"></span>
      <button id="btn-grid" title="Toggle grid (Ctrl+G)">Grid</button>
      <button id="btn-find" title="Find (Ctrl+F)">Find</button>
      <button id="btn-add-note" title="Add floating note">Note</button>
      <button id="btn-toggle-notes" title="Show/hide all floating notes">Notes</button>
      <span class="separator"></span>
      <button id="btn-zoom-in" title="Zoom in">+</button>
      <button id="btn-zoom-out" title="Zoom out">&minus;</button>
      <button id="btn-zoom-reset" title="Reset zoom">1:1</button>
      <span class="separator"></span>
      <button id="btn-diseases" title="Toggle disease palette">Diseases</button>
      <button id="btn-disease-key" title="Toggle disease key">Key</button>
      <button id="btn-genetics" title="Genetics management">Genetics</button>
      <button id="btn-pedigree" title="Pedigree properties">Pedigree</button>
      <div class="font-settings">
        <button id="btn-font" title="Font settings">Font</button>
        <div id="font-popup" class="font-settings-popup">
          <label>Family</label>
          <select id="font-family">
            <option value="Inter">Inter</option>
            <option value="system-ui">System</option>
            <option value="Arial">Arial</option>
            <option value="Georgia">Georgia</option>
            <option value="monospace">Mono</option>
          </select>
          <label>Size</label>
          <input id="font-size" type="number" min="8" max="24" value="12">
          <div class="font-row">
            <input id="font-bold" type="checkbox"><label>Bold</label>
            <input id="font-italic" type="checkbox"><label>Italic</label>
          </div>
        </div>
      </div>
      <button id="btn-theme" title="Toggle dark mode">Theme</button>
      <span class="separator"></span>
      <button id="btn-save" title="Save JSON">Save</button>
      <button id="btn-load" title="Load JSON">Load</button>
      <button id="btn-export-ged" title="Export GEDCOM">.ged</button>
      <button id="btn-import-ged" title="Import GEDCOM">Import</button>
      <button id="btn-import-xeg" title="Import XEG (Evagene v1)">.xeg</button>
    </div>
  </div>
  <input type="file" id="file-json" accept=".json" style="display:none">
  <input type="file" id="file-ged" accept=".ged,.gedcom" style="display:none">
  <input type="file" id="file-xeg" accept=".xeg" style="display:none">
  <canvas id="canvas"></canvas>
  <div id="disease-palette" class="disease-palette hidden"></div>
  <div id="disease-key" class="disease-key hidden"></div>
  <div id="sidebar" class="sidebar hidden"></div>
  <div id="toast" class="toast hidden"></div>
  <div id="find-bar" class="find-bar hidden">
    <input id="find-input" type="text" placeholder="Search...">
    <span id="find-count" class="find-count"></span>
    <button id="find-prev" title="Previous (Shift+F3)">&lt;</button>
    <button id="find-next" title="Next (F3)">&gt;</button>
    <button id="find-all" title="Select all matches">All</button>
    <button id="find-close" title="Close (Esc)">x</button>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const ctx = canvas.getContext("2d")!;
const toast = document.querySelector<HTMLDivElement>("#toast")!;

// Toolbar elements
const btnUndo = document.getElementById("btn-undo") as HTMLButtonElement;
const btnRedo = document.getElementById("btn-redo") as HTMLButtonElement;
const btnGrid = document.getElementById("btn-grid") as HTMLButtonElement;
const btnFind = document.getElementById("btn-find") as HTMLButtonElement;
const btnAddNote = document.getElementById("btn-add-note") as HTMLButtonElement;
const btnToggleNotes = document.getElementById("btn-toggle-notes") as HTMLButtonElement;
const btnDiseases = document.getElementById("btn-diseases") as HTMLButtonElement;
const btnDiseaseKey = document.getElementById("btn-disease-key") as HTMLButtonElement;
const btnGenetics = document.getElementById("btn-genetics") as HTMLButtonElement;
const btnPedigree = document.getElementById("btn-pedigree") as HTMLButtonElement;
const btnFont = document.getElementById("btn-font") as HTMLButtonElement;
const fontPopup = document.getElementById("font-popup") as HTMLDivElement;
const btnTheme = document.getElementById("btn-theme") as HTMLButtonElement;
const btnZoomIn = document.getElementById("btn-zoom-in") as HTMLButtonElement;
const btnZoomOut = document.getElementById("btn-zoom-out") as HTMLButtonElement;
const btnZoomReset = document.getElementById("btn-zoom-reset") as HTMLButtonElement;
const btnSave = document.getElementById("btn-save") as HTMLButtonElement;
const btnLoad = document.getElementById("btn-load") as HTMLButtonElement;
const btnExportGed = document.getElementById("btn-export-ged") as HTMLButtonElement;
const btnImportGed = document.getElementById("btn-import-ged") as HTMLButtonElement;
const btnImportXeg = document.getElementById("btn-import-xeg") as HTMLButtonElement;
const fileJsonInput = document.getElementById("file-json") as HTMLInputElement;
const fileGedInput = document.getElementById("file-ged") as HTMLInputElement;
const fileXegInput = document.getElementById("file-xeg") as HTMLInputElement;

// Find bar elements
const findBar = document.getElementById("find-bar") as HTMLDivElement;
const findInput = document.getElementById("find-input") as HTMLInputElement;
const findCount = document.getElementById("find-count") as HTMLSpanElement;
const findPrevBtn = document.getElementById("find-prev") as HTMLButtonElement;
const findNextBtn = document.getElementById("find-next") as HTMLButtonElement;
const findAllBtn = document.getElementById("find-all") as HTMLButtonElement;
const findCloseBtn = document.getElementById("find-close") as HTMLButtonElement;

// --- Constants ---

const SHAPE_SIZE = 40; // diameter for circle, side length for square/diamond
const SHAPE_EDGE = 22 * (SHAPE_SIZE / 48); // actual shape half-width from center to edge
const SHAPE_TO_SEX: Record<string, string> = {
  circle: "female",
  square: "male",
  diamond: "unknown",
};

// --- State ---

let pedigreeId: string | null = null;
let individuals: PlacedIndividual[] = [];
let relationships: PlacedRelationship[] = [];
let eggs: PlacedEgg[] = [];
let diseaseCatalog: Map<string, DiseaseInfo> = new Map();
let drawing = false;
let points: Point[] = [];
let toastTimer: ReturnType<typeof setTimeout> | undefined;

// Drag state
let dragging = false;
let groupDragOffsets: Map<string, { dx: number; dy: number }> = new Map();
let preDragSnapshot: Snapshot | null = null;

// Selection state (lasso)
let selectedIds: Set<string> = new Set();

// Single-select state (for properties panel)
let selectedIndividualId: string | null = null;
let pointerMoved = false;
let clickHitId: string | null = null;
let clickExtend = false; // Ctrl or Shift held at pointerdown

// Panel orchestration
type PanelTarget =
  | { type: "individual"; id: string }
  | { type: "relationship"; id: string }
  | { type: "egg"; id: string }
  | { type: "pedigree" }
  | { type: "genetics" }
  | null;

let activePanelTarget: PanelTarget = null;
let clickHitRelId: string | null = null;
let clickHitEggId: string | null = null;
let clickHitLineSegment: HitElement = null;

// Unified element selection/hover for all on-screen items
type HitElement =
  | { kind: "individual"; id: string }
  | { kind: "note"; id: string }
  | { kind: "marriage"; relId: string }
  | { kind: "pregnancies"; relId: string }       // vertical stem from parents to siblings bar
  | { kind: "siblings"; relId: string }           // horizontal sibling bar
  | { kind: "pregnancy"; eggId: string; relId: string }  // chevron arm or vertical drop (upper 2/3)
  | { kind: "egg"; eggId: string; relId: string }        // monozygotic crossbar or bottom 1/3 of drop
  | null;
let selectedElement: HitElement = null;
let hoveredElement: HitElement = null;

function hitElementsEqual(a: HitElement, b: HitElement): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if ("id" in a && "id" in b) return a.id === b.id;
  if ("eggId" in a && "eggId" in b) return a.eggId === b.eggId && a.relId === b.relId;
  if ("relId" in a && "relId" in b) return a.relId === b.relId;
  return false;
}

// Connection drawing state
let connecting = false;
let connectSourceId: string | null = null;

// Sibling bar Y offsets (relId → offset from default barY)
const siblingBarOffsets = new Map<string, number>();
// Chevron apex Y offsets (relId → offset from default apexY)
const chevronApexOffsets = new Map<string, number>();

// Sibling bar / chevron apex drag state
let draggingBar = false;
let draggingApex = false;
let dragRelId: string | null = null;
let dragStartMouseY = 0;
let dragStartOffset = 0;

// Parental line drawing state
let drawingParentalLine = false;
let parentalSource: {
  type: "relationship";
  relId: string;
} | {
  type: "parent";
  indId: string;
} | {
  type: "child";
  indId: string;
} | null = null;

// --- Grid state ---
const GRID_SIZE = SHAPE_SIZE;
let snapToGrid = true;

function snapXY(x: number, y: number): { x: number; y: number } {
  if (!snapToGrid) return { x, y };
  return {
    x: Math.round(x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(y / GRID_SIZE) * GRID_SIZE,
  };
}

// --- Undo/Redo state ---
interface Snapshot {
  label: string;
  individuals: PlacedIndividual[];
  relationships: PlacedRelationship[];
  eggs: PlacedEgg[];
}

const UNDO_LIMIT = 50;
const undoStack: Snapshot[] = [];
const redoStack: Snapshot[] = [];

function captureSnapshot(label = "Edit"): Snapshot {
  // Deduplicate expanded eggs back to unique real eggs
  const seenIds = new Set<string>();
  const uniqueEggs = eggs.filter((e) => {
    if (seenIds.has(e.id)) return false;
    seenIds.add(e.id);
    return true;
  });
  return {
    label,
    individuals: JSON.parse(JSON.stringify(individuals)),
    relationships: JSON.parse(JSON.stringify(relationships)),
    eggs: JSON.parse(JSON.stringify(uniqueEggs)),
  };
}

function pushUndo(snap: Snapshot): void {
  undoStack.push(snap);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
  updateUndoRedoButtons();
}

function updateUndoRedoButtons(): void {
  btnUndo.disabled = undoStack.length === 0;
  btnRedo.disabled = redoStack.length === 0;
  btnUndo.title = undoStack.length > 0
    ? `Undo: ${undoStack[undoStack.length - 1].label} (Ctrl+Z)`
    : "Nothing to undo";
  btnRedo.title = redoStack.length > 0
    ? `Redo: ${redoStack[redoStack.length - 1].label} (Ctrl+Y)`
    : "Nothing to redo";
}

// --- Clipboard state ---
interface ClipboardData {
  individuals: PlacedIndividual[];
  relationships: PlacedRelationship[];
  eggs: PlacedEgg[];
  originCenter: { x: number; y: number };
}

let clipboard: ClipboardData | null = null;
let lastMousePos = { x: 200, y: 200 };

// --- Find state ---
let findOpen = false;
let findResults: string[] = [];
let findIndex = 0;

// --- Floating notes state ---
let floatingNotes: FloatingNote[] = [];
let showAllFloatingNotes = true;
let selectedNoteId: string | null = null;
let draggingNoteId: string | null = null;
let noteDragOffset = { dx: 0, dy: 0 };

// --- Note drag (per-individual on-canvas notes) ---
let draggingIndNoteId: string | null = null;
let indNoteDragOffset = { dx: 0, dy: 0 };

// Display name label drag state
let draggingLabelId: string | null = null;
let labelDragOffset = { dx: 0, dy: 0 };

// --- Zoom / Pan state ---
let zoomScale = 1;
let panX = 0;
let panY = 0;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 5;
const ZOOM_STEP = 0.1;

/** Convert screen-space point to world coordinates accounting for zoom/pan. */
function screenToWorld(sx: number, sy: number): Point {
  return { x: (sx - panX) / zoomScale, y: (sy - panY) / zoomScale };
}

/** Pan-drag state (middle-click or Space+drag) */
let panning = false;
let spaceDown = false;
let panStartX = 0;
let panStartY = 0;
let panStartPanX = 0;
let panStartPanY = 0;

// Pinch state
let pinchStartDist = 0;
let pinchStartScale = 1;
let pinchStartMid = { x: 0, y: 0 };

// --- Canvas sizing ---

function resize() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  render();
}
resize();
window.addEventListener("resize", resize);

// --- API helpers ---

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const method = options?.method ?? "GET";
  console.log(`[API] ${method} ${path}`, options?.body ? JSON.parse(options.body as string) : "");
  const resp = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!resp.ok) throw new Error(`API ${resp.status}: ${await resp.text()}`);
  if (resp.status === 204) return undefined as T;
  const data = await resp.json();
  console.log(`[API] ${method} ${path} →`, data);
  return data as T;
}

// --- Initialisation: load or create a pedigree ---

async function init() {
  // Check URL for pedigree ID: /pedigrees/:id
  const match = window.location.pathname.match(/^\/pedigrees\/([0-9a-f-]+)/i);
  if (match) {
    const id = match[1];
    try {
      await api<{ id: string }>(`/api/pedigrees/${id}`);
      pedigreeId = id;
    } catch {
      // Invalid ID — create new and redirect
      const ped = await api<{ id: string }>("/api/pedigrees", {
        method: "POST",
        body: JSON.stringify({ display_name: "Canvas Pedigree" }),
      });
      pedigreeId = ped.id;
      history.replaceState(null, "", `/pedigrees/${pedigreeId}`);
    }
  } else {
    // No ID in URL — create new pedigree
    const ped = await api<{ id: string }>("/api/pedigrees", {
      method: "POST",
      body: JSON.stringify({ display_name: "Canvas Pedigree" }),
    });
    pedigreeId = ped.id;
    history.replaceState(null, "", `/pedigrees/${pedigreeId}`);
  }
  await refreshState();
  render();
}

init();

// --- Properties panels ---

const panelCallbacks: PanelCallbacks = {
  onUpdate: async () => {
    await refreshState();
    render();
  },
  onClose: () => {
    activePanelTarget = null;
    selectedIndividualId = null;
    render();
  },
  api,
  onBeforeMutation: (label?: string) => {
    pushUndo(captureSnapshot(label ?? "Edit properties"));
  },
};

initPanel(panelCallbacks);
initPedigreePanel(panelCallbacks);
initRelationshipPanel(panelCallbacks);
initEggPanel(panelCallbacks);
initGeneticsPanel(panelCallbacks);
initDiseasePalette(panelCallbacks, {
  getSelectedIds: () => selectedIds,
  getSelectedIndividualId: () => selectedIndividualId,
  getIndividualDiseases: (id: string) => {
    const ind = individuals.find((i) => i.id === id);
    return ind ? ind.diseases.map((d) => d.disease_id) : [];
  },
});

function closeActivePanel(): void {
  if (!activePanelTarget) return;
  switch (activePanelTarget.type) {
    case "individual": closePanel(); break;
    case "relationship": closeRelationshipPanel(); break;
    case "egg": closeEggPanel(); break;
    case "pedigree": closePedigreePanel(); break;
    case "genetics": closeGeneticsPanel(); break;
  }
  activePanelTarget = null;
}

async function openPanelFor(target: PanelTarget): Promise<void> {
  closeActivePanel();
  activePanelTarget = target;
  if (!target) return;
  switch (target.type) {
    case "individual":
      selectedIndividualId = target.id;
      await openPanel(target.id);
      break;
    case "relationship":
      await openRelationshipPanel(target.id);
      break;
    case "egg":
      await openEggPanel(target.id);
      break;
    case "pedigree":
      if (pedigreeId) await openPedigreePanel(pedigreeId);
      break;
    case "genetics":
      await openGeneticsPanel();
      break;
  }
}

// --- Side hit-test for connection drawing ---

const SIDE_TOLERANCE = 10;

function hitSide(pos: Point): PlacedIndividual | null {
  for (const ind of individuals) {
    if (ind.x == null || ind.y == null) continue;
    const half = SHAPE_SIZE / 2;
    const leftMid = { x: ind.x - half, y: ind.y };
    const rightMid = { x: ind.x + half, y: ind.y };
    if (
      Math.hypot(pos.x - leftMid.x, pos.y - leftMid.y) <= SIDE_TOLERANCE ||
      Math.hypot(pos.x - rightMid.x, pos.y - rightMid.y) <= SIDE_TOLERANCE
    ) {
      return ind;
    }
  }
  return null;
}

function hasRelationship(idA: string, idB: string): boolean {
  return relationships.some(
    (r) => r.members.includes(idA) && r.members.includes(idB),
  );
}

// --- Parental line hit-tests ---

const PARENTAL_TOLERANCE = 12;

function pointToSegmentDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function hitRelationshipLine(pos: Point): PlacedRelationship | null {
  const half = SHAPE_SIZE / 2;
  for (const rel of relationships) {
    if (rel.members.length < 2) continue;
    const a = individuals.find((i) => i.id === rel.members[0]);
    const b = individuals.find((i) => i.id === rel.members[1]);
    if (!a || !b || a.x == null || a.y == null || b.x == null || b.y == null)
      continue;
    const [left, right] = a.x <= b.x ? [a, b] : [b, a];
    const dist = pointToSegmentDist(
      pos.x,
      pos.y,
      left.x + half,
      left.y,
      right.x - half,
      right.y,
    );
    if (dist <= PARENTAL_TOLERANCE) return rel;
  }
  return null;
}

function hitParentalLine(pos: Point): PlacedRelationship | null {
  const half = SHAPE_SIZE / 2;
  for (const egg of eggs) {
    if (!egg.relationship_id || !egg.individual_id) continue;
    const rel = relationships.find((r) => r.id === egg.relationship_id);
    if (!rel) continue;

    // Compute origin (same logic as render)
    let origin: { x: number; y: number } | null = null;
    if (rel.members.length >= 2) {
      origin = getRelationshipMidpoint(rel);
    } else if (rel.members.length === 1) {
      const parent = individuals.find((i) => i.id === rel.members[0]);
      if (parent && parent.x != null && parent.y != null) {
        origin = { x: parent.x, y: parent.y + half };
      }
    } else if (rel.members.length === 0) {
      // Unknown parents: virtual origin above siblings
      const siblingEggs = eggs.filter((e) => e.relationship_id === rel.id && e.individual_id);
      const siblings = siblingEggs
        .map((e) => individuals.find((i) => i.id === e.individual_id))
        .filter((i): i is PlacedIndividual => i != null && i.x != null && i.y != null);
      if (siblings.length >= 2) {
        const avgX = siblings.reduce((s, c) => s + c.x, 0) / siblings.length;
        const minY = Math.min(...siblings.map((c) => c.y - half));
        origin = { x: avgX, y: minY - SIBLING_BAR_HEIGHT * 1.5 };
      }
    }
    if (!origin) continue;

    const child = individuals.find((i) => i.id === egg.individual_id);
    if (!child || child.x == null || child.y == null) continue;
    const childTopX = child.x;
    const childTopY = child.y - half;
    const midY = (origin.y + childTopY) / 2;

    // Test against 3 segments: origin→midY, midY horizontal, vertical→child
    const d1 = pointToSegmentDist(pos.x, pos.y, origin.x, origin.y, origin.x, midY);
    const d2 = pointToSegmentDist(pos.x, pos.y, origin.x, midY, childTopX, midY);
    const d3 = pointToSegmentDist(pos.x, pos.y, childTopX, midY, childTopX, childTopY);
    if (Math.min(d1, d2, d3) <= PARENTAL_TOLERANCE) return rel;
  }
  return null;
}

/** Like hitParentalLine but returns the specific egg ID instead of the relationship. */
function hitParentalLineEgg(pos: Point): PlacedEgg | null {
  const half = SHAPE_SIZE / 2;
  for (const egg of eggs) {
    if (!egg.relationship_id || !egg.individual_id) continue;
    const rel = relationships.find((r) => r.id === egg.relationship_id);
    if (!rel) continue;

    let origin: { x: number; y: number } | null = null;
    if (rel.members.length >= 2) {
      origin = getRelationshipMidpoint(rel);
    } else if (rel.members.length === 1) {
      const parent = individuals.find((i) => i.id === rel.members[0]);
      if (parent && parent.x != null && parent.y != null) {
        origin = { x: parent.x, y: parent.y + half };
      }
    } else if (rel.members.length === 0) {
      const siblingEggs = eggs.filter((e) => e.relationship_id === rel.id && e.individual_id);
      const siblings = siblingEggs
        .map((e) => individuals.find((i) => i.id === e.individual_id))
        .filter((i): i is PlacedIndividual => i != null && i.x != null && i.y != null);
      if (siblings.length >= 2) {
        const avgX = siblings.reduce((s, c) => s + c.x, 0) / siblings.length;
        const minY = Math.min(...siblings.map((c) => c.y - half));
        origin = { x: avgX, y: minY - SIBLING_BAR_HEIGHT * 1.5 };
      }
    }
    if (!origin) continue;

    const child = individuals.find((i) => i.id === egg.individual_id);
    if (!child || child.x == null || child.y == null) continue;
    const childTopX = child.x;
    const childTopY = child.y - half;
    const midY = (origin.y + childTopY) / 2;

    const d1 = pointToSegmentDist(pos.x, pos.y, origin.x, origin.y, origin.x, midY);
    const d2 = pointToSegmentDist(pos.x, pos.y, origin.x, midY, childTopX, midY);
    const d3 = pointToSegmentDist(pos.x, pos.y, childTopX, midY, childTopX, childTopY);
    if (Math.min(d1, d2, d3) <= PARENTAL_TOLERANCE) return egg;
  }
  return null;
}

/** Compute origin point for a relationship's parental structure. */
function getParentalOrigin(rel: PlacedRelationship): { x: number; y: number } | null {
  const half = SHAPE_SIZE / 2;
  if (rel.members.length >= 2) {
    return getRelationshipMidpoint(rel);
  } else if (rel.members.length === 1) {
    const parent = individuals.find((i) => i.id === rel.members[0]);
    if (parent && parent.x != null && parent.y != null) {
      return { x: parent.x, y: parent.y + half };
    }
  } else if (rel.members.length === 0) {
    const siblingEggs = eggs.filter((e) => e.relationship_id === rel.id && e.individual_id);
    const siblings = siblingEggs
      .map((e) => individuals.find((i) => i.id === e.individual_id))
      .filter((i): i is PlacedIndividual => i != null && i.x != null && i.y != null);
    if (siblings.length >= 2) {
      const avgX = siblings.reduce((s, c) => s + c.x, 0) / siblings.length;
      const minY = Math.min(...siblings.map((c) => c.y - half));
      return { x: avgX, y: minY - SIBLING_BAR_HEIGHT * 1.5 };
    }
  }
  return null;
}

/** Hit-test the parental stem: vertical line from origin down to sibling bar. */
function hitParentalStem(pos: Point): PlacedRelationship | null {
  const relsWithEggs = new Set(eggs.filter((e) => e.relationship_id).map((e) => e.relationship_id!));
  for (const relId of relsWithEggs) {
    const rel = relationships.find((r) => r.id === relId);
    if (!rel || rel.members.length === 0) continue; // no stem for parentless siblings
    const origin = getParentalOrigin(rel);
    if (!origin) continue;
    const info = getSiblingBarInfo(rel);
    if (!info) continue;
    const dist = pointToSegmentDist(pos.x, pos.y, origin.x, origin.y, origin.x, info.barY);
    if (dist <= PARENTAL_TOLERANCE) return rel;
  }
  return null;
}

/** Hit-test a sibling vertical drop (bar → child). Returns egg, rel, and fraction along drop. */
function hitSiblingDrop(pos: Point): { egg: PlacedEgg; rel: PlacedRelationship; frac: number } | null {
  const half = SHAPE_SIZE / 2;
  const relsWithEggs = new Set(eggs.filter((e) => e.relationship_id).map((e) => e.relationship_id!));
  for (const relId of relsWithEggs) {
    const rel = relationships.find((r) => r.id === relId);
    if (!rel) continue;
    const info = getSiblingBarInfo(rel);
    if (!info) continue;
    const relEggs = eggs.filter((e) => e.relationship_id === rel.id && e.individual_id);
    const twinGroupMap = getTwinGroups(rel.id);
    const twinEggIds = new Set<string>();
    for (const [, grp] of twinGroupMap) for (const e of grp) twinEggIds.add(e.id);
    const effectiveRegular = relEggs.filter((e) => !twinEggIds.has(e.id));
    for (const egg of effectiveRegular) {
      const child = individuals.find((i) => i.id === egg.individual_id);
      if (!child || child.x == null || child.y == null) continue;
      const childTopY = child.y - half;
      const dist = pointToSegmentDist(pos.x, pos.y, child.x, info.barY, child.x, childTopY);
      if (dist <= PARENTAL_TOLERANCE) {
        const totalLen = childTopY - info.barY;
        const frac = totalLen > 0 ? (pos.y - info.barY) / totalLen : 0;
        return { egg, rel, frac: Math.max(0, Math.min(1, frac)) };
      }
    }
  }
  return null;
}

/** Hit-test a twin chevron arm (apex → twin child). Returns the egg for that twin. */
function hitTwinArm(pos: Point): { egg: PlacedEgg; rel: PlacedRelationship } | null {
  const half = SHAPE_SIZE / 2;
  const relsWithTwinEggs = new Set(
    eggs.filter((e) => e.relationship_id && e.properties?.twin).map((e) => e.relationship_id!)
  );
  for (const relId of relsWithTwinEggs) {
    const rel = relationships.find((r) => r.id === relId);
    if (!rel) continue;
    for (const grpInfo of getAllChevronApexInfos(rel)) {
      for (const egg of grpInfo.groupEggs) {
        const child = individuals.find((i) => i.id === egg.individual_id);
        if (!child || child.x == null || child.y == null) continue;
        const childTopY = child.y - half;
        const dist = pointToSegmentDist(pos.x, pos.y, grpInfo.apexX, grpInfo.apexY, child.x, childTopY);
        if (dist <= PARENTAL_TOLERANCE) return { egg, rel };
      }
    }
  }
  return null;
}

/** Hit-test the monozygotic crossbar between twins. */
function hitMonozygoticBar(pos: Point): { relId: string; eggIds: string[] } | null {
  const half = SHAPE_SIZE / 2;
  const relsWithTwinEggs = new Set(
    eggs.filter((e) => e.relationship_id && e.properties?.twin && e.properties?.monozygotic).map((e) => e.relationship_id!)
  );
  for (const relId of relsWithTwinEggs) {
    const rel = relationships.find((r) => r.id === relId);
    if (!rel) continue;
    for (const grpInfo of getAllChevronApexInfos(rel)) {
      const monoEggs = grpInfo.groupEggs.filter((e) => e.properties?.monozygotic);
      if (monoEggs.length !== 2) continue;
      const tc = monoEggs.map((e) => {
        const ind = individuals.find((i) => i.id === e.individual_id);
        return ind && ind.x != null && ind.y != null ? { x: ind.x, topY: ind.y - half } : null;
      }).filter((t): t is { x: number; topY: number } => t != null);
      if (tc.length !== 2) continue;
      const barY = (grpInfo.apexY + Math.min(tc[0].topY, tc[1].topY)) / 2;
      const frac0 = (barY - grpInfo.apexY) / (tc[0].topY - grpInfo.apexY);
      const frac1 = (barY - grpInfo.apexY) / (tc[1].topY - grpInfo.apexY);
      const barX0 = grpInfo.apexX + (tc[0].x - grpInfo.apexX) * frac0;
      const barX1 = grpInfo.apexX + (tc[1].x - grpInfo.apexX) * frac1;
      const dist = pointToSegmentDist(pos.x, pos.y, barX0, barY, barX1, barY);
      if (dist <= PARENTAL_TOLERANCE) return { relId, eggIds: monoEggs.map((e) => e.id) };
    }
  }
  return null;
}

/** Hit-test the horizontal sibling bar itself. Returns as a selectable element. */
function hitSiblingsBar(pos: Point): PlacedRelationship | null {
  const relsWithEggs = new Set(eggs.filter((e) => e.relationship_id).map((e) => e.relationship_id!));
  for (const relId of relsWithEggs) {
    const rel = relationships.find((r) => r.id === relId);
    if (!rel) continue;
    const info = getSiblingBarInfo(rel);
    if (!info) continue;
    if (Math.abs(pos.y - info.barY) <= PARENTAL_TOLERANCE &&
        pos.x >= info.barLeft - 5 && pos.x <= info.barRight + 5) {
      return rel;
    }
  }
  return null;
}

/**
 * Determine the most specific element hit at a position.
 * Priority: monozygotic bar > twin arm > egg (bottom 1/3 of drop) >
 *           pregnancy (upper 2/3) > siblings bar > parental stem > marriage
 */
function hitLineSegment(pos: Point): HitElement {
  const monoBar = hitMonozygoticBar(pos);
  if (monoBar) return { kind: "egg", eggId: monoBar.eggIds[0], relId: monoBar.relId };
  const twin = hitTwinArm(pos);
  if (twin) return { kind: "pregnancy", eggId: twin.egg.id, relId: twin.rel.id };
  const drop = hitSiblingDrop(pos);
  if (drop) {
    // Bottom 1/3 of the vertical drop = egg, upper 2/3 = pregnancy
    if (drop.frac >= 2 / 3) {
      return { kind: "egg", eggId: drop.egg.id, relId: drop.rel.id };
    }
    return { kind: "pregnancy", eggId: drop.egg.id, relId: drop.rel.id };
  }
  const bar = hitSiblingsBar(pos);
  if (bar) return { kind: "siblings", relId: bar.id };
  const stem = hitParentalStem(pos);
  if (stem) return { kind: "pregnancies", relId: stem.id };
  const marriage = hitRelationshipLine(pos);
  if (marriage) return { kind: "marriage", relId: marriage.id };
  return null;
}

/** Hit-test any on-screen element (individuals, notes, lines). */
function hitAnyElement(pos: Point): HitElement {
  // Individuals
  const hitRadius = SHAPE_SIZE / 2 + 4;
  const indHit = individuals.find(
    (ind) => ind.x != null && ind.y != null && Math.hypot(pos.x - ind.x, pos.y - ind.y) <= hitRadius,
  );
  if (indHit) return { kind: "individual", id: indHit.id };
  // Floating notes
  if (showAllFloatingNotes) {
    for (const note of floatingNotes) {
      if (!note.visible) continue;
      const b = getNoteBounds(note);
      if (pos.x >= b.x && pos.x <= b.x + b.w && pos.y >= b.y && pos.y <= b.y + b.h) {
        return { kind: "note", id: note.id };
      }
    }
  }
  // Line segments
  return hitLineSegment(pos);
}

function hitBottom(pos: Point): PlacedIndividual | null {
  const half = SHAPE_SIZE / 2;
  for (const ind of individuals) {
    if (ind.x == null || ind.y == null) continue;
    if (Math.hypot(pos.x - ind.x, pos.y - (ind.y + half)) <= PARENTAL_TOLERANCE) {
      return ind;
    }
  }
  return null;
}

function hitTop(pos: Point): PlacedIndividual | null {
  const half = SHAPE_SIZE / 2;
  for (const ind of individuals) {
    if (ind.x == null || ind.y == null) continue;
    if (Math.hypot(pos.x - ind.x, pos.y - (ind.y - half)) <= PARENTAL_TOLERANCE) {
      return ind;
    }
  }
  return null;
}

function getRelationshipMidpoint(
  rel: PlacedRelationship,
): { x: number; y: number } | null {
  if (rel.members.length < 2) return null;
  const a = individuals.find((i) => i.id === rel.members[0]);
  const b = individuals.find((i) => i.id === rel.members[1]);
  if (!a || !b || a.x == null || a.y == null || b.x == null || b.y == null)
    return null;
  const [left, right] = a.x <= b.x ? [a, b] : [b, a];
  return {
    x: (left.x + SHAPE_EDGE + right.x - SHAPE_EDGE) / 2,
    y: (left.y + right.y) / 2,
  };
}

// --- Sibling bar helpers ---

/** Default height for sibling bar above children (used for parentless siblings and twins) */
const SIBLING_BAR_HEIGHT = SHAPE_SIZE * 1.7;

/**
 * Compute the sibling bar info for a relationship that has offspring eggs.
 * Returns { barY, barLeft, barRight, relId } or null.
 */
function getSiblingBarInfo(rel: PlacedRelationship): { barY: number; barLeft: number; barRight: number; relId: string } | null {
  const half = SHAPE_SIZE / 2;
  const allRelEggs = eggs.filter((e) => e.relationship_id === rel.id && e.individual_id);
  const regularEggs = allRelEggs.filter((e) => !e.properties?.twin);
  const children = regularEggs
    .map((e) => individuals.find((i) => i.id === e.individual_id))
    .filter((i): i is PlacedIndividual => i != null && i.x != null && i.y != null);
  // Need at least regular children (or twins sharing bar) for bar to exist
  if (children.length === 0) return null;

  let origin: { x: number; y: number } | null = null;
  if (rel.members.length >= 2) {
    origin = getRelationshipMidpoint(rel);
  } else if (rel.members.length === 1) {
    const parent = individuals.find((i) => i.id === rel.members[0]);
    if (parent && parent.x != null && parent.y != null) {
      origin = { x: parent.x, y: parent.y + half };
    }
  }

  const noParents = rel.members.length === 0;
  const minTopY = Math.min(...children.map((c) => c.y - half));
  const defaultBarY = noParents
    ? minTopY - SIBLING_BAR_HEIGHT
    : origin ? (origin.y + minTopY) / 2 : minTopY - SIBLING_BAR_HEIGHT;

  const offset = siblingBarOffsets.get(rel.id) ?? 0;
  const barY = defaultBarY + offset;

  const xs = children.map((c) => c.x);
  if (!noParents && origin) xs.push(origin.x);

  // Include all twin group chevron apex X positions so the bar extends to cover all twin groups
  const twinGroups = getTwinGroups(rel.id);
  for (const [, groupEggs] of twinGroups) {
    const groupChildren = groupEggs
      .map((e) => individuals.find((i) => i.id === e.individual_id))
      .filter((i): i is PlacedIndividual => i != null && i.x != null && i.y != null);
    if (groupChildren.length >= 2) {
      const chevronApexX = groupChildren.reduce((s, c) => s + c.x, 0) / groupChildren.length;
      xs.push(chevronApexX);
    }
  }

  const barLeft = Math.min(...xs);
  const barRight = Math.max(...xs);

  return { barY, barLeft, barRight, relId: rel.id };
}

/** Hit-test the sibling horizontal bar. */
function hitSiblingBar(pos: Point): { relId: string; barY: number } | null {
  // Check each relationship that has offspring
  const relsWithEggs = new Set(eggs.filter((e) => e.relationship_id).map((e) => e.relationship_id!));
  for (const relId of relsWithEggs) {
    const rel = relationships.find((r) => r.id === relId);
    if (!rel) continue;
    const info = getSiblingBarInfo(rel);
    if (!info) continue;
    // Check if pos is near the horizontal bar
    if (Math.abs(pos.y - info.barY) <= PARENTAL_TOLERANCE &&
        pos.x >= info.barLeft - 5 && pos.x <= info.barRight + 5) {
      return { relId: info.relId, barY: info.barY };
    }
  }
  return null;
}

/** Group twin eggs by twin_group property. Eggs without twin_group go into "__default__". Groups with <2 eggs are dropped. */
function getTwinGroups(relId: string): Map<string, PlacedEgg[]> {
  const twinEggs = eggs.filter((e) => e.relationship_id === relId && e.individual_id && e.properties?.twin);
  const groups = new Map<string, PlacedEgg[]>();
  for (const egg of twinEggs) {
    const groupId = (egg.properties?.twin_group as string) || "__default__";
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId)!.push(egg);
  }
  for (const [key, grp] of groups) {
    if (grp.length < 2) groups.delete(key);
  }
  return groups;
}

/** Compute the chevron apex position for a twin group within a relationship.
 *  If groupEggs is provided, compute for that specific group; otherwise for ALL twins (legacy). */
function getChevronApexInfo(rel: PlacedRelationship, groupEggs?: PlacedEgg[]): { apexX: number; apexY: number; relId: string } | null {
  const half = SHAPE_SIZE / 2;
  const twinEggs = groupEggs || eggs.filter((e) => e.relationship_id === rel.id && e.individual_id && e.properties?.twin);
  if (twinEggs.length < 2) return null;

  const twinChildren = twinEggs
    .map((e) => individuals.find((i) => i.id === e.individual_id))
    .filter((i): i is PlacedIndividual => i != null && i.x != null && i.y != null);
  if (twinChildren.length < 2) return null;

  // If there's a sibling bar (regular children exist), the apex sits on the bar
  const barInfo = getSiblingBarInfo(rel);
  if (barInfo) {
    const avgX = twinChildren.reduce((s, c) => s + c.x, 0) / twinChildren.length;
    return { apexX: avgX, apexY: barInfo.barY, relId: rel.id };
  }

  // Twins only (no regular children) — compute apex from origin
  let origin: { x: number; y: number } | null = null;
  if (rel.members.length >= 2) {
    origin = getRelationshipMidpoint(rel);
  } else if (rel.members.length === 1) {
    const parent = individuals.find((i) => i.id === rel.members[0]);
    if (parent && parent.x != null && parent.y != null) {
      origin = { x: parent.x, y: parent.y + half };
    }
  } else if (rel.members.length === 0) {
    const avgX = twinChildren.reduce((s, c) => s + c.x, 0) / twinChildren.length;
    const minY = Math.min(...twinChildren.map((c) => c.y - half));
    origin = { x: avgX, y: minY - SIBLING_BAR_HEIGHT * 1.5 };
  }
  if (!origin) return null;

  const avgX = twinChildren.reduce((s, c) => s + c.x, 0) / twinChildren.length;
  const minTopY = Math.min(...twinChildren.map((c) => c.y - half));
  const defaultApexY = minTopY - (minTopY - origin.y) * 0.8;
  const offset = chevronApexOffsets.get(rel.id) ?? 0;

  return { apexX: avgX, apexY: defaultApexY + offset, relId: rel.id };
}

/** Get chevron apex info for all twin groups within a relationship. */
function getAllChevronApexInfos(rel: PlacedRelationship): { apexX: number; apexY: number; relId: string; groupEggs: PlacedEgg[] }[] {
  const groups = getTwinGroups(rel.id);
  const results: { apexX: number; apexY: number; relId: string; groupEggs: PlacedEgg[] }[] = [];
  for (const [, groupEggs] of groups) {
    const info = getChevronApexInfo(rel, groupEggs);
    if (info) results.push({ ...info, groupEggs });
  }
  return results;
}

/** Hit-test the chevron apex point. */
function hitChevronApex(pos: Point): { relId: string } | null {
  const relsWithTwinEggs = new Set(
    eggs.filter((e) => e.relationship_id && e.properties?.twin).map((e) => e.relationship_id!)
  );
  for (const relId of relsWithTwinEggs) {
    const rel = relationships.find((r) => r.id === relId);
    if (!rel) continue;
    for (const info of getAllChevronApexInfos(rel)) {
      if (Math.hypot(pos.x - info.apexX, pos.y - info.apexY) <= PARENTAL_TOLERANCE) {
        return { relId: info.relId };
      }
    }
  }
  return null;
}

// --- Floating note hit-test ---

const NOTE_WIDTH = 140;
const NOTE_LINE_HEIGHT = 14;
const NOTE_PADDING = 8;

function getNoteBounds(note: FloatingNote): { x: number; y: number; w: number; h: number } {
  const lines = (note.text || "").split("\n");
  const h = Math.max(NOTE_LINE_HEIGHT * lines.length + NOTE_PADDING * 2, 30);
  return { x: note.x, y: note.y, w: NOTE_WIDTH, h };
}

function hitFloatingNote(pos: Point): FloatingNote | null {
  if (!showAllFloatingNotes) return null;
  for (const note of floatingNotes) {
    if (!note.visible) continue;
    const b = getNoteBounds(note);
    if (pos.x >= b.x && pos.x <= b.x + b.w && pos.y >= b.y && pos.y <= b.y + b.h) {
      return note;
    }
  }
  return null;
}

// --- Individual note hit-test ---

function hitIndividualNote(pos: Point): PlacedIndividual | null {
  for (const ind of individuals) {
    if (ind.x == null || ind.y == null) continue;
    if (!ind.properties?.show_notes || !ind.notes) continue;
    const offsetX = (ind.properties.note_offset_x as number) ?? 0;
    const offsetY = (ind.properties.note_offset_y as number) ?? SHAPE_SIZE;
    const noteX = ind.x + offsetX;
    const noteY = ind.y + offsetY;
    const lines = wrapText(ind.notes, 120);
    const w = 120;
    const h = lines.length * 14 + 4;
    if (pos.x >= noteX - 2 && pos.x <= noteX + w + 2 && pos.y >= noteY - 2 && pos.y <= noteY + h + 2) {
      return ind;
    }
  }
  return null;
}

// --- Display name label hit-test ---

const LABEL_FONT_SIZE = 11;
const LABEL_CHAR_WIDTH = 6.5; // approximate at 11px
const LABEL_LINE_HEIGHT = 14;
const LABEL_DEFAULT_OFFSET_Y = SHAPE_SIZE / 2 + 6;

function getDisplayNameBounds(ind: PlacedIndividual): { x: number; y: number; w: number; h: number } | null {
  if (!ind.display_name || ind.x == null || ind.y == null) return null;
  const offsetX = (ind.properties?.display_name_offset_x as number) ?? 0;
  const offsetY = (ind.properties?.display_name_offset_y as number) ?? LABEL_DEFAULT_OFFSET_Y;
  const w = ind.display_name.length * LABEL_CHAR_WIDTH;
  const h = LABEL_LINE_HEIGHT;
  const x = ind.x + offsetX - w / 2;
  const y = ind.y + offsetY;
  return { x, y, w, h };
}

function hitDisplayNameLabel(pos: Point): PlacedIndividual | null {
  for (const ind of individuals) {
    const b = getDisplayNameBounds(ind);
    if (!b) continue;
    if (pos.x >= b.x - 2 && pos.x <= b.x + b.w + 2 && pos.y >= b.y - 2 && pos.y <= b.y + b.h + 2) {
      return ind;
    }
  }
  return null;
}

// --- Drawing handlers ---

function beginStroke(pos: Point) {
  drawing = true;
  hoveredElement = null;
  points = [pos];
  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoomScale, zoomScale);
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  ctx.strokeStyle = cssVar("--color-stroke");
  ctx.lineWidth = 2 / zoomScale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  const pos = pointerPos(e);
  pointerMoved = false;
  clickHitId = null;
  hoveredElement = null;

  // Middle-click or Space+click → pan
  if (e.button === 1 || (e.button === 0 && spaceDown)) {
    const spos = pointerScreenPos(e);
    panning = true;
    panStartX = spos.x;
    panStartY = spos.y;
    panStartPanX = panX;
    panStartPanY = panY;
    return;
  }

  // Priority 0a: Floating note drag
  const noteHit = hitFloatingNote(pos);
  if (noteHit) {
    selectedNoteId = noteHit.id;
    selectedElement = { kind: "note", id: noteHit.id };
    draggingNoteId = noteHit.id;
    noteDragOffset = { dx: noteHit.x - pos.x, dy: noteHit.y - pos.y };
    render();
    return;
  }

  // Priority 0b: Individual note drag
  const indNoteHit = hitIndividualNote(pos);
  if (indNoteHit) {
    draggingIndNoteId = indNoteHit.id;
    const offsetX = (indNoteHit.properties.note_offset_x as number) ?? 0;
    const offsetY = (indNoteHit.properties.note_offset_y as number) ?? SHAPE_SIZE;
    indNoteDragOffset = { dx: (indNoteHit.x + offsetX) - pos.x, dy: (indNoteHit.y + offsetY) - pos.y };
    return;
  }

  // Priority 0c: Display name label drag
  const labelHit = hitDisplayNameLabel(pos);
  if (labelHit) {
    draggingLabelId = labelHit.id;
    const offsetX = (labelHit.properties?.display_name_offset_x as number) ?? 0;
    const offsetY = (labelHit.properties?.display_name_offset_y as number) ?? LABEL_DEFAULT_OFFSET_Y;
    labelDragOffset = { dx: (labelHit.x + offsetX) - pos.x, dy: (labelHit.y + offsetY) - pos.y };
    return;
  }

  // Priority 1: Hit bottom of individual → parental line from parent
  const bottomHit = hitBottom(pos);
  if (bottomHit) {
    drawingParentalLine = true;
    parentalSource = { type: "parent", indId: bottomHit.id };
    beginStroke(pos);
    return;
  }

  // Priority 2: Hit top of individual → child source (for sibling/twin connections)
  const topHit = hitTop(pos);
  if (topHit) {
    drawingParentalLine = true;
    parentalSource = { type: "child", indId: topHit.id };
    beginStroke(pos);
    return;
  }

  // Priority 3: Hit existing parental line → add sibling or click to open egg panel
  const parentalHit = hitParentalLine(pos);
  if (parentalHit) {
    const eggHit = hitParentalLineEgg(pos);
    clickHitEggId = eggHit ? eggHit.id : null;
    clickHitLineSegment = hitLineSegment(pos);
    drawingParentalLine = true;
    parentalSource = { type: "relationship", relId: parentalHit.id };
    beginStroke(pos);
    return;
  }

  // Priority 4: Hit relationship line → parental line or click to open relationship panel
  const relHit = hitRelationshipLine(pos);
  if (relHit) {
    clickHitRelId = relHit.id;
    clickHitLineSegment = { kind: "marriage", relId: relHit.id };
    drawingParentalLine = true;
    parentalSource = { type: "relationship", relId: relHit.id };
    beginStroke(pos);
    return;
  }

  // Priority 4: Near side of any shape → enter connecting mode
  const sideHit = hitSide(pos);
  if (sideHit) {
    connecting = true;
    connectSourceId = sideHit.id;
    beginStroke(pos);
    return;
  }

  // Priority 5: Hit chevron apex → drag apex
  const apexHit = hitChevronApex(pos);
  if (apexHit) {
    draggingApex = true;
    dragRelId = apexHit.relId;
    dragStartMouseY = pos.y;
    dragStartOffset = chevronApexOffsets.get(apexHit.relId) ?? 0;
    return;
  }

  // Priority 6: Hit sibling bar → drag bar
  const barHit = hitSiblingBar(pos);
  if (barHit) {
    draggingBar = true;
    dragRelId = barHit.relId;
    dragStartMouseY = pos.y;
    dragStartOffset = siblingBarOffsets.get(barHit.relId) ?? 0;
    return;
  }

  // Hit-test existing individuals
  const hitRadius = SHAPE_SIZE / 2 + 4;
  const hit = individuals.find(
    (ind) =>
      ind.x != null &&
      ind.y != null &&
      Math.hypot(pos.x - ind.x, pos.y - ind.y) <= hitRadius,
  );

  clickExtend = e.ctrlKey || e.metaKey || e.shiftKey;

  if (hit && clickExtend) {
    // Ctrl/Shift+click → toggle individual in/out of selection
    clickHitId = hit.id;
    hoveredElement = null;
    // Merge selectedIndividualId into selectedIds so toggle works uniformly
    if (selectedIndividualId) {
      selectedIds.add(selectedIndividualId);
      selectedIndividualId = null;
    }
    if (selectedIds.has(hit.id)) {
      selectedIds.delete(hit.id);
    } else {
      selectedIds.add(hit.id);
    }
    selectedElement = null;
    selectedNoteId = null;
    render();
    // Don't start drag or open panel — just toggle
  } else if (hit && selectedIds.has(hit.id)) {
    // Hit a selected shape → group drag all selected
    clickHitId = hit.id;
    hoveredElement = null;
    dragging = true;
    const moveLabel = selectedIds.size === 1
      ? `Move ${individuals.find((i) => selectedIds.has(i.id))?.display_name || "individual"}`
      : `Move ${selectedIds.size} individuals`;
    preDragSnapshot = captureSnapshot(moveLabel);
    groupDragOffsets = new Map();
    for (const id of selectedIds) {
      const ind = individuals.find((i) => i.id === id);
      if (ind && ind.x != null && ind.y != null) {
        groupDragOffsets.set(id, { dx: ind.x - pos.x, dy: ind.y - pos.y });
      }
    }
  } else if (hit) {
    // Hit an unselected shape → clear lasso selection, single drag
    clickHitId = hit.id;
    selectedIds = new Set();
    selectedElement = null;
    selectedNoteId = null;
    dragging = true;
    preDragSnapshot = captureSnapshot(`Move ${hit.display_name || "individual"}`);
    groupDragOffsets = new Map();
    groupDragOffsets.set(hit.id, { dx: hit.x - pos.x, dy: hit.y - pos.y });
    render();
  } else {
    // Hit nothing → clear all selection, close panel, enter draw mode
    clickExtend = false;
    selectedIds = new Set();
    selectedIndividualId = null;
    selectedElement = null;
    selectedNoteId = null;
    closeActivePanel();
    render();
    beginStroke(pos);
  }
});

canvas.addEventListener("pointermove", (e) => {
  pointerMoved = true;

  // Pan handling (uses screen coords)
  if (panning) {
    canvas.style.cursor = "grabbing";
    const spos = pointerScreenPos(e);
    panX = panStartPanX + (spos.x - panStartX);
    panY = panStartPanY + (spos.y - panStartY);
    render();
    return;
  }

  const pos = pointerPos(e);
  lastMousePos = pos;

  // Floating note drag
  if (draggingNoteId) {
    const note = floatingNotes.find((n) => n.id === draggingNoteId);
    if (note) {
      note.x = pos.x + noteDragOffset.dx;
      note.y = pos.y + noteDragOffset.dy;
      render();
    }
    return;
  }

  // Individual note drag
  if (draggingIndNoteId) {
    const ind = individuals.find((i) => i.id === draggingIndNoteId);
    if (ind && ind.x != null && ind.y != null) {
      ind.properties.note_offset_x = (pos.x + indNoteDragOffset.dx) - ind.x;
      ind.properties.note_offset_y = (pos.y + indNoteDragOffset.dy) - ind.y;
      render();
    }
    return;
  }

  // Display name label drag
  if (draggingLabelId) {
    const ind = individuals.find((i) => i.id === draggingLabelId);
    if (ind && ind.x != null && ind.y != null) {
      ind.properties.display_name_offset_x = (pos.x + labelDragOffset.dx) - ind.x;
      ind.properties.display_name_offset_y = (pos.y + labelDragOffset.dy) - ind.y;
      render();
    }
    return;
  }

  if ((draggingBar || draggingApex) && dragRelId) {
    const newOffset = dragStartOffset + (pos.y - dragStartMouseY);
    if (draggingBar) {
      siblingBarOffsets.set(dragRelId, newOffset);
    } else {
      chevronApexOffsets.set(dragRelId, newOffset);
    }
    render();
    return;
  }

  if (dragging && groupDragOffsets.size > 0) {
    for (const [id, offset] of groupDragOffsets) {
      const ind = individuals.find((i) => i.id === id);
      if (ind) {
        ind.x = pos.x + offset.dx;
        ind.y = pos.y + offset.dy;
      }
    }
    render();
    return;
  }

  if (!drawing) {
    // Hover tracking when idle
    const prevHover = hoveredElement;
    hoveredElement = hitAnyElement(pos);
    // Update cursor
    canvas.style.cursor = hoveredElement ? "pointer" : "";
    // Re-render only if hover changed
    if (!hitElementsEqual(prevHover, hoveredElement)) render();
    return;
  }
  points.push(pos);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
});

canvas.addEventListener("pointerup", (e) => {
  // Pan end
  if (panning) {
    panning = false;
    canvas.style.cursor = spaceDown ? "grab" : "";
    return;
  }

  // Floating note drag end
  if (draggingNoteId) {
    const note = floatingNotes.find((n) => n.id === draggingNoteId);
    draggingNoteId = null;
    if (note && pedigreeId) {
      patchFloatingNotes();
    }
    return;
  }

  // Individual note drag end
  if (draggingIndNoteId) {
    const ind = individuals.find((i) => i.id === draggingIndNoteId);
    draggingIndNoteId = null;
    if (ind) {
      api(`/api/individuals/${ind.id}`, {
        method: "PATCH",
        body: JSON.stringify({ properties: ind.properties }),
      });
    }
    return;
  }

  // Display name label drag end
  if (draggingLabelId) {
    const ind = individuals.find((i) => i.id === draggingLabelId);
    draggingLabelId = null;
    if (ind) {
      api(`/api/individuals/${ind.id}`, {
        method: "PATCH",
        body: JSON.stringify({ properties: ind.properties }),
      });
    }
    return;
  }

  // Bar / apex drag end
  if (draggingBar || draggingApex) {
    draggingBar = false;
    draggingApex = false;
    dragRelId = null;
    return;
  }

  // Single-click (no drag) on an individual → open properties panel
  if (clickHitId && !pointerMoved) {
    const id = clickHitId;
    if (clickExtend) {
      // Extended selection was already handled in pointerdown — just clean up
      clickHitId = null;
      clickExtend = false;
      dragging = false;
      preDragSnapshot = null;
      groupDragOffsets = new Map();
      drawing = false;
      return;
    }
    selectedIds = new Set();
    selectedElement = { kind: "individual", id };
    selectedNoteId = null;
    dragging = false;
    preDragSnapshot = null;
    groupDragOffsets = new Map();
    drawing = false;
    render();
    openPanelFor({ type: "individual", id });
    clickHitId = null;
    return;
  }
  clickHitId = null;

  if (dragging && groupDragOffsets.size > 0) {

    const movedIndividuals: { id: string; x: number; y: number }[] = [];
    for (const id of groupDragOffsets.keys()) {
      const ind = individuals.find((i) => i.id === id);
      if (ind) {
        const snapped = snapXY(ind.x, ind.y);
        ind.x = snapped.x;
        ind.y = snapped.y;
        movedIndividuals.push({ id: ind.id, x: ind.x, y: ind.y });
      }
    }
    dragging = false;
    groupDragOffsets = new Map();
    if (movedIndividuals.length > 0 && preDragSnapshot) {
      pushUndo(preDragSnapshot);
      preDragSnapshot = null;
      handleGroupDragEnd(movedIndividuals);
    } else {
      preDragSnapshot = null;
    }
    return;
  }

  if (!drawing) return;
  drawing = false;
  ctx.restore(); // matches beginStroke's ctx.save()

  // Parental line mode
  if (drawingParentalLine) {
    const source = parentalSource;
    drawingParentalLine = false;
    parentalSource = null;

    // Single-click (no drag) on parental line → select line + open egg panel
    if (!pointerMoved && clickHitEggId) {
      const eggId = clickHitEggId;
      selectedElement = clickHitLineSegment;
      clickHitEggId = null;
      clickHitRelId = null;
      clickHitLineSegment = null;
      selectedIndividualId = null;
      selectedIds = new Set();
      render();
      openPanelFor({ type: "egg", id: eggId });
      return;
    }

    // Single-click (no drag) on relationship line → select line + open relationship panel
    if (!pointerMoved && clickHitRelId) {
      const relId = clickHitRelId;
      selectedElement = clickHitLineSegment;
      clickHitRelId = null;
      clickHitEggId = null;
      clickHitLineSegment = null;
      selectedIndividualId = null;
      selectedIds = new Set();
      render();
      openPanelFor({ type: "relationship", id: relId });
      return;
    }

    clickHitRelId = null;
    clickHitEggId = null;
    clickHitLineSegment = null;

    if (points.length > 0 && source) {
      const endpoint = points[points.length - 1];

      // For parental line endpoints, accept hitting anywhere on the shape
      const hitRadius = SHAPE_SIZE / 2 + 4;
      const hitIndividual = (pos: Point) =>
        individuals.find(
          (ind) =>
            ind.x != null &&
            ind.y != null &&
            Math.hypot(pos.x - ind.x, pos.y - ind.y) <= hitRadius,
        ) ?? null;

      if (source.type === "relationship") {
        const child = hitIndividual(endpoint);
        if (child) {
          render();
          pushUndo(captureSnapshot("Add child"));
          handleParentalLineFromRelationship(source.relId, child.id);
        } else {
          // Check if endpoint hits another relationship's parental structure or marriage line
          const targetParental = hitParentalLine(endpoint);
          const targetMarriage = hitRelationshipLine(endpoint);
          if (targetParental && targetParental.id !== source.relId) {
            render();
            pushUndo(captureSnapshot("Merge relationships"));
            const targetRel = relationships.find((r) => r.id === targetParental.id);
            // Merge into whichever relationship has members (parents)
            if (targetRel && targetRel.members.length > 0) {
              handleMergeRelationships(targetParental.id, source.relId);
            } else {
              handleMergeRelationships(source.relId, targetParental.id);
            }
          } else if (targetMarriage && targetMarriage.id !== source.relId) {
            render();
            pushUndo(captureSnapshot("Merge relationships"));
            const targetRel = relationships.find((r) => r.id === targetMarriage.id);
            if (targetRel && targetRel.members.length > 0) {
              handleMergeRelationships(targetMarriage.id, source.relId);
            } else {
              handleMergeRelationships(source.relId, targetMarriage.id);
            }
          } else {
            rejectStroke(points);
          }
        }
      } else if (source.type === "parent") {
        const child = hitIndividual(endpoint);
        if (child && child.id !== source.indId) {
          render();
          pushUndo(captureSnapshot("Add child"));
          handleParentalLineFromIndividual(source.indId, child.id);
        } else {
          rejectStroke(points);
        }
      } else if (source.type === "child") {
        // Check if endpoint hits top or body of another individual → sibling/twin
        const topTarget = hitTop(endpoint) ?? hitIndividual(endpoint);
        if (topTarget && topTarget.id !== source.indId) {
          const isChevron = detectChevron(points);
          render();
          pushUndo(captureSnapshot("Connect siblings"));
          handleSiblingConnection(source.indId, topTarget.id, isChevron);
        } else {
          // Reverse: child → relationship line
          const relTarget = hitRelationshipLine(endpoint);
          if (relTarget) {
            render();
            pushUndo(captureSnapshot("Add child"));
            handleParentalLineFromRelationship(relTarget.id, source.indId);
          } else {
            rejectStroke(points);
          }
        }
      }
    }
    return;
  }

  // Connection mode: check if endpoint hits a different individual's side
  if (connecting) {
    const sourceId = connectSourceId;
    connecting = false;
    connectSourceId = null;

    if (points.length > 0) {
      const endpoint = points[points.length - 1];
      const target = hitSide(endpoint);
      if (target && sourceId && target.id !== sourceId && !hasRelationship(sourceId, target.id)) {
        pushUndo(captureSnapshot("Connect partners"));
        handleConnectionEnd(sourceId, target.id);
      } else {
        rejectStroke(points);
      }
    }
    return;
  }

  // Check for lasso selection
  if (points.length >= 3) {
    const first = points[0];
    const last = points[points.length - 1];
    const gap = Math.hypot(last.x - first.x, last.y - first.y);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
    const bboxSize = Math.max(maxX - minX, maxY - minY, 1);
    const isClosed = gap < bboxSize * 0.5;

    if (isClosed) {
      const enclosed = individuals.filter(
        (ind) =>
          ind.x != null &&
          ind.y != null &&
          pointInPolygon({ x: ind.x, y: ind.y }, points),
      );

      if (enclosed.length > 0) {
        const enclosedIds = new Set(enclosed.map((ind) => ind.id));
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          // Add to existing selection
          if (selectedIndividualId) {
            selectedIds.add(selectedIndividualId);
            selectedIndividualId = null;
          }
          for (const id of enclosedIds) selectedIds.add(id);
        } else {
          selectedIds = enclosedIds;
          selectedIndividualId = null;
          closeActivePanel();
        }
        render();
        return;
      }
    }
  }

  // Check for diagonal stroke through a relationship line → separation/divorce
  if (points.length >= 2 && tryDiagonalStrokeRelationship(points)) {
    return;
  }

  // Check for diagonal stroke through an individual → death/suicide
  if (points.length >= 2 && tryDiagonalStroke(points)) {
    return;
  }

  // Check for monozygotic bar: short, roughly horizontal stroke crossing twin chevron arms
  if (points.length >= 2 && tryMarkMonozygotic(points)) {
    render();
    return;
  }

  // Try scribble-delete BEFORE shape recognition — scribbles over existing
  // entities often get mis-recognised as circles/squares
  if (tryScribbleDelete(points)) return;

  // If the stroke crosses any existing line, it cannot be a new individual
  if (strokeCrossesLine(points)) {
    rejectStroke(points);
    return;
  }

  const shape = recognise(points);

  if (import.meta.env.DEV) {
    showToast(shape);
  }

  const sex = SHAPE_TO_SEX[shape];
  if (!sex) {
    // Flash the stroke red, then clear
    rejectStroke(points);
    return;
  }

  const center = centroid(points);
  const snapped = snapXY(center.x, center.y);

  // Immediately clear freehand stroke and show perfect shape
  render();

  pushUndo(captureSnapshot("Add individual"));
  handleShapePlaced(sex, snapped.x, snapped.y);
});

// Double-click on floating note → edit
canvas.addEventListener("dblclick", (e) => {
  const pos = pointerPos(e);
  const noteHit = hitFloatingNote(pos);
  if (noteHit) {
    openNoteEditor(noteHit);
    return;
  }
});

// --- Shape placement pipeline ---

async function handleShapePlaced(biologicalSex: string, x: number, y: number) {
  if (!pedigreeId) {
    console.warn("No pedigree yet — skipping placement");
    return;
  }

  try {
    // 1. Create individual
    const ind = await api<{ id: string }>("/api/individuals", {
      method: "POST",
      body: JSON.stringify({ biological_sex: biologicalSex, x, y }),
    });

    // 2. Add to pedigree
    await api(`/api/pedigrees/${pedigreeId}/individuals/${ind.id}`, {
      method: "POST",
    });

    // 3. Refresh full state
    await refreshState();

    // 4. Select and open panel
    selectedIds = new Set();
    selectedIndividualId = ind.id;
    render();
    await openPanelFor({ type: "individual", id: ind.id });
    focusDisplayName();
  } catch (err) {
    console.error("Failed to place individual:", err);
  }
}

// --- Connection completion ---

async function handleConnectionEnd(sourceId: string, targetId: string) {
  if (!pedigreeId) {
    console.warn("No pedigree yet — skipping connection");
    return;
  }

  try {
    // 1. Create relationship
    const rel = await api<{ id: string }>("/api/relationships", {
      method: "POST",
      body: JSON.stringify({ members: [sourceId, targetId] }),
    });

    // 2. Add to pedigree
    await api(`/api/pedigrees/${pedigreeId}/relationships/${rel.id}`, {
      method: "POST",
    });

    // 3. Refresh full state
    await refreshState();

    // 4. Select and open panel
    selectedIds = new Set();
    selectedIndividualId = null;
    render();
    await openPanelFor({ type: "relationship", id: rel.id });
    focusRelationshipDisplayName();
  } catch (err) {
    console.error("Failed to create relationship:", err);
  }
}

// --- Drag completion ---

async function handleGroupDragEnd(movedIndividuals: { id: string; x: number; y: number }[]) {
  try {
    await Promise.all(
      movedIndividuals.map(({ id, x, y }) =>
        api(`/api/individuals/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ x, y }),
        }),
      ),
    );

    // Refresh full state
    if (pedigreeId) {
      await refreshState();
      render();
    }
  } catch (err) {
    console.error("Failed to move individuals:", err);
  }
}

// --- Shared state refresh ---

async function refreshDiseases() {
  try {
    const list = await api<DiseaseInfo[]>("/api/diseases");
    diseaseCatalog = new Map(list.map((d) => [d.id, d]));
  } catch {
    // Disease catalog unavailable — symbols render without disease fills
  }
}

async function refreshState() {
  if (!pedigreeId) return;
  const [detail] = await Promise.all([
    api<{
      individuals: PlacedIndividual[];
      relationships: PlacedRelationship[];
      eggs: PlacedEgg[];
      properties: Record<string, unknown>;
    }>(`/api/pedigrees/${pedigreeId}`),
    refreshDiseases(),
  ]);
  individuals = detail.individuals;
  relationships = detail.relationships ?? [];
  eggs = expandEggs(detail.eggs ?? []);
  // Load floating notes from pedigree properties
  floatingNotes = (detail.properties?.floating_notes as FloatingNote[]) ?? [];
  // Refresh disease palette and key (non-blocking)
  refreshDiseasePalette();
  refreshDiseaseKey();
  // Auto-calculate consanguinity for non-overridden relationships (non-blocking)
  if (pedigreeId && relationships.some((r) => r.members.length >= 2)) {
    api<{ results: { relationship_id: string; consanguinity: number | null }[] }>(
      `/api/pedigrees/${pedigreeId}/calculate-consanguinity`,
      { method: "POST" },
    ).then((res) => {
      for (const r of res.results) {
        const rel = relationships.find((rl) => rl.id === r.relationship_id);
        if (rel) rel.consanguinity = r.consanguinity;
      }
      render();
    }).catch(() => {});
  }
}

/** Assign grid positions to individuals that have no x/y, then PATCH them. */
async function autoLayoutUnpositioned() {
  const unpositioned = individuals.filter((i) => i.x == null || i.y == null);
  if (unpositioned.length === 0) return;

  // Find the bounding box of already-positioned individuals
  const positioned = individuals.filter((i) => i.x != null && i.y != null);
  let startX = GRID_SIZE * 2;
  let startY = GRID_SIZE * 2;
  if (positioned.length > 0) {
    const maxY = Math.max(...positioned.map((i) => i.y));
    startY = maxY + GRID_SIZE * 3;
    startX = Math.min(...positioned.map((i) => i.x));
  }

  // Place in a grid row
  const cols = Math.max(Math.ceil(Math.sqrt(unpositioned.length)), 1);
  for (let i = 0; i < unpositioned.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const snapped = snapXY(startX + col * GRID_SIZE * 2, startY + row * GRID_SIZE * 2);
    unpositioned[i].x = snapped.x;
    unpositioned[i].y = snapped.y;
  }

  // Persist positions
  await Promise.all(
    unpositioned.map((ind) =>
      api(`/api/individuals/${ind.id}`, {
        method: "PATCH",
        body: JSON.stringify({ x: ind.x, y: ind.y }),
      })
    )
  );
}

// --- Parental line handlers ---

async function handleParentalLineFromRelationship(
  relId: string,
  childId: string,
) {
  if (!pedigreeId) return;
  try {
    await api(`/api/relationships/${relId}/offspring`, {
      method: "POST",
      body: JSON.stringify({
        individual_id: childId,
        pedigree_id: pedigreeId,
      }),
    });
    await refreshState();
    render();
  } catch (err) {
    console.error("Failed to add offspring from relationship:", err);
    showToast("error" as Shape);
  }
}

/** Move all eggs from donorRelId into targetRelId, then clean up the donor if empty. */
async function handleMergeRelationships(targetRelId: string, donorRelId: string) {
  if (!pedigreeId) return;
  try {
    const donorEggs = eggs.filter((e) => e.relationship_id === donorRelId && e.individual_id);
    for (const egg of donorEggs) {
      await api(`/api/eggs/${egg.id}`, {
        method: "PATCH",
        body: JSON.stringify({ relationship_id: targetRelId }),
      });
    }
    // If donor has no members left, delete it
    const donorRel = relationships.find((r) => r.id === donorRelId);
    if (donorRel && donorRel.members.length === 0) {
      await api(`/api/relationships/${donorRelId}`, { method: "DELETE" });
    }
    await refreshState();
    render();
  } catch (err) {
    console.error("Failed to merge relationships:", err);
    showToast("error" as Shape);
  }
}

async function handleParentalLineFromIndividual(
  parentId: string,
  childId: string,
) {
  if (!pedigreeId) return;
  try {
    // Find existing 1-member relationship for this parent
    let rel = relationships.find(
      (r) => r.members.length === 1 && r.members[0] === parentId,
    );

    if (!rel) {
      // Create a 1-member relationship
      const newRel = await api<{ id: string }>("/api/relationships", {
        method: "POST",
        body: JSON.stringify({ members: [parentId] }),
      });
      // Add to pedigree
      await api(
        `/api/pedigrees/${pedigreeId}/relationships/${newRel.id}`,
        { method: "POST" },
      );
      rel = { id: newRel.id, members: [parentId], consanguinity: null, consanguinity_override: false, properties: {}, events: [] };
    }

    await api(`/api/relationships/${rel!.id}/offspring`, {
      method: "POST",
      body: JSON.stringify({
        individual_id: childId,
        pedigree_id: pedigreeId,
      }),
    });
    await refreshState();
    render();
  } catch (err) {
    console.error("Failed to add offspring from individual:", err);
    showToast("error" as Shape);
  }
}

// --- Sibling / twin connection ---

/**
 * Detect if a stroke forms a chevron (inverted-V) rather than a stepped line.
 */
function detectChevron(pts: Point[]): boolean {
  if (pts.length < 5) return false;

  const startY = pts[0].y;
  const endY = pts[pts.length - 1].y;

  // Find the highest point (lowest y) — skip first/last 10%
  let peakIdx = -1;
  let peakY = Infinity;
  const margin = Math.max(1, Math.floor(pts.length * 0.1));
  for (let i = margin; i < pts.length - margin; i++) {
    if (pts[i].y < peakY) {
      peakY = pts[i].y;
      peakIdx = i;
    }
  }
  if (peakIdx < 0) return false;

  // Peak must be above both endpoints
  const rise = Math.min(startY - peakY, endY - peakY);
  if (rise < 15) return false;

  // Measure how much of the stroke is "flat" near the top.
  // A chevron (V-shape) has a sharp peak — few points near the top.
  // A stepped line (U-shape) has a flat segment at the top — many points.
  const flatThreshold = peakY + rise * 0.45;
  let flatCount = 0;
  for (const pt of pts) {
    if (pt.y <= flatThreshold) flatCount++;
  }
  const flatRatio = flatCount / pts.length;

  // Also check directness: how close is the path to two straight segments?
  // A chevron goes down-up with a sharp turn; a stepped line meanders horizontally.
  const peak = pts[peakIdx];
  const start = pts[0];
  const end = pts[pts.length - 1];
  const directLen = Math.hypot(start.x - peak.x, start.y - peak.y)
    + Math.hypot(end.x - peak.x, end.y - peak.y);
  let pathLen = 0;
  for (let i = 1; i < pts.length; i++) {
    pathLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  const directness = directLen / Math.max(pathLen, 1);

  // Chevron: sharp peak (low flatRatio) AND direct path (high directness)
  // Stepped: flat top (high flatRatio) OR meandering path (low directness)
  const result = flatRatio < 0.45 && directness > 0.75;
  return result;
}

/** Find the parent relationship for an individual (via eggs). */
function findParentRelationship(indId: string): PlacedRelationship | null {
  const egg = eggs.find((e) => e.individual_id === indId && e.relationship_id);
  if (!egg) return null;
  return relationships.find((r) => r.id === egg.relationship_id) ?? null;
}

/** Check if an individual already has an egg under a given relationship. */
function hasEggUnder(indId: string, relId: string): boolean {
  return eggs.some((e) => e.individual_id === indId && e.relationship_id === relId);
}

async function handleSiblingConnection(
  indAId: string,
  indBId: string,
  twin: boolean,
) {
  if (!pedigreeId) return;
  try {
    // Find parent relationships for both individuals
    const relA = findParentRelationship(indAId);
    const relB = findParentRelationship(indBId);

    // If neither has a parent relationship, create one (unknown parents)
    let resolvedRelA = relA;
    let resolvedRelB = relB;
    if (!resolvedRelA && !resolvedRelB) {
      const newRel = await api<{ id: string }>("/api/relationships", {
        method: "POST",
        body: JSON.stringify({ members: [] }),
      });
      await api(`/api/pedigrees/${pedigreeId}/relationships/${newRel.id}`, {
        method: "POST",
      });
      // Add both as offspring
      await api(`/api/relationships/${newRel.id}/offspring`, {
        method: "POST",
        body: JSON.stringify({ individual_id: indAId, pedigree_id: pedigreeId }),
      });
      await api(`/api/relationships/${newRel.id}/offspring`, {
        method: "POST",
        body: JSON.stringify({ individual_id: indBId, pedigree_id: pedigreeId }),
      });
      // Refresh so twin logic below can find the eggs
      await refreshState();
      resolvedRelA = relationships.find((r) => r.id === newRel.id) ?? null;
    }

    if (twin) {
      // Twin: make both individuals twins under a shared parent relationship
      const targetRel = resolvedRelA ?? resolvedRelB;
      if (!targetRel) {
        rejectStroke(points);
        return;
      }

      // Find existing eggs for both individuals under this relationship
      const eggA = eggs.find(
        (e) => e.individual_id === indAId && e.relationship_id === targetRel.id,
      );
      const eggB = eggs.find(
        (e) => e.individual_id === indBId && e.relationship_id === targetRel.id,
      );

      // Determine twin_group: reuse if one already has it, else generate new
      const existingGroup =
        (eggA?.properties?.twin_group as string) ||
        (eggB?.properties?.twin_group as string) ||
        crypto.randomUUID().slice(0, 8);

      // If both already in the same twin group, nothing to do
      if (
        eggA?.properties?.twin &&
        eggB?.properties?.twin &&
        eggA.properties.twin_group === existingGroup &&
        eggB.properties.twin_group === existingGroup
      ) {
        render();
        return;
      }

      // Mark/update existing eggs as twin with group
      if (eggA) {
        if (!eggA.properties?.twin || eggA.properties.twin_group !== existingGroup) {
          await api(`/api/eggs/${eggA.id}`, {
            method: "PATCH",
            body: JSON.stringify({ properties: { ...eggA.properties, twin: true, twin_group: existingGroup } }),
          });
        }
      }
      if (eggB) {
        if (!eggB.properties?.twin || eggB.properties.twin_group !== existingGroup) {
          await api(`/api/eggs/${eggB.id}`, {
            method: "PATCH",
            body: JSON.stringify({ properties: { ...eggB.properties, twin: true, twin_group: existingGroup } }),
          });
        }
      }

      // If one individual doesn't have an egg yet, create it
      if (!eggA) {
        const egg = await api<{ id: string }>("/api/eggs", {
          method: "POST",
          body: JSON.stringify({
            relationship_id: targetRel.id,
            individual_id: indAId,
            properties: { twin: true, twin_group: existingGroup },
          }),
        });
        await api(`/api/pedigrees/${pedigreeId}/eggs/${egg.id}`, {
          method: "POST",
        });
      }
      if (!eggB) {
        const egg = await api<{ id: string }>("/api/eggs", {
          method: "POST",
          body: JSON.stringify({
            relationship_id: targetRel.id,
            individual_id: indBId,
            properties: { twin: true, twin_group: existingGroup },
          }),
        });
        await api(`/api/pedigrees/${pedigreeId}/eggs/${egg.id}`, {
          method: "POST",
        });
      }
    } else {
      // Distinct siblings: add second child under shared parent relationship
      const targetRel = resolvedRelA ?? resolvedRelB;
      if (!targetRel) {
        rejectStroke(points);
        return;
      }
      if (hasEggUnder(indBId, targetRel.id) && hasEggUnder(indAId, targetRel.id)) {
        render();
        return;
      }
      if (!hasEggUnder(indBId, targetRel.id)) {
        await api(`/api/relationships/${targetRel.id}/offspring`, {
          method: "POST",
          body: JSON.stringify({
            individual_id: indBId,
            pedigree_id: pedigreeId,
          }),
        });
      }
      if (!hasEggUnder(indAId, targetRel.id)) {
        await api(`/api/relationships/${targetRel.id}/offspring`, {
          method: "POST",
          body: JSON.stringify({
            individual_id: indAId,
            pedigree_id: pedigreeId,
          }),
        });
      }
    }

    await refreshState();
    render();
  } catch (err) {
    console.error("Failed to create sibling connection:", err);
    showToast("error" as Shape);
  }
}

// --- Delete individuals (shared logic) ---

async function deleteIndividuals(ids: string[]) {
  if (!pedigreeId || ids.length === 0) return;
  const names = ids.map((id) => individuals.find((i) => i.id === id)?.display_name).filter(Boolean);
  const deleteLabel = names.length === 1 && names[0]
    ? `Delete ${names[0]}`
    : ids.length === 1 ? "Delete individual" : `Delete ${ids.length} individuals`;
  pushUndo(captureSnapshot(deleteLabel));
  try {
    for (const id of ids) {
      // 1. Delete eggs where this individual is the child
      const indEggs = eggs.filter((e) => e.individual_id === id);
      for (const egg of indEggs) {
        if (egg.individual_ids.length > 1) {
          // Shared egg (monozygotic) — remove this individual from individual_ids
          const remaining = egg.individual_ids.filter((iid) => iid !== id);
          await api(`/api/eggs/${egg.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              individual_id: remaining.length === 1 ? remaining[0] : null,
              individual_ids: remaining.length > 1 ? remaining : [],
            }),
          });
        } else {
          await api(`/api/eggs/${egg.id}`, { method: "DELETE" });
        }
      }

      // 2. Handle relationships where this individual is a member
      const indRels = relationships.filter((r) => r.members.includes(id));
      for (const rel of indRels) {
        // Remove the individual from the relationship's member list
        await api(`/api/relationships/${rel.id}/members/${id}`, { method: "DELETE" });

        // Check if the relationship should be fully deleted:
        // remaining members after removal
        const remainingMembers = rel.members.filter((m) => m !== id && !ids.includes(m));
        const relEggs = eggs.filter((e) => e.relationship_id === rel.id);
        // Child eggs are those linking a child individual (excluding ones we're already deleting)
        const childEggs = relEggs.filter(
          (e) => e.individual_id && !ids.includes(e.individual_id)
        );

        if (remainingMembers.length === 0 && childEggs.length === 0) {
          // No partners left and no children — delete the relationship and its eggs
          for (const egg of relEggs) {
            await api(`/api/eggs/${egg.id}`, { method: "DELETE" });
          }
          await api(`/api/relationships/${rel.id}`, { method: "DELETE" });
        }
      }

      // 3. Delete the individual
      await api(`/api/individuals/${id}`, { method: "DELETE" });
    }

    selectedIds = new Set();
    selectedIndividualId = null;
    closeActivePanel();
    await refreshState();
    render();
  } catch (err) {
    console.error("Failed to delete individuals:", err);
  }
}

// --- Delete line segments ---

async function deleteSelectedElement(sel: HitElement) {
  if (!sel || !pedigreeId) return;
  if (sel.kind === "individual" || sel.kind === "note") return; // handled elsewhere
  pushUndo(captureSnapshot("Delete connection"));
  try {
    switch (sel.kind) {
      case "marriage":
        await deleteMarriageLine(sel.relId);
        break;
      case "pregnancies":
        await deleteParentalStem(sel.relId);
        break;
      case "siblings":
        // Deleting the sibling bar orphans all children (same as parental stem)
        await deleteParentalStem(sel.relId);
        break;
      case "pregnancy":
        await deleteSiblingDrop(sel.eggId);
        break;
      case "egg":
        await deleteTwinLine(sel.eggId, sel.relId);
        break;
    }
    selectedElement = null;
    closeActivePanel();
    await refreshState();
    render();
  } catch (err) {
    console.error("Failed to delete element:", err);
  }
}

/** Delete a marriage line. No children: delete relationship. With children: orphan them. */
async function deleteMarriageLine(relId: string) {
  const relEggs = eggs.filter((e) => e.relationship_id === relId && e.individual_id);
  if (relEggs.length === 0) {
    // No children — simply delete the relationship
    await api(`/api/relationships/${relId}`, { method: "DELETE" });
  } else {
    // Has children — remove all members to orphan children (sibling relationships remain)
    const rel = relationships.find((r) => r.id === relId);
    if (!rel) return;
    for (const memberId of [...rel.members]) {
      await api(`/api/relationships/${relId}/members/${memberId}`, { method: "DELETE" });
    }
  }
}

/** Delete the parental stem: keep marriage, orphan children into new 0-member relationship. */
async function deleteParentalStem(relId: string) {
  const relEggs = eggs.filter((e) => e.relationship_id === relId && e.individual_id);
  if (relEggs.length === 0) return;
  // Create a new relationship with 0 members to hold the orphaned children
  const newRel = await api<{ id: string }>("/api/relationships", {
    method: "POST",
    body: JSON.stringify({ members: [] }),
  });
  // Add the new relationship to the pedigree
  await api(`/api/pedigrees/${pedigreeId}/relationships/${newRel.id}`, { method: "POST" });
  // Move all eggs to the new relationship
  for (const egg of relEggs) {
    await api(`/api/eggs/${egg.id}`, {
      method: "PATCH",
      body: JSON.stringify({ relationship_id: newRel.id }),
    });
  }
}

/** Delete a sibling vertical drop: remove that child from the family. */
async function deleteSiblingDrop(eggId: string) {
  await api(`/api/eggs/${eggId}`, { method: "DELETE" });
}

/** Delete a twin line: dizygous → non-twin sibling; monozygous → dizygous. */
async function deleteTwinLine(eggId: string, relId: string) {
  const egg = eggs.find((e) => e.id === eggId);
  if (!egg) return;
  // Only affect twins in the same twin_group
  const groupId = (egg.properties?.twin_group as string) || "__default__";
  const groupEggs = eggs.filter(
    (e) => e.relationship_id === relId && e.individual_id && e.properties?.twin &&
    ((e.properties?.twin_group as string) || "__default__") === groupId
  );
  const isMonozygotic = egg.properties?.monozygotic;
  if (isMonozygotic) {
    // Monozygotic → dizygous: split shared egg back into individual eggs
    // Get unique real egg IDs (expanded eggs share the same id)
    const uniqueEggIds = [...new Set(groupEggs.map((e) => e.id))];
    const childIds = groupEggs.map((e) => e.individual_id).filter((id): id is string => id != null);

    for (const realEggId of uniqueEggIds) {
      const realEgg = groupEggs.find((e) => e.id === realEggId)!;
      const props = { ...(realEgg.properties ?? {}), monozygotic: false };

      if (realEgg.individual_ids.length > 1) {
        // Shared egg: update first child on existing egg, create new eggs for the rest
        await api(`/api/eggs/${realEggId}`, {
          method: "PATCH",
          body: JSON.stringify({
            individual_id: childIds[0],
            individual_ids: [],
            properties: props,
          }),
        });
        for (let i = 1; i < childIds.length; i++) {
          const newEgg = await api<{ id: string }>("/api/eggs", {
            method: "POST",
            body: JSON.stringify({
              relationship_id: relId,
              individual_id: childIds[i],
              properties: props,
            }),
          });
          if (pedigreeId) {
            await api(`/api/pedigrees/${pedigreeId}/eggs/${newEgg.id}`, { method: "POST" });
          }
        }
      } else {
        // Already separate eggs — just remove monozygotic flag
        await api(`/api/eggs/${realEggId}`, {
          method: "PATCH",
          body: JSON.stringify({ properties: props }),
        });
      }
    }
  } else {
    // Dizygous → non-twin sibling: remove twin flag from this egg
    const props = { ...(egg.properties ?? {}), twin: false };
    await api(`/api/eggs/${eggId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: props }),
    });
  }
}

// --- Undo/Redo execution ---

async function undo() {
  if (undoStack.length === 0 || !pedigreeId) return;
  const snap = undoStack.pop()!;
  redoStack.push(captureSnapshot(snap.label));
  try {
    await api(`/api/pedigrees/${pedigreeId}/restore`, {
      method: "PUT",
      body: JSON.stringify({
        individuals: snap.individuals,
        relationships: snap.relationships,
        eggs: snap.eggs,
      }),
    });
    await refreshState();
    render();
    updateUndoRedoButtons();
    refreshOpenPanel();
  } catch (err) {
    console.error("Undo failed:", err);
  }
}

async function redo() {
  if (redoStack.length === 0 || !pedigreeId) return;
  const snap = redoStack.pop()!;
  undoStack.push(captureSnapshot(snap.label));
  try {
    await api(`/api/pedigrees/${pedigreeId}/restore`, {
      method: "PUT",
      body: JSON.stringify({
        individuals: snap.individuals,
        relationships: snap.relationships,
        eggs: snap.eggs,
      }),
    });
    await refreshState();
    render();
    updateUndoRedoButtons();
    refreshOpenPanel();
  } catch (err) {
    console.error("Redo failed:", err);
  }
}

/** Re-open the active panel so it reflects current data after undo/redo. */
function refreshOpenPanel(): void {
  if (!activePanelTarget) return;
  // Re-open with same target — panel fetches fresh data from API
  openPanelFor(activePanelTarget);
}

// --- Clipboard ---

function copySelection(): void {
  const ids = new Set<string>(selectedIds);
  if (selectedIndividualId) ids.add(selectedIndividualId);
  if (ids.size === 0) return;

  const copiedInds = individuals.filter((i) => ids.has(i.id));
  const copiedRels = relationships.filter((r) =>
    r.members.every((m) => ids.has(m)),
  );
  const copiedRelIds = new Set(copiedRels.map((r) => r.id));
  // Deduplicate expanded eggs (shared monozygotic eggs appear multiple times)
  const seenEggIds = new Set<string>();
  const copiedEggs = eggs.filter((e) => {
    if (seenEggIds.has(e.id)) return false;
    const match = (e.individual_id && ids.has(e.individual_id)) &&
      (e.relationship_id && copiedRelIds.has(e.relationship_id));
    if (match) seenEggIds.add(e.id);
    return match;
  });

  // Compute centroid
  const placed = copiedInds.filter((i) => i.x != null && i.y != null);
  const cx = placed.length > 0 ? placed.reduce((s, i) => s + i.x, 0) / placed.length : 0;
  const cy = placed.length > 0 ? placed.reduce((s, i) => s + i.y, 0) / placed.length : 0;

  clipboard = {
    individuals: JSON.parse(JSON.stringify(copiedInds)),
    relationships: JSON.parse(JSON.stringify(copiedRels)),
    eggs: JSON.parse(JSON.stringify(copiedEggs)),
    originCenter: { x: cx, y: cy },
  };
}

async function paste(): Promise<void> {
  if (!clipboard || !pedigreeId) return;
  pushUndo(captureSnapshot("Paste"));

  const idMap = new Map<string, string>();

  try {
    // Create individuals with new IDs
    for (const ind of clipboard.individuals) {
      const offsetX = lastMousePos.x - clipboard.originCenter.x;
      const offsetY = lastMousePos.y - clipboard.originCenter.y;
      let newX = (ind.x ?? 0) + offsetX;
      let newY = (ind.y ?? 0) + offsetY;
      const snapped = snapXY(newX, newY);
      newX = snapped.x;
      newY = snapped.y;

      const created = await api<{ id: string }>("/api/individuals", {
        method: "POST",
        body: JSON.stringify({
          biological_sex: ind.biological_sex,
          x: newX,
          y: newY,
          display_name: ind.display_name,
          notes: ind.notes,
          properties: ind.properties,
        }),
      });
      idMap.set(ind.id, created.id);
      await api(`/api/pedigrees/${pedigreeId}/individuals/${created.id}`, {
        method: "POST",
      });
    }

    // Create relationships with remapped members
    for (const rel of clipboard.relationships) {
      const newMembers = rel.members.map((m) => idMap.get(m) ?? m);
      const created = await api<{ id: string }>("/api/relationships", {
        method: "POST",
        body: JSON.stringify({ members: newMembers, properties: rel.properties }),
      });
      idMap.set(rel.id, created.id);
      await api(`/api/pedigrees/${pedigreeId}/relationships/${created.id}`, {
        method: "POST",
      });
    }

    // Create eggs with remapped references
    for (const egg of clipboard.eggs) {
      const newIndId = egg.individual_id ? idMap.get(egg.individual_id) ?? egg.individual_id : null;
      const newIndIds = (egg.individual_ids || []).map((iid: string) => idMap.get(iid) ?? iid);
      const newRelId = egg.relationship_id ? idMap.get(egg.relationship_id) ?? egg.relationship_id : null;
      const created = await api<{ id: string }>("/api/eggs", {
        method: "POST",
        body: JSON.stringify({
          individual_id: newIndId,
          individual_ids: newIndIds.length > 0 ? newIndIds : undefined,
          relationship_id: newRelId,
          properties: egg.properties,
        }),
      });
      await api(`/api/pedigrees/${pedigreeId}/eggs/${created.id}`, {
        method: "POST",
      });
    }

    // Select pasted entities
    selectedIds = new Set(
      clipboard.individuals.map((i) => idMap.get(i.id)!).filter(Boolean),
    );
    selectedIndividualId = null;

    await refreshState();
    render();
  } catch (err) {
    console.error("Paste failed:", err);
  }
}

function cutSelection(): void {
  const ids = new Set<string>(selectedIds);
  if (selectedIndividualId) ids.add(selectedIndividualId);
  if (ids.size === 0) return;
  copySelection();
  deleteIndividuals([...ids]);
}

// --- Find logic ---

function runFind(): void {
  const query = findInput.value.trim().toLowerCase();
  if (!query) {
    findResults = [];
    findIndex = 0;
    findCount.textContent = "";
    render();
    return;
  }

  findResults = individuals
    .filter((ind) => {
      const fields = [
        ind.display_name,
        ind.name?.given?.join(" "),
        ind.name?.family,
        ind.notes,
        ...Object.values(ind.properties ?? {}).map(String),
      ];
      return fields.some((f) => f && f.toLowerCase().includes(query));
    })
    .map((i) => i.id);

  findIndex = findResults.length > 0 ? 0 : -1;
  updateFindCount();
  if (findIndex >= 0) scrollToIndividual(findResults[findIndex]);
  render();
}

function updateFindCount(): void {
  if (findResults.length === 0) {
    findCount.textContent = findInput.value ? "0" : "";
  } else {
    findCount.textContent = `${findIndex + 1}/${findResults.length}`;
  }
}

function scrollToIndividual(id: string): void {
  const ind = individuals.find((i) => i.id === id);
  if (!ind || ind.x == null || ind.y == null) return;

  const rect = canvas.getBoundingClientRect();
  const margin = 60;

  // World coords of the individual → screen coords
  const sx = ind.x * zoomScale + panX;
  const sy = ind.y * zoomScale + panY;

  // Check if off-screen (with margin)
  if (sx >= margin && sx <= rect.width - margin && sy >= margin && sy <= rect.height - margin) {
    return; // already visible
  }

  // Center the individual on screen
  panX = rect.width / 2 - ind.x * zoomScale;
  panY = rect.height / 2 - ind.y * zoomScale;
}

function findNext(): void {
  if (findResults.length === 0) return;
  findIndex = (findIndex + 1) % findResults.length;
  updateFindCount();
  scrollToIndividual(findResults[findIndex]);
  render();
}

function findPrev(): void {
  if (findResults.length === 0) return;
  findIndex = (findIndex - 1 + findResults.length) % findResults.length;
  updateFindCount();
  scrollToIndividual(findResults[findIndex]);
  render();
}

function openFind(): void {
  findOpen = true;
  findBar.classList.remove("hidden");
  findInput.focus();
  findInput.select();
}

function closeFind(): void {
  findOpen = false;
  findBar.classList.add("hidden");
  findResults = [];
  findIndex = 0;
  render();
}

// --- Floating notes ---

function generateNoteId(): string {
  return "note-" + Math.random().toString(36).slice(2, 10);
}

function addFloatingNote(): void {
  if (!pedigreeId) return;
  pushUndo(captureSnapshot("Add note"));
  const rect = canvas.getBoundingClientRect();
  const note: FloatingNote = {
    id: generateNoteId(),
    text: "New note",
    x: rect.width / 2 - NOTE_WIDTH / 2,
    y: rect.height / 2 - 20,
    visible: true,
  };
  floatingNotes.push(note);
  selectedNoteId = note.id;
  patchFloatingNotes();
  render();
}

function deleteSelectedNote(): void {
  if (!selectedNoteId) return;
  pushUndo(captureSnapshot("Delete note"));
  floatingNotes = floatingNotes.filter((n) => n.id !== selectedNoteId);
  selectedNoteId = null;
  patchFloatingNotes();
  render();
}

async function patchFloatingNotes(): Promise<void> {
  if (!pedigreeId) return;
  try {
    await api(`/api/pedigrees/${pedigreeId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: { floating_notes: floatingNotes } }),
    });
  } catch (err) {
    console.error("Failed to save floating notes:", err);
  }
}

function openNoteEditor(note: FloatingNote): void {
  // Remove any existing overlay
  document.querySelectorAll(".note-overlay").forEach((el) => el.remove());

  const canvasRect = canvas.getBoundingClientRect();
  const overlay = document.createElement("div");
  overlay.className = "note-overlay";
  overlay.style.left = `${canvasRect.left + note.x}px`;
  overlay.style.top = `${canvasRect.top + note.y}px`;

  const ta = document.createElement("textarea");
  ta.className = "note-overlay-textarea";
  ta.value = note.text;
  ta.style.width = `${NOTE_WIDTH + 20}px`;
  ta.style.minHeight = "60px";
  ta.style.fontFamily = "inherit";
  ta.style.fontSize = "0.8rem";
  ta.style.padding = "0.4rem";
  ta.style.border = `1px solid ${cssVar("--color-accent")}`;
  ta.style.borderRadius = "4px";
  ta.style.background = cssVar("--color-surface");
  ta.style.color = cssVar("--color-text");
  ta.style.outline = "none";
  ta.style.resize = "both";

  overlay.appendChild(ta);
  document.body.appendChild(overlay);
  ta.focus();
  ta.select();

  const save = () => {
    note.text = ta.value;
    overlay.remove();
    patchFloatingNotes();
    render();
  };

  ta.addEventListener("blur", save);
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      ta.removeEventListener("blur", save);
      overlay.remove();
    }
  });
}

// --- Keyboard shortcut helpers ---

/** Compute a placement position for a new individual created via keyboard. */
function computePlacementPosition(relativeTo?: PlacedIndividual, direction?: "right" | "left" | "below"): { x: number; y: number } {
  if (relativeTo && relativeTo.x != null && relativeTo.y != null) {
    const spacing = SHAPE_SIZE * 2;
    let x = relativeTo.x;
    let y = relativeTo.y;
    if (direction === "right") x += spacing;
    else if (direction === "left") x -= spacing;
    else if (direction === "below") y += spacing;

    // Nudge if occupied
    while (individuals.some((i) => i.x === x && i.y === y)) {
      x += SHAPE_SIZE;
    }
    return snapXY(x, y);
  }

  // Fall back to center of viewport
  const rect = canvas.getBoundingClientRect();
  const cx = (rect.width / 2 - panX) / zoomScale;
  const cy = (rect.height / 2 - panY) / zoomScale;
  const snapped = snapXY(cx, cy);

  // Nudge if occupied
  let { x, y } = snapped;
  while (individuals.some((i) => i.x === x && i.y === y)) {
    x += SHAPE_SIZE;
  }
  return { x, y };
}

function addIndividualViaKey(sex: string): void {
  if (!pedigreeId) return;
  const sel = getSelectedIndividuals();
  const anchor = sel.length === 1 ? sel[0] : undefined;
  const pos = computePlacementPosition(anchor, "right");
  pushUndo(captureSnapshot("Add individual"));
  handleShapePlaced(sex, pos.x, pos.y);
}

function getSelectedIndividuals(): PlacedIndividual[] {
  const ids = new Set<string>(selectedIds);
  if (selectedIndividualId) ids.add(selectedIndividualId);
  return individuals.filter((i) => ids.has(i.id));
}

function oppositeSex(sex: string): string {
  if (sex === "male") return "female";
  if (sex === "female") return "male";
  return "unknown";
}

async function addPartnerOrMarriage(): Promise<void> {
  if (!pedigreeId) return;
  const sel = getSelectedIndividuals();

  if (sel.length === 2) {
    // Two selected — create marriage if not already married
    if (hasRelationship(sel[0].id, sel[1].id)) return;
    pushUndo(captureSnapshot("Add marriage"));
    await handleConnectionEnd(sel[0].id, sel[1].id);
    return;
  }

  if (sel.length === 1) {
    // One selected — create partner of opposite sex + marriage
    const anchor = sel[0];
    const partnerSex = oppositeSex(anchor.biological_sex ?? "unknown");
    const pos = computePlacementPosition(anchor, "right");

    pushUndo(captureSnapshot("Add partner"));
    try {
      const partner = await api<{ id: string }>("/api/individuals", {
        method: "POST",
        body: JSON.stringify({ biological_sex: partnerSex, x: pos.x, y: pos.y }),
      });
      await api(`/api/pedigrees/${pedigreeId}/individuals/${partner.id}`, {
        method: "POST",
      });

      const rel = await api<{ id: string }>("/api/relationships", {
        method: "POST",
        body: JSON.stringify({ members: [anchor.id, partner.id] }),
      });
      await api(`/api/pedigrees/${pedigreeId}/relationships/${rel.id}`, {
        method: "POST",
      });

      await refreshState();
      selectedIds = new Set();
      selectedIndividualId = partner.id;
      render();
      await openPanelFor({ type: "individual", id: partner.id });
      focusDisplayName();
    } catch (err) {
      console.error("Add partner failed:", err);
    }
    return;
  }
}

// --- Keyboard handler ---

document.addEventListener("keydown", (e) => {
  // Don't intercept if user is typing in an input/textarea
  const tag = (e.target as HTMLElement)?.tagName;
  const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

  // Find bar shortcuts (always active when find is open)
  if (findOpen) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeFind();
      return;
    }
    if (e.key === "Enter" || e.key === "F3") {
      e.preventDefault();
      if (e.shiftKey) findPrev(); else findNext();
      return;
    }
  }

  // F2 — focus display name (works even in input fields)
  if (e.key === "F2") {
    const ids = new Set<string>(selectedIds);
    if (selectedIndividualId) ids.add(selectedIndividualId);
    if (ids.size === 1) {
      e.preventDefault();
      const id = [...ids][0];
      openPanelFor({ type: "individual", id }).then(() => focusDisplayName());
      return;
    }
    // Check for selected relationship/egg via activePanelTarget
    if (activePanelTarget?.type === "relationship") {
      e.preventDefault();
      focusRelationshipDisplayName();
      return;
    }
    return;
  }

  if (isInput) return;

  // Delete
  if (e.key === "Delete" || e.key === "Backspace") {
    // Delete floating note if selected
    if (selectedNoteId) {
      e.preventDefault();
      deleteSelectedNote();
      return;
    }
    // Delete selected line segment
    if (selectedElement) {
      e.preventDefault();
      deleteSelectedElement(selectedElement);
      return;
    }
    const ids = new Set<string>(selectedIds);
    if (selectedIndividualId) ids.add(selectedIndividualId);
    if (ids.size === 0) return;
    e.preventDefault();
    deleteIndividuals([...ids]);
    return;
  }

  // Single-key shortcuts (not in input fields, no modifiers)
  if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    switch (e.key.toLowerCase()) {
      case "m":
        e.preventDefault();
        addIndividualViaKey("male");
        return;
      case "f":
        e.preventDefault();
        addIndividualViaKey("female");
        return;
      case "u":
        e.preventDefault();
        addIndividualViaKey("unknown");
        return;
      case "p":
        e.preventDefault();
        addPartnerOrMarriage();
        return;
      case "d":
        e.preventDefault();
        if (isDiseasePaletteOpen()) {
          closeDiseasePalette();
          btnDiseases.classList.remove("active");
        } else {
          openDiseasePalette();
          btnDiseases.classList.add("active");
        }
        return;
      case "n":
        e.preventDefault();
        addFloatingNote();
        return;
      case "g":
        e.preventDefault();
        openPanelFor({ type: "genetics" });
        return;
      case "escape":
        e.preventDefault();
        selectedIds = new Set();
        selectedIndividualId = null;
        selectedNoteId = null;
        selectedElement = null;
        closeActivePanel();
        render();
        return;
    }
  }

  // Ctrl shortcuts
  if (e.ctrlKey || e.metaKey) {
    switch (e.key.toLowerCase()) {
      case "z":
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      case "y":
        e.preventDefault();
        redo();
        return;
      case "a":
        e.preventDefault();
        selectedIds = new Set(individuals.map((i) => i.id));
        selectedIndividualId = null;
        render();
        return;
      case "i":
        if (e.shiftKey) {
          e.preventDefault();
          const allIds = new Set(individuals.map((i) => i.id));
          const current = new Set(selectedIds);
          if (selectedIndividualId) current.add(selectedIndividualId);
          selectedIds = new Set([...allIds].filter((id) => !current.has(id)));
          selectedIndividualId = null;
          render();
        }
        return;
      case "c":
        e.preventDefault();
        copySelection();
        return;
      case "x":
        e.preventDefault();
        cutSelection();
        return;
      case "v":
        e.preventDefault();
        paste();
        return;
      case "f":
        e.preventDefault();
        openFind();
        return;
      case "g":
        e.preventDefault();
        snapToGrid = !snapToGrid;
        btnGrid.classList.toggle("active", snapToGrid);
        render();
        return;
    }
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === " " && !(e.target as HTMLElement)?.matches("input, textarea, select")) {
    e.preventDefault();
    spaceDown = true;
    canvas.style.cursor = "grab";
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key === " ") {
    spaceDown = false;
    if (!panning) canvas.style.cursor = "";
  }
});

// --- Diagonal stroke → death / suicide ---

function tryDiagonalStroke(pts: Point[]): boolean {
  const first = pts[0];
  const last = pts[pts.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const len = Math.hypot(dx, dy);

  if (len < SHAPE_SIZE * 0.6) return false;

  let maxDev = 0;
  for (const pt of pts) {
    const dev = Math.abs((last.y - first.y) * pt.x - (last.x - first.x) * pt.y + last.x * first.y - last.y * first.x) / len;
    if (dev > maxDev) maxDev = dev;
  }
  if (maxDev > SHAPE_SIZE * 0.4) return false;

  const angle = Math.abs(Math.atan2(Math.abs(dy), Math.abs(dx)));
  if (angle < 0.35 || angle > 1.22) return false;

  const hitRadius = SHAPE_SIZE / 2 + 4;
  let hitInd: PlacedIndividual | null = null;
  for (const ind of individuals) {
    if (ind.x == null || ind.y == null) continue;
    const dist = Math.abs((last.y - first.y) * ind.x - (last.x - first.x) * ind.y + last.x * first.y - last.y * first.x) / len;
    if (dist > hitRadius) continue;
    const t = ((ind.x - first.x) * dx + (ind.y - first.y) * dy) / (len * len);
    if (t < -0.1 || t > 1.1) continue;
    hitInd = ind;
    break;
  }
  if (!hitInd) return false;

  const currentStatus = (hitInd.properties?.death_status as string) ?? "alive";

  if (currentStatus === "alive" || currentStatus === "unknown") {
    render();
    pushUndo(captureSnapshot(`Set ${hitInd.display_name || "individual"} deceased`));
    handleSetDeathStatus(hitInd.id, "dead");
    return true;
  }

  if (currentStatus === "dead") {
    const isSameSign = (dx > 0 && dy > 0) || (dx < 0 && dy < 0);
    if (isSameSign) {
      render();
      pushUndo(captureSnapshot(`Set ${hitInd.display_name || "individual"} suicide`));
      handleSetDeathStatus(hitInd.id, "suicide_confirmed");
      return true;
    }
  }

  return false;
}

async function handleSetDeathStatus(indId: string, status: string) {
  try {
    const ind = individuals.find((i) => i.id === indId);
    if (!ind) return;
    const props = { ...(ind.properties as Record<string, unknown>), death_status: status };
    await api(`/api/individuals/${indId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: props }),
    });
    await refreshState();
    render();
  } catch (err) {
    console.error("Failed to set death status:", err);
  }
}

// --- Diagonal stroke through relationship line → separation / divorce ---

function tryDiagonalStrokeRelationship(pts: Point[]): boolean {
  const first = pts[0];
  const last = pts[pts.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const len = Math.hypot(dx, dy);

  // Must be long enough and fairly straight
  if (len < SHAPE_SIZE * 0.6) return false;

  let maxDev = 0;
  for (const pt of pts) {
    const dev = Math.abs((last.y - first.y) * pt.x - (last.x - first.x) * pt.y + last.x * first.y - last.y * first.x) / len;
    if (dev > maxDev) maxDev = dev;
  }
  if (maxDev > SHAPE_SIZE * 0.4) return false;

  // Must be diagonal (not horizontal or vertical)
  const angle = Math.abs(Math.atan2(Math.abs(dy), Math.abs(dx)));
  if (angle < 0.35 || angle > 1.22) return false;

  // Check if the stroke crosses a relationship line
  const half = SHAPE_SIZE / 2;
  let hitRel: PlacedRelationship | null = null;
  for (const rel of relationships) {
    if (rel.members.length < 2) continue;
    const a = individuals.find((i) => i.id === rel.members[0]);
    const b = individuals.find((i) => i.id === rel.members[1]);
    if (!a || !b || a.x == null || a.y == null || b.x == null || b.y == null) continue;
    const [left, right] = a.x <= b.x ? [a, b] : [b, a];
    const relX1 = left.x + half, relY1 = left.y;
    const relX2 = right.x - half, relY2 = right.y;
    // Check midpoint of diagonal stroke is near the relationship line
    const midX = (first.x + last.x) / 2;
    const midY = (first.y + last.y) / 2;
    const dist = pointToSegmentDist(midX, midY, relX1, relY1, relX2, relY2);
    if (dist <= PARENTAL_TOLERANCE) {
      hitRel = rel;
      break;
    }
  }
  if (!hitRel) return false;

  // Check existing events to determine if already separated
  const hasSeparation = hitRel.events?.some(
    (ev) => ev.type === "separation" || ev.properties?.status === "separation"
  ) ?? false;

  render();
  pushUndo(captureSnapshot(hasSeparation ? "Divorce" : "Separation"));

  if (hasSeparation) {
    handleRelationshipDiagonal(hitRel.id, "divorce");
  } else {
    handleRelationshipDiagonal(hitRel.id, "separation");
  }
  return true;
}

async function handleRelationshipDiagonal(relId: string, status: string) {
  try {
    const eventType = status === "divorce" ? "divorce" : "separation";
    await api(`/api/relationships/${relId}/events`, {
      method: "POST",
      body: JSON.stringify({ type: eventType, properties: { status } }),
    });
    await refreshState();
    render();
  } catch (err) {
    console.error("Failed to add relationship event:", err);
  }
}

// --- Scribble delete helpers ---

const SCRIBBLE_MIN_PASSES = 3;

function tryScribbleDelete(pts: Point[]): boolean {
  if (pts.length < 10) return false;

  const hitRadius = SHAPE_SIZE / 2 + 4;
  const scribbledIds: string[] = [];

  for (const ind of individuals) {
    if (ind.x == null || ind.y == null) continue;
    let passes = 0;
    let wasInside = false;
    for (const pt of pts) {
      const inside = Math.hypot(pt.x - ind.x, pt.y - ind.y) <= hitRadius;
      if (inside && !wasInside) passes++;
      wasInside = inside;
    }
    if (passes >= SCRIBBLE_MIN_PASSES) {
      scribbledIds.push(ind.id);
    }
  }

  if (scribbledIds.length === 0) {
    // Try scribble-delete on line segments
    return tryScribbleDeleteLine(pts);
  }

  flashAndDelete(scribbledIds);
  return true;
}

function tryScribbleDeleteLine(pts: Point[]): boolean {
  if (pts.length < 10) return false;
  // Check if scribble passes near any specific line segment multiple times
  for (const pt of pts) {
    const seg = hitLineSegment(pt);
    if (!seg) continue;
    // Count how many scribble points are near this segment
    let nearCount = 0;
    for (const p of pts) {
      const s2 = hitLineSegment(p);
      if (s2 && hitElementsEqual(s2, seg)) {
        nearCount++;
      }
    }
    if (nearCount >= pts.length * 0.3) {
      selectedElement = seg;
      deleteSelectedElement(seg);
      return true;
    }
  }
  return false;
}

/** Returns true if any point in the stroke is near an existing line segment. */
function strokeCrossesLine(pts: Point[]): boolean {
  for (const pt of pts) {
    if (hitLineSegment(pt)) return true;
  }
  return false;
}

function flashAndDelete(ids: string[]) {
  render();
  const half = SHAPE_SIZE / 2;
  ctx.strokeStyle = cssVar("--color-danger");
  ctx.lineWidth = 3;
  for (const id of ids) {
    const ind = individuals.find((i) => i.id === id);
    if (!ind || ind.x == null || ind.y == null) continue;
    ctx.beginPath();
    ctx.arc(ind.x, ind.y, half + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  setTimeout(() => deleteIndividuals(ids), 200);
}

// --- Monozygotic detection ---

function tryMarkMonozygotic(pts: Point[]): boolean {
  const first = pts[0];
  const last = pts[pts.length - 1];
  const dx = Math.abs(last.x - first.x);
  const dy = Math.abs(last.y - first.y);
  if (dx < 10 || dy > dx * 1.0) return false;

  const half = SHAPE_SIZE / 2;

  // Check each twin group across all relationships
  const relsWithTwins = new Set(
    eggs.filter((e) => e.relationship_id && e.properties?.twin).map((e) => e.relationship_id!)
  );

  for (const relId of relsWithTwins) {
    const rel = relationships.find((r) => r.id === relId);
    if (!rel) continue;

    for (const grpInfo of getAllChevronApexInfos(rel)) {
      if (grpInfo.groupEggs.some((e) => e.properties?.monozygotic)) continue;

      const twinChildren = grpInfo.groupEggs
        .map((e) => ({
          egg: e,
          ind: individuals.find((i) => i.id === e.individual_id),
        }))
        .filter((t) => t.ind && t.ind.x != null && t.ind.y != null);
      if (twinChildren.length < 2) continue;

      const apexY = grpInfo.apexY;
      const minTopY = Math.min(...twinChildren.map((c) => c.ind!.y - half));

      let hitCount = 0;
      for (const pt of pts) {
        if (pt.y < apexY - 5 || pt.y > minTopY + 5) continue;
        const frac = (pt.y - apexY) / (minTopY - apexY);
        if (frac <= 0) continue;
        const armXs = twinChildren.map((tc) => grpInfo.apexX + (tc.ind!.x - grpInfo.apexX) * frac);
        const armLeft = Math.min(...armXs) - 15;
        const armRight = Math.max(...armXs) + 15;
        if (pt.x >= armLeft && pt.x <= armRight) hitCount++;
      }

      if (hitCount >= Math.min(pts.length * 0.3, 5)) {
        pushUndo(captureSnapshot("Mark monozygotic"));
        handleMarkMonozygotic(grpInfo.groupEggs);
        return true;
      }
    }
  }

  return false;
}

/** Show a modal dialog and return the user's choice. */
function showModal(title: string, message: string, options: { label: string; value: string; primary?: boolean }[]): Promise<string> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const dialog = document.createElement("div");
    dialog.className = "modal-dialog";

    const h4 = document.createElement("h4");
    h4.textContent = title;
    dialog.appendChild(h4);

    const p = document.createElement("p");
    p.textContent = message;
    dialog.appendChild(p);

    const btnContainer = document.createElement("div");
    btnContainer.className = "modal-buttons";

    for (const opt of options) {
      const btn = document.createElement("button");
      btn.textContent = opt.label;
      if (opt.primary) btn.className = "primary";
      btn.addEventListener("click", () => {
        overlay.remove();
        resolve(opt.value);
      });
      btnContainer.appendChild(btn);
    }

    dialog.appendChild(btnContainer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  });
}

/** Show a disease-matching modal. Each imported disease can be mapped to an existing one or created as new. */
function showDiseaseMatchModal(
  importedDiseases: { id: string; display_name: string; color: string }[],
  existingDiseases: DiseaseInfo[],
): Promise<Map<string, string>> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const dialog = document.createElement("div");
    dialog.className = "modal-dialog";
    dialog.style.maxWidth = "460px";
    dialog.style.minWidth = "360px";

    const h4 = document.createElement("h4");
    h4.textContent = "Match Diseases";
    dialog.appendChild(h4);

    const p = document.createElement("p");
    p.textContent = "Map imported diseases to existing ones, or create new entries.";
    dialog.appendChild(p);

    const rows: { importId: string; select: HTMLSelectElement }[] = [];

    for (const d of importedDiseases) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.marginBottom = "8px";

      const dot = document.createElement("span");
      dot.style.width = "14px";
      dot.style.height = "14px";
      dot.style.borderRadius = "50%";
      dot.style.background = d.color || "#999";
      dot.style.flexShrink = "0";

      const label = document.createElement("span");
      label.textContent = d.display_name || d.id;
      label.style.flex = "1";
      label.style.fontSize = "0.78rem";
      label.style.overflow = "hidden";
      label.style.textOverflow = "ellipsis";
      label.style.whiteSpace = "nowrap";

      const sel = document.createElement("select");
      sel.style.fontSize = "0.75rem";
      sel.style.padding = "3px 6px";
      sel.style.maxWidth = "160px";

      const optNew = document.createElement("option");
      optNew.value = "__new__";
      optNew.textContent = "Create new";
      sel.appendChild(optNew);

      // Try auto-matching by name (case-insensitive)
      let autoMatch = "";
      for (const ex of existingDiseases) {
        const opt = document.createElement("option");
        opt.value = ex.id;
        opt.textContent = ex.display_name || ex.id;
        sel.appendChild(opt);
        if (ex.display_name.toLowerCase() === d.display_name.toLowerCase()) {
          autoMatch = ex.id;
        }
      }
      if (autoMatch) sel.value = autoMatch;

      row.append(dot, label, sel);
      dialog.appendChild(row);
      rows.push({ importId: d.id, select: sel });
    }

    const btnContainer = document.createElement("div");
    btnContainer.className = "modal-buttons";
    btnContainer.style.flexDirection = "row";
    btnContainer.style.justifyContent = "flex-end";
    btnContainer.style.marginTop = "12px";

    const btnCancel = document.createElement("button");
    btnCancel.textContent = "Cancel";
    btnCancel.addEventListener("click", () => {
      overlay.remove();
      resolve(new Map()); // empty = cancelled
    });

    const btnOk = document.createElement("button");
    btnOk.textContent = "Import";
    btnOk.className = "primary";
    btnOk.addEventListener("click", () => {
      const mapping = new Map<string, string>();
      for (const r of rows) {
        mapping.set(r.importId, r.select.value);
      }
      overlay.remove();
      resolve(mapping);
    });

    btnContainer.append(btnCancel, btnOk);
    dialog.appendChild(btnContainer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  });
}

const SEX_LABELS: Record<string, string> = {
  male: "Male",
  female: "Female",
  unknown: "Unknown",
  intersex: "Intersex",
  ambiguous_male: "Ambiguous male",
  ambiguous_female: "Ambiguous female",
  none: "None",
  other: "Other",
};

async function handleMarkMonozygotic(twinEggs: PlacedEgg[]): Promise<void> {
  try {
    const twinInds = twinEggs
      .map((e) => individuals.find((i) => i.id === e.individual_id))
      .filter((i): i is PlacedIndividual => i != null);

    const sexes = new Set(twinInds.map((i) => i.biological_sex ?? "unknown"));

    if (sexes.size > 1) {
      const distinctSexes = [...sexes];
      const options: { label: string; value: string; primary?: boolean }[] = distinctSexes.map((s, i) => ({
        label: `Set both to ${SEX_LABELS[s] ?? s}`,
        value: s,
        primary: i === 0,
      }));
      options.push({ label: "Ignore conflict", value: "_ignore" });

      const choice = await showModal(
        "Sex conflict",
        "Identical twins must be the same biological sex. These individuals have different sexes. How would you like to resolve this?",
        options,
      );

      if (choice !== "_ignore") {
        await Promise.all(
          twinInds.map((ind) =>
            api(`/api/individuals/${ind.id}`, {
              method: "PATCH",
              body: JSON.stringify({ biological_sex: choice }),
            }),
          ),
        );
      }
    }

    // Merge all twin eggs into one shared egg with individual_ids
    const keepEgg = twinEggs[0];
    const allChildIds = twinEggs.map((e) => e.individual_id).filter((id): id is string => id != null);
    const mergedProps = { ...(keepEgg.properties ?? {}), twin: true, monozygotic: true };

    // Update the kept egg to reference all children via individual_ids
    await api(`/api/eggs/${keepEgg.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        individual_id: null,
        individual_ids: allChildIds,
        properties: mergedProps,
      }),
    });

    // Delete the other eggs
    for (let i = 1; i < twinEggs.length; i++) {
      await api(`/api/eggs/${twinEggs[i].id}`, { method: "DELETE" });
    }

    await refreshState();
    render();
  } catch (err) {
    console.error("Failed to mark monozygotic:", err);
  }
}

// --- Text wrapping helper ---

function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    const words = rawLine.split(/\s+/);
    let current = "";
    for (const word of words) {
      const test = current ? current + " " + word : word;
      // Rough char-width estimate: ~7px per char at 11px font
      if (test.length * 7 > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    lines.push(current);
  }
  return lines;
}

// --- Rendering ---

function render() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  // Read theme colors
  const strokeColor = cssVar("--color-stroke");
  const strokeSelectedColor = cssVar("--color-stroke-selected");
  const gridColor = cssVar("--color-grid");
  const findHighlightColor = cssVar("--color-find-highlight");
  const findCurrentColor = cssVar("--color-find-current");

  const symbolColors: SymbolColors = {
    stroke: strokeColor,
    strokeSelected: strokeSelectedColor,
    fill: strokeColor,
  };

  // Apply zoom/pan transform
  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoomScale, zoomScale);

  // Draw grid (compute visible area in world coordinates)
  if (snapToGrid) {
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5 / zoomScale;
    const worldLeft = -panX / zoomScale;
    const worldTop = -panY / zoomScale;
    const worldRight = (rect.width - panX) / zoomScale;
    const worldBottom = (rect.height - panY) / zoomScale;
    const startX = Math.floor(worldLeft / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(worldTop / GRID_SIZE) * GRID_SIZE;
    for (let x = startX; x <= worldRight; x += GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x, worldTop);
      ctx.lineTo(x, worldBottom);
      ctx.stroke();
    }
    for (let y = startY; y <= worldBottom; y += GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(worldLeft, y);
      ctx.lineTo(worldRight, y);
      ctx.stroke();
    }
  }

  ctx.lineWidth = 2;

  // Draw relationship lines
  for (const rel of relationships) {
    if (rel.members.length < 2) continue;
    const a = individuals.find((i) => i.id === rel.members[0]);
    const b = individuals.find((i) => i.id === rel.members[1]);
    if (!a || !b || a.x == null || a.y == null || b.x == null || b.y == null)
      continue;

    const [left, right] = a.x <= b.x ? [a, b] : [b, a];

    const isConsanguineous = rel.consanguinity != null && rel.consanguinity > 0;
    if (isConsanguineous) {
      // Double line for consanguineous relationships
      const gap = 3;
      ctx.beginPath();
      ctx.moveTo(left.x + SHAPE_EDGE, left.y - gap);
      ctx.lineTo(right.x - SHAPE_EDGE, right.y - gap);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(left.x + SHAPE_EDGE, left.y + gap);
      ctx.lineTo(right.x - SHAPE_EDGE, right.y + gap);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(left.x + SHAPE_EDGE, left.y);
      ctx.lineTo(right.x - SHAPE_EDGE, right.y);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw separation / divorce slashes on the relationship line
    const hasSep = rel.events?.some((ev) => ev.type === "separation" || ev.properties?.status === "separation");
    const hasDiv = rel.events?.some((ev) => ev.type === "divorce" || ev.properties?.status === "divorce");
    if (hasSep || hasDiv) {
      const midX = (left.x + SHAPE_EDGE + right.x - SHAPE_EDGE) / 2;
      const midY = (left.y + right.y) / 2;
      const slashH = SHAPE_SIZE * 0.35;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      // First slash (separation)
      ctx.beginPath();
      ctx.moveTo(midX - 4, midY - slashH);
      ctx.lineTo(midX + 4, midY + slashH);
      ctx.stroke();
      // Second slash (divorce)
      if (hasDiv) {
        ctx.beginPath();
        ctx.moveTo(midX - 4 + 6, midY - slashH);
        ctx.lineTo(midX + 4 + 6, midY + slashH);
        ctx.stroke();
      }
    }
  }

  // Draw parental lines (egg connections)
  const eggsByRel = new Map<string, PlacedEgg[]>();
  for (const egg of eggs) {
    if (!egg.relationship_id || !egg.individual_id) continue;
    const key = egg.relationship_id;
    if (!eggsByRel.has(key)) eggsByRel.set(key, []);
    eggsByRel.get(key)!.push(egg);
  }

  for (const [relId, relEggs] of eggsByRel) {
    const rel = relationships.find((r) => r.id === relId);
    if (!rel) continue;

    let origin: { x: number; y: number } | null = null;
    if (rel.members.length >= 2) {
      origin = getRelationshipMidpoint(rel);
    } else if (rel.members.length === 1) {
      const parent = individuals.find((i) => i.id === rel.members[0]);
      if (parent && parent.x != null && parent.y != null) {
        origin = { x: parent.x, y: parent.y + SHAPE_EDGE };
      }
    } else if (rel.members.length === 0) {
      const children = relEggs
        .map((e) => individuals.find((i) => i.id === e.individual_id))
        .filter((i): i is PlacedIndividual => i != null && i.x != null && i.y != null);
      if (children.length >= 2) {
        const avgX = children.reduce((s, c) => s + c.x, 0) / children.length;
        const minY = Math.min(...children.map((c) => c.y - SHAPE_EDGE));
        origin = { x: avgX, y: minY - SIBLING_BAR_HEIGHT * 1.5 };
      }
    }
    if (!origin) continue;

    // Group twin eggs by twin_group
    const twinGroups = getTwinGroups(rel.id);
    const allTwinEggIds = new Set<string>();
    for (const [, grp] of twinGroups) {
      for (const e of grp) allTwinEggIds.add(e.id);
    }
    const regularEggs = relEggs.filter((e) => !allTwinEggIds.has(e.id));

    // Resolve per-group twin children and apex positions
    type TwinGroupInfo = { groupEggs: PlacedEgg[]; children: { egg: PlacedEgg; x: number; topY: number }[]; apexX: number; apexY: number };
    const twinGroupInfos: TwinGroupInfo[] = [];
    for (const [, groupEggs] of twinGroups) {
      const children = groupEggs
        .map((e) => ({ egg: e, ind: individuals.find((i) => i.id === e.individual_id) }))
        .filter((t) => t.ind && t.ind.x != null && t.ind.y != null)
        .map((t) => ({ egg: t.egg, x: t.ind!.x, topY: t.ind!.y - SHAPE_EDGE }));
      if (children.length >= 2) {
        const apexX = children.reduce((s, c) => s + c.x, 0) / children.length;
        const minTopY = Math.min(...children.map((c) => c.topY));
        const defaultApexY = minTopY - (minTopY - origin.y) * 0.8;
        const apexY = defaultApexY + (chevronApexOffsets.get(rel.id) ?? 0);
        twinGroupInfos.push({ groupEggs, children, apexX, apexY });
      }
    }

    const hasTwins = twinGroupInfos.length > 0;

    // Draw regular (non-twin) eggs: single horizontal bar + vertical drops
    const regChildren = regularEggs
      .map((e) => individuals.find((i) => i.id === e.individual_id))
      .filter((i): i is PlacedIndividual => i != null && i.x != null && i.y != null);

    const hasRegular = regChildren.length > 0;

    if (hasRegular) {
      const noParents = rel.members.length === 0;
      const minTopY = Math.min(...regChildren.map((c) => c.y - SHAPE_EDGE));
      const defaultBarY = noParents
        ? minTopY - SIBLING_BAR_HEIGHT
        : origin ? (origin.y + minTopY) / 2 : minTopY - SIBLING_BAR_HEIGHT;
      const barOffset = siblingBarOffsets.get(rel.id) ?? 0;
      const barY = defaultBarY + barOffset;

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;

      // Single vertical stem from origin to sibling bar
      if (!noParents) {
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(origin.x, barY);
        ctx.stroke();
      }

      // Horizontal sibling bar — extend to include all twin chevron apexes
      const xs = regChildren.map((c) => c.x);
      if (!noParents) xs.push(origin.x);
      for (const grp of twinGroupInfos) xs.push(grp.apexX);
      const barLeft = Math.min(...xs);
      const barRight = Math.max(...xs);
      ctx.beginPath();
      ctx.moveTo(barLeft, barY);
      ctx.lineTo(barRight, barY);
      ctx.stroke();

      // Vertical drops to each regular child
      for (const child of regChildren) {
        const childTopY = child.y - SHAPE_EDGE;
        ctx.beginPath();
        ctx.moveTo(child.x, barY);
        ctx.lineTo(child.x, childTopY);
        ctx.stroke();
      }

      // When twins share a sibling bar, chevron apex sits on the bar
      if (hasTwins) {
        for (const grp of twinGroupInfos) grp.apexY = barY;
      }
    } else if (hasTwins && rel.members.length > 0) {
      // Twins only, no regular children — stem from origin to first group apex
      // If multiple twin groups and no regular children, draw a horizontal bar connecting all group apexes
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      if (twinGroupInfos.length === 1) {
        const grp = twinGroupInfos[0];
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(origin.x, grp.apexY);
        if (Math.abs(origin.x - grp.apexX) > 1) {
          ctx.lineTo(grp.apexX, grp.apexY);
        }
        ctx.stroke();
      } else {
        // Multiple twin groups, no regular children: bar connecting all apex positions
        const allApexXs = twinGroupInfos.map((g) => g.apexX);
        allApexXs.push(origin.x);
        const barLeft = Math.min(...allApexXs);
        const barRight = Math.max(...allApexXs);
        const barY = twinGroupInfos[0].apexY; // All groups share same Y
        for (const grp of twinGroupInfos) grp.apexY = barY;
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(origin.x, barY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(barLeft, barY);
        ctx.lineTo(barRight, barY);
        ctx.stroke();
      }
    }

    // Draw twin chevron arms and monozygotic bars per group
    for (const grp of twinGroupInfos) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;

      for (const tc of grp.children) {
        ctx.beginPath();
        ctx.moveTo(grp.apexX, grp.apexY);
        ctx.lineTo(tc.x, tc.topY);
        ctx.stroke();
      }

      const isMonozygotic = grp.groupEggs.some((e) => e.properties?.monozygotic);
      if (isMonozygotic && grp.children.length === 2) {
        const monoBarY = (grp.apexY + Math.min(grp.children[0].topY, grp.children[1].topY)) / 2;
        const frac0 = (monoBarY - grp.apexY) / (grp.children[0].topY - grp.apexY);
        const frac1 = (monoBarY - grp.apexY) / (grp.children[1].topY - grp.apexY);
        const barX0 = grp.apexX + (grp.children[0].x - grp.apexX) * frac0;
        const barX1 = grp.apexX + (grp.children[1].x - grp.apexX) * frac1;
        ctx.beginPath();
        ctx.moveTo(barX0, monoBarY);
        ctx.lineTo(barX1, monoBarY);
        ctx.stroke();
      }
    }
  }

  // Draw hover and selection highlights for all elements
  const hoverColor = cssVar("--color-stroke-hover");
  const selectionColor = cssVar("--color-stroke-selected");
  const glowColor = cssVar("--color-selection-glow");

  function drawElementHighlight(elem: HitElement, mode: "hover" | "selected") {
    if (!elem) return;
    const half = SHAPE_SIZE / 2;
    ctx.save();
    if (mode === "selected") {
      ctx.strokeStyle = selectionColor;
      ctx.lineWidth = 4;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 16;
    } else {
      ctx.strokeStyle = hoverColor;
      ctx.lineWidth = 5;
      ctx.globalAlpha = 1;
    }
    switch (elem.kind) {
      case "individual": {
        const ind = individuals.find((i) => i.id === elem.id);
        if (ind && ind.x != null && ind.y != null) {
          ctx.beginPath();
          ctx.arc(ind.x, ind.y, half + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      case "note": {
        const note = floatingNotes.find((n) => n.id === elem.id);
        if (note) {
          const b = getNoteBounds(note);
          ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
        }
        break;
      }
      case "marriage": {
        const rel = relationships.find((r) => r.id === elem.relId);
        if (rel && rel.members.length >= 2) {
          const a = individuals.find((i) => i.id === rel.members[0]);
          const b = individuals.find((i) => i.id === rel.members[1]);
          if (a && b && a.x != null && a.y != null && b.x != null && b.y != null) {
            const [left, right] = a.x <= b.x ? [a, b] : [b, a];
            ctx.beginPath();
            ctx.moveTo(left.x + SHAPE_EDGE, left.y);
            ctx.lineTo(right.x - SHAPE_EDGE, right.y);
            ctx.stroke();
          }
        }
        break;
      }
      case "pregnancies": {
        const rel = relationships.find((r) => r.id === elem.relId);
        if (rel) {
          const origin = getParentalOrigin(rel);
          const info = getSiblingBarInfo(rel);
          if (origin && info) {
            ctx.beginPath();
            ctx.moveTo(origin.x, origin.y);
            ctx.lineTo(origin.x, info.barY);
            ctx.stroke();
          }
        }
        break;
      }
      case "siblings": {
        const rel = relationships.find((r) => r.id === elem.relId);
        if (rel) {
          const info = getSiblingBarInfo(rel);
          if (info) {
            ctx.beginPath();
            ctx.moveTo(info.barLeft, info.barY);
            ctx.lineTo(info.barRight, info.barY);
            ctx.stroke();
          }
        }
        break;
      }
      case "pregnancy": {
        const theEgg = eggs.find((e) => e.id === elem.eggId);
        const theRel = relationships.find((r) => r.id === elem.relId);
        if (theEgg && theRel) {
          const child = individuals.find((i) => i.id === theEgg.individual_id);
          if (child && child.x != null && child.y != null) {
            // Check if this is a twin chevron arm or a regular sibling drop
            if (theEgg.properties?.twin) {
              // Find the specific twin group containing this egg
              const groupId = (theEgg.properties?.twin_group as string) || "__default__";
              const groupEggs = eggs.filter((e) =>
                e.relationship_id === theRel.id && e.individual_id && e.properties?.twin &&
                ((e.properties?.twin_group as string) || "__default__") === groupId
              );
              const info = getChevronApexInfo(theRel, groupEggs);
              if (info) {
                ctx.beginPath();
                ctx.moveTo(info.apexX, info.apexY);
                ctx.lineTo(child.x, child.y - SHAPE_EDGE);
                ctx.stroke();
              }
            } else {
              const info = getSiblingBarInfo(theRel);
              if (info) {
                ctx.beginPath();
                ctx.moveTo(child.x, info.barY);
                ctx.lineTo(child.x, child.y - SHAPE_EDGE);
                ctx.stroke();
              }
            }
          }
        }
        break;
      }
      case "egg": {
        const theRel = relationships.find((r) => r.id === elem.relId);
        if (theRel) {
          // Could be monozygotic crossbar or bottom 1/3 of a drop
          // Find the twin group containing this egg
          const thisEgg = eggs.find((e) => e.id === elem.eggId);
          const groupId = thisEgg ? ((thisEgg.properties?.twin_group as string) || "__default__") : "__default__";
          const groupEggs = eggs.filter((e) =>
            e.relationship_id === theRel.id && e.individual_id && e.properties?.twin &&
            ((e.properties?.twin_group as string) || "__default__") === groupId
          );
          const monoEggs = groupEggs.filter((e) => e.properties?.monozygotic);
          const info = getChevronApexInfo(theRel, groupEggs);
          if (info && monoEggs.length === 2) {
            // Draw the monozygotic crossbar
            const tc = monoEggs.map((e) => {
              const ind = individuals.find((i) => i.id === e.individual_id);
              return ind && ind.x != null && ind.y != null ? { x: ind.x, topY: ind.y - SHAPE_EDGE } : null;
            }).filter((t): t is { x: number; topY: number } => t != null);
            if (tc.length === 2) {
              const barY = (info.apexY + Math.min(tc[0].topY, tc[1].topY)) / 2;
              const frac0 = (barY - info.apexY) / (tc[0].topY - info.apexY);
              const frac1 = (barY - info.apexY) / (tc[1].topY - info.apexY);
              const barX0 = info.apexX + (tc[0].x - info.apexX) * frac0;
              const barX1 = info.apexX + (tc[1].x - info.apexX) * frac1;
              ctx.beginPath();
              ctx.moveTo(barX0, barY);
              ctx.lineTo(barX1, barY);
              ctx.stroke();
            }
          } else {
            // Bottom 1/3 of a sibling drop
            const theEgg = eggs.find((e) => e.id === elem.eggId);
            if (theEgg) {
              const child = individuals.find((i) => i.id === theEgg.individual_id);
              const barInfo = getSiblingBarInfo(theRel);
              if (child && child.x != null && child.y != null && barInfo) {
                const childTopY = child.y - SHAPE_EDGE;
                const dropTop = barInfo.barY + (childTopY - barInfo.barY) * (2 / 3);
                ctx.beginPath();
                ctx.moveTo(child.x, dropTop);
                ctx.lineTo(child.x, childTopY);
                ctx.stroke();
              }
            }
          }
        }
        break;
      }
    }
    ctx.restore();
  }

  // Draw hover (behind selection)
  if (hoveredElement && !hitElementsEqual(hoveredElement, selectedElement)) {
    drawElementHighlight(hoveredElement, "hover");
  }
  // Draw selection with glow
  if (selectedElement) {
    drawElementHighlight(selectedElement, "selected");
  }

  // Draw find highlights (before individuals so they appear behind)
  if (findResults.length > 0) {
    for (let fi = 0; fi < findResults.length; fi++) {
      const ind = individuals.find((i) => i.id === findResults[fi]);
      if (!ind || ind.x == null || ind.y == null) continue;
      ctx.beginPath();
      ctx.arc(ind.x, ind.y, SHAPE_SIZE / 2 + 8, 0, Math.PI * 2);
      ctx.fillStyle = fi === findIndex ? findCurrentColor : findHighlightColor;
      ctx.fill();
    }
  }

  // Draw individual shapes
  for (const ind of individuals) {
    const { x, y, biological_sex } = ind;
    if (x == null || y == null) continue;

    const diseaseColors: string[] = (ind.diseases ?? [])
      .map((d) => diseaseCatalog.get(d.disease_id)?.color)
      .filter((c): c is string => !!c);
    const spec: SymbolSpec = {
      sex: biological_sex ?? "unknown",
      deathStatus: (ind.properties?.death_status as string) ?? "alive",
      affectionStatus: (ind.properties?.affection_status as string) ?? "unknown",
      fertilityStatus: (ind.properties?.fertility_status as string) ?? "unknown",
      proband: ind.proband ?? 0,
      probandText: ind.proband_text ?? "",
      diseaseColors,
    };
    const isSelected = selectedIds.has(ind.id) || selectedIndividualId === ind.id;
    drawIndividual(ctx, x, y, SHAPE_SIZE, spec, isSelected, symbolColors);
  }

  // Draw display name labels
  for (const ind of individuals) {
    const b = getDisplayNameBounds(ind);
    if (!b) continue;
    ctx.fillStyle = strokeColor;
    ctx.font = getCanvasFontWithSize(LABEL_FONT_SIZE);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const cx = b.x + b.w / 2;
    ctx.fillText(ind.display_name, cx, b.y);
  }

  // Draw individual on-canvas notes
  for (const ind of individuals) {
    if (ind.x == null || ind.y == null) continue;
    if (!ind.properties?.show_notes || !ind.notes) continue;
    const offsetX = (ind.properties.note_offset_x as number) ?? 0;
    const offsetY = (ind.properties.note_offset_y as number) ?? SHAPE_SIZE;
    const noteX = ind.x + offsetX;
    const noteY = ind.y + offsetY;
    const lines = wrapText(ind.notes, 120);

    ctx.fillStyle = strokeColor;
    ctx.font = getCanvasFontWithSize(11);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (let li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], noteX, noteY + li * 14);
    }
  }

  // Draw floating notes
  if (showAllFloatingNotes) {
    for (const note of floatingNotes) {
      if (!note.visible) continue;
      const b = getNoteBounds(note);
      const isNoteSelected = note.id === selectedNoteId;

      // Background
      ctx.fillStyle = cssVar("--color-surface");
      ctx.strokeStyle = isNoteSelected ? cssVar("--color-accent") : cssVar("--color-border");
      ctx.lineWidth = isNoteSelected ? 2 : 1;
      const r = 4;
      ctx.beginPath();
      ctx.moveTo(b.x + r, b.y);
      ctx.lineTo(b.x + b.w - r, b.y);
      ctx.quadraticCurveTo(b.x + b.w, b.y, b.x + b.w, b.y + r);
      ctx.lineTo(b.x + b.w, b.y + b.h - r);
      ctx.quadraticCurveTo(b.x + b.w, b.y + b.h, b.x + b.w - r, b.y + b.h);
      ctx.lineTo(b.x + r, b.y + b.h);
      ctx.quadraticCurveTo(b.x, b.y + b.h, b.x, b.y + b.h - r);
      ctx.lineTo(b.x, b.y + r);
      ctx.quadraticCurveTo(b.x, b.y, b.x + r, b.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Text
      ctx.fillStyle = strokeColor;
      ctx.font = getCanvasFontWithSize(11);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const lines = (note.text || "").split("\n");
      for (let li = 0; li < lines.length; li++) {
        ctx.fillText(lines[li], b.x + NOTE_PADDING, b.y + NOTE_PADDING + li * NOTE_LINE_HEIGHT, NOTE_WIDTH - NOTE_PADDING * 2);
      }
    }
  }

  // Restore zoom/pan transform
  ctx.restore();
}

// --- Rejection animation ---

function rejectStroke(pts: Point[]) {
  if (pts.length < 2) { render(); return; }

  render();
  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoomScale, zoomScale);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.strokeStyle = cssVar("--color-danger");
  ctx.lineWidth = 2.5 / zoomScale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();

  setTimeout(() => render(), 300);
}

// --- Utilities ---

function pointInPolygon(pt: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > pt.y) !== (yj > pt.y) &&
        pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointerPos(e: PointerEvent | MouseEvent): Point {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  return screenToWorld(sx, sy);
}

/** Get raw screen-space position (no zoom transform). */
function pointerScreenPos(e: PointerEvent | MouseEvent): Point {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function showToast(shape: Shape) {
  if (toastTimer) clearTimeout(toastTimer);
  toast.textContent = shape;
  toast.className = `toast ${shape}`;
  toastTimer = setTimeout(() => {
    toast.className = "toast hidden";
  }, 1500);
}

// --- Toolbar event wiring ---

btnUndo.addEventListener("click", undo);
btnRedo.addEventListener("click", redo);
updateUndoRedoButtons();

// Long-press on undo/redo shows history popup
let undoLongPressTimer: ReturnType<typeof setTimeout> | undefined;
let redoLongPressTimer: ReturnType<typeof setTimeout> | undefined;

function showHistoryPopup(stack: Snapshot[], button: HTMLButtonElement, direction: "undo" | "redo"): void {
  // Remove any existing popup
  document.querySelectorAll(".undo-history-popup").forEach((el) => el.remove());
  if (stack.length === 0) return;

  const popup = document.createElement("div");
  popup.className = "undo-history-popup";
  const rect = button.getBoundingClientRect();
  popup.style.left = `${rect.left}px`;
  popup.style.top = `${rect.bottom + 4}px`;

  // Show from most recent to oldest (max 15)
  const items = stack.slice(-15).reverse();
  for (let i = 0; i < items.length; i++) {
    const item = document.createElement("button");
    item.className = "undo-history-item";
    item.textContent = items[i].label;
    const stepsBack = i + 1;
    item.addEventListener("click", async () => {
      popup.remove();
      for (let s = 0; s < stepsBack; s++) {
        if (direction === "undo") await undo();
        else await redo();
      }
    });
    popup.append(item);
  }

  document.body.append(popup);

  // Close on any outside click
  const close = (e: MouseEvent) => {
    if (!popup.contains(e.target as Node)) {
      popup.remove();
      document.removeEventListener("click", close, true);
    }
  };
  setTimeout(() => document.addEventListener("click", close, true), 0);
}

btnUndo.addEventListener("pointerdown", () => {
  undoLongPressTimer = setTimeout(() => {
    showHistoryPopup(undoStack, btnUndo, "undo");
  }, 500);
});
btnUndo.addEventListener("pointerup", () => clearTimeout(undoLongPressTimer));
btnUndo.addEventListener("pointerleave", () => clearTimeout(undoLongPressTimer));

btnRedo.addEventListener("pointerdown", () => {
  redoLongPressTimer = setTimeout(() => {
    showHistoryPopup(redoStack, btnRedo, "redo");
  }, 500);
});
btnRedo.addEventListener("pointerup", () => clearTimeout(redoLongPressTimer));
btnRedo.addEventListener("pointerleave", () => clearTimeout(redoLongPressTimer));
btnGrid.addEventListener("click", () => {
  snapToGrid = !snapToGrid;
  btnGrid.classList.toggle("active", snapToGrid);
  render();
});
btnGrid.classList.toggle("active", snapToGrid);

btnFind.addEventListener("click", openFind);
findInput.addEventListener("input", runFind);
findPrevBtn.addEventListener("click", findPrev);
findNextBtn.addEventListener("click", findNext);
findAllBtn.addEventListener("click", () => {
  if (findResults.length > 0) {
    selectedIds = new Set(findResults);
    selectedIndividualId = null;
    render();
  }
});
findCloseBtn.addEventListener("click", closeFind);

btnAddNote.addEventListener("click", addFloatingNote);
btnToggleNotes.addEventListener("click", () => {
  showAllFloatingNotes = !showAllFloatingNotes;
  btnToggleNotes.classList.toggle("active", showAllFloatingNotes);
  render();
});
btnToggleNotes.classList.toggle("active", showAllFloatingNotes);

btnDiseases.addEventListener("click", () => {
  if (isDiseasePaletteOpen()) {
    closeDiseasePalette();
    btnDiseases.classList.remove("active");
  } else {
    openDiseasePalette();
    btnDiseases.classList.add("active");
  }
});

// --- Disease Key ---
const diseaseKeyEl = document.getElementById("disease-key") as HTMLDivElement;
let diseaseKeyOpen = false;

function refreshDiseaseKey(): void {
  if (!diseaseKeyOpen) return;
  diseaseKeyEl.innerHTML = "";

  // Title bar
  const titleBar = document.createElement("div");
  titleBar.className = "disease-key-title";
  titleBar.textContent = "Disease Key";
  diseaseKeyEl.appendChild(titleBar);

  // Make draggable by title bar
  let dkDragging = false;
  let dkStartX = 0;
  let dkStartY = 0;
  let dkOrigLeft = 0;
  let dkOrigTop = 0;
  titleBar.addEventListener("pointerdown", (e) => {
    dkDragging = true;
    dkStartX = e.clientX;
    dkStartY = e.clientY;
    const rect = diseaseKeyEl.getBoundingClientRect();
    dkOrigLeft = rect.left;
    dkOrigTop = rect.top;
    titleBar.setPointerCapture(e.pointerId);
  });
  titleBar.addEventListener("pointermove", (e) => {
    if (!dkDragging) return;
    diseaseKeyEl.style.left = `${dkOrigLeft + e.clientX - dkStartX}px`;
    diseaseKeyEl.style.top = `${dkOrigTop + e.clientY - dkStartY}px`;
    diseaseKeyEl.style.right = "auto";
    diseaseKeyEl.style.bottom = "auto";
  });
  titleBar.addEventListener("pointerup", () => { dkDragging = false; });

  // Collect diseases in use
  const usedDiseaseIds = new Set<string>();
  for (const ind of individuals) {
    if (ind.diseases) {
      for (const d of ind.diseases) usedDiseaseIds.add(d.disease_id);
    }
  }

  if (usedDiseaseIds.size === 0) {
    const empty = document.createElement("div");
    empty.className = "disease-key-empty";
    empty.textContent = "No diseases assigned";
    diseaseKeyEl.appendChild(empty);
    return;
  }

  for (const diseaseId of usedDiseaseIds) {
    const info = diseaseCatalog.get(diseaseId);
    if (!info) continue;
    const row = document.createElement("div");
    row.className = "disease-key-row";
    const dot = document.createElement("span");
    dot.className = "disease-key-dot";
    dot.style.background = info.color || "#999";
    const label = document.createElement("span");
    label.className = "disease-key-label";
    label.textContent = info.display_name || diseaseId;
    row.append(dot, label);
    diseaseKeyEl.appendChild(row);
  }
}

btnDiseaseKey.addEventListener("click", () => {
  diseaseKeyOpen = !diseaseKeyOpen;
  diseaseKeyEl.classList.toggle("hidden", !diseaseKeyOpen);
  btnDiseaseKey.classList.toggle("active", diseaseKeyOpen);
  if (diseaseKeyOpen) refreshDiseaseKey();
});

btnGenetics.addEventListener("click", () => {
  openPanelFor({ type: "genetics" });
});

btnPedigree.addEventListener("click", () => {
  openPanelFor({ type: "pedigree" });
});

btnTheme.addEventListener("click", () => {
  toggleTheme();
  render();
});

// Font settings
btnFont.addEventListener("click", () => {
  fontPopup.classList.toggle("open");
});

const fontFamilyEl = document.getElementById("font-family") as HTMLSelectElement;
const fontSizeEl = document.getElementById("font-size") as HTMLInputElement;
const fontBoldEl = document.getElementById("font-bold") as HTMLInputElement;
const fontItalicEl = document.getElementById("font-italic") as HTMLInputElement;

// Init font UI from settings
fontFamilyEl.value = fontSettings.family;
fontSizeEl.value = String(fontSettings.size);
fontBoldEl.checked = fontSettings.bold;
fontItalicEl.checked = fontSettings.italic;

fontFamilyEl.addEventListener("change", () => {
  updateFontSettings({ family: fontFamilyEl.value });
  render();
});
fontSizeEl.addEventListener("input", () => {
  updateFontSettings({ size: parseInt(fontSizeEl.value, 10) || 12 });
  render();
});
fontBoldEl.addEventListener("change", () => {
  updateFontSettings({ bold: fontBoldEl.checked });
  render();
});
fontItalicEl.addEventListener("change", () => {
  updateFontSettings({ italic: fontItalicEl.checked });
  render();
});

// Close font popup when clicking outside
document.addEventListener("click", (e) => {
  if (!fontPopup.contains(e.target as Node) && e.target !== btnFont) {
    fontPopup.classList.remove("open");
  }
});

// --- Zoom controls ---

/** Zoom towards a screen-space focal point. */
function zoomAt(newScale: number, focusScreenX: number, focusScreenY: number) {
  newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newScale));
  // Adjust pan so the world point under the cursor stays fixed
  const worldX = (focusScreenX - panX) / zoomScale;
  const worldY = (focusScreenY - panY) / zoomScale;
  panX = focusScreenX - worldX * newScale;
  panY = focusScreenY - worldY * newScale;
  zoomScale = newScale;
  render();
}

function zoomCenter(delta: number) {
  const rect = canvas.getBoundingClientRect();
  zoomAt(zoomScale + delta, rect.width / 2, rect.height / 2);
}

btnZoomIn.addEventListener("click", () => zoomCenter(ZOOM_STEP));
btnZoomOut.addEventListener("click", () => zoomCenter(-ZOOM_STEP));
btnZoomReset.addEventListener("click", () => {
  zoomScale = 1;
  panX = 0;
  panY = 0;
  render();
});

// Scroll wheel zoom (zoom towards cursor)
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
  zoomAt(zoomScale + delta, sx, sy);
}, { passive: false });

// Pinch-to-zoom (multitouch)
canvas.addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    e.preventDefault();
    const t0 = e.touches[0];
    const t1 = e.touches[1];
    pinchStartDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    pinchStartScale = zoomScale;
    const rect = canvas.getBoundingClientRect();
    pinchStartMid = {
      x: (t0.clientX + t1.clientX) / 2 - rect.left,
      y: (t0.clientY + t1.clientY) / 2 - rect.top,
    };
  }
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  if (e.touches.length === 2) {
    e.preventDefault();
    const t0 = e.touches[0];
    const t1 = e.touches[1];
    const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    const newScale = pinchStartScale * (dist / pinchStartDist);
    zoomAt(newScale, pinchStartMid.x, pinchStartMid.y);
  }
}, { passive: false });

// --- File I/O: Save / Load JSON, Export / Import GEDCOM ---

/**
 * Add entities from an imported file to the current pedigree (merge mode).
 * Creates new entities via API with fresh IDs, remapping internal references.
 */
async function addEntitiesToPedigree(
  importedInds: Record<string, unknown>[],
  importedRels: Record<string, unknown>[],
  importedEggs: Record<string, unknown>[],
): Promise<void> {
  const idMap = new Map<string, string>();

  // Create individuals with new IDs
  for (const ind of importedInds) {
    const created = await api<{ id: string }>("/api/individuals", {
      method: "POST",
      body: JSON.stringify({
        biological_sex: ind.biological_sex,
        x: ind.x,
        y: ind.y,
        display_name: ind.display_name,
        notes: ind.notes,
        properties: ind.properties,
        name: ind.name,
        death_status: ind.death_status,
        affection_status: ind.affection_status,
        fertility_status: ind.fertility_status,
        proband: ind.proband,
        proband_text: ind.proband_text,
        generation: ind.generation,
        diseases: ind.diseases,
        events: ind.events,
      }),
    });
    if (ind.id) idMap.set(ind.id as string, created.id);
    await api(`/api/pedigrees/${pedigreeId}/individuals/${created.id}`, {
      method: "POST",
    });
  }

  // Create relationships with remapped members
  for (const rel of importedRels) {
    const members = ((rel.members as string[]) ?? []).map((m) => idMap.get(m) ?? m);
    const children = ((rel.children as string[]) ?? []).map((c) => idMap.get(c) ?? c);
    const created = await api<{ id: string }>("/api/relationships", {
      method: "POST",
      body: JSON.stringify({
        members,
        children,
        properties: rel.properties,
        display_name: rel.display_name,
        consanguinity: rel.consanguinity,
        consanguinity_override: rel.consanguinity_override,
        events: rel.events,
      }),
    });
    if (rel.id) idMap.set(rel.id as string, created.id);
    await api(`/api/pedigrees/${pedigreeId}/relationships/${created.id}`, {
      method: "POST",
    });
  }

  // Create eggs with remapped references
  for (const egg of importedEggs) {
    const newIndId = egg.individual_id ? idMap.get(egg.individual_id as string) ?? egg.individual_id : null;
    const newIndIds = ((egg.individual_ids as string[]) ?? []).map((iid) => idMap.get(iid) ?? iid);
    const newRelId = egg.relationship_id ? idMap.get(egg.relationship_id as string) ?? egg.relationship_id : null;
    const created = await api<{ id: string }>("/api/eggs", {
      method: "POST",
      body: JSON.stringify({
        individual_id: newIndId,
        individual_ids: newIndIds.length > 0 ? newIndIds : undefined,
        relationship_id: newRelId,
        properties: egg.properties,
      }),
    });
    await api(`/api/pedigrees/${pedigreeId}/eggs/${created.id}`, {
      method: "POST",
    });
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

btnSave.addEventListener("click", async () => {
  if (!pedigreeId) return;
  try {
    const selIds = new Set<string>(selectedIds);
    if (selectedIndividualId) selIds.add(selectedIndividualId);

    let exportMode: "all" | "selection" = "all";
    if (selIds.size > 0) {
      const choice = await showModal("Save Pedigree", "You have individuals selected. What would you like to save?", [
        { label: "Whole pedigree", value: "all", primary: true },
        { label: "Selection only", value: "selection" },
        { label: "Cancel", value: "cancel" },
      ]);
      if (choice === "cancel") return;
      exportMode = choice as "all" | "selection";
    }

    const detail = await api<Record<string, unknown>>(`/api/pedigrees/${pedigreeId}`);

    if (exportMode === "selection") {
      const inds = (detail.individuals as PlacedIndividual[]).filter((i) => selIds.has(i.id));
      const rels = (detail.relationships as PlacedRelationship[]).filter((r) =>
        r.members.every((m) => selIds.has(m)),
      );
      const relIds = new Set(rels.map((r) => r.id));
      const filteredEggs = (detail.eggs as PlacedEgg[]).filter(
        (e) =>
          (e.individual_id && selIds.has(e.individual_id)) &&
          (e.relationship_id && relIds.has(e.relationship_id)),
      );
      detail.individuals = inds;
      detail.relationships = rels;
      detail.eggs = filteredEggs;
    }

    const blob = new Blob([JSON.stringify(detail, null, 2)], { type: "application/json" });
    downloadBlob(blob, "pedigree.json");
  } catch (err) {
    console.error("Save failed:", err);
  }
});

btnLoad.addEventListener("click", () => {
  fileJsonInput.value = "";
  fileJsonInput.click();
});

fileJsonInput.addEventListener("change", async () => {
  const file = fileJsonInput.files?.[0];
  if (!file || !pedigreeId) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    const choice = await showModal("Load File", "How would you like to load this file?", [
      { label: "Replace current", value: "replace", primary: true },
      { label: "Add to pedigree", value: "add" },
      { label: "Cancel", value: "cancel" },
    ]);
    if (choice === "cancel") return;

    pushUndo(captureSnapshot("Load file"));

    if (choice === "replace") {
      await api(`/api/pedigrees/${pedigreeId}/restore`, {
        method: "PUT",
        body: JSON.stringify({
          individuals: data.individuals ?? [],
          relationships: data.relationships ?? [],
          eggs: data.eggs ?? [],
        }),
      });
      // Also restore pedigree-level metadata if present
      const patch: Record<string, unknown> = {};
      if (data.display_name != null) patch.display_name = data.display_name;
      if (data.properties != null) patch.properties = data.properties;
      if (Object.keys(patch).length > 0) {
        await api(`/api/pedigrees/${pedigreeId}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
      }
    } else {
      await addEntitiesToPedigree(
        data.individuals ?? [],
        data.relationships ?? [],
        data.eggs ?? [],
      );
    }

    await refreshState();
    await autoLayoutUnpositioned();
    render();
  } catch (err) {
    console.error("Load failed:", err);
  }
});

btnExportGed.addEventListener("click", async () => {
  if (!pedigreeId) return;
  try {
    const selIds = new Set<string>(selectedIds);
    if (selectedIndividualId) selIds.add(selectedIndividualId);

    let idsParam = "";
    if (selIds.size > 0) {
      const choice = await showModal("Export GEDCOM", "You have individuals selected. What would you like to export?", [
        { label: "Whole pedigree", value: "all", primary: true },
        { label: "Selection only", value: "selection" },
        { label: "Cancel", value: "cancel" },
      ]);
      if (choice === "cancel") return;
      if (choice === "selection") {
        idsParam = `?ids=${[...selIds].join(",")}`;
      }
    }

    const resp = await fetch(`/api/pedigrees/${pedigreeId}/export.ged${idsParam}`);
    if (!resp.ok) throw new Error(`Export failed: ${resp.status}`);
    const blob = await resp.blob();
    downloadBlob(blob, "pedigree.ged");
  } catch (err) {
    console.error("Export GEDCOM failed:", err);
  }
});

btnImportGed.addEventListener("click", () => {
  fileGedInput.value = "";
  fileGedInput.click();
});

fileGedInput.addEventListener("change", async () => {
  const file = fileGedInput.files?.[0];
  if (!file || !pedigreeId) return;
  try {
    const content = await file.text();

    const choice = await showModal("Import GEDCOM", "How would you like to import this file?", [
      { label: "Replace current", value: "replace", primary: true },
      { label: "Add to pedigree", value: "add" },
      { label: "Cancel", value: "cancel" },
    ]);
    if (choice === "cancel") return;

    pushUndo(captureSnapshot("Import GEDCOM"));

    if (choice === "replace") {
      await api(`/api/pedigrees/${pedigreeId}/import/gedcom`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
    } else {
      // Parse on server, then add entities client-side
      const parsed = await api<{
        individuals: Record<string, unknown>[];
        relationships: Record<string, unknown>[];
        eggs: Record<string, unknown>[];
      }>(`/api/pedigrees/${pedigreeId}/import/gedcom?mode=parse`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      await addEntitiesToPedigree(parsed.individuals, parsed.relationships, parsed.eggs);
    }

    await refreshState();
    await autoLayoutUnpositioned();
    render();
  } catch (err) {
    console.error("Import GEDCOM failed:", err);
  }
});

btnImportXeg.addEventListener("click", () => {
  fileXegInput.value = "";
  fileXegInput.click();
});

fileXegInput.addEventListener("change", async () => {
  const file = fileXegInput.files?.[0];
  if (!file || !pedigreeId) return;
  try {
    const content = await file.text();

    const choice = await showModal("Import XEG", "How would you like to import this file?", [
      { label: "Replace current", value: "replace", primary: true },
      { label: "Add to pedigree", value: "add" },
      { label: "Cancel", value: "cancel" },
    ]);
    if (choice === "cancel") return;

    // Always parse first to extract diseases for matching
    const parsed = await api<{
      individuals: Record<string, unknown>[];
      relationships: Record<string, unknown>[];
      eggs: Record<string, unknown>[];
      diseases?: { id: string; display_name: string; color: string }[];
    }>(`/api/pedigrees/${pedigreeId}/import/xeg?mode=parse`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });

    // Disease matching: if parsed diseases exist, show matching modal
    const parsedDiseases = parsed.diseases ?? [];
    let diseaseIdMap: Map<string, string> | null = null;
    if (parsedDiseases.length > 0) {
      const existingDiseases = await api<DiseaseInfo[]>("/api/diseases");
      diseaseIdMap = await showDiseaseMatchModal(parsedDiseases, existingDiseases);
      if (diseaseIdMap.size === 0) return; // cancelled

      // Create new diseases for "__new__" entries and remap
      for (const [importId, targetId] of diseaseIdMap.entries()) {
        if (targetId === "__new__") {
          const d = parsedDiseases.find((dd) => dd.id === importId);
          if (d) {
            const created = await api<{ id: string }>("/api/diseases", {
              method: "POST",
              body: JSON.stringify({ display_name: d.display_name, color: d.color }),
            });
            diseaseIdMap.set(importId, created.id);
          }
        }
      }

      // Remap disease_id references in individuals
      for (const ind of parsed.individuals) {
        const diseases = ind.diseases as { disease_id: string }[] | undefined;
        if (diseases) {
          for (const d of diseases) {
            const mapped = diseaseIdMap.get(d.disease_id);
            if (mapped) d.disease_id = mapped;
          }
        }
      }
    }

    pushUndo(captureSnapshot("Import XEG"));

    if (choice === "replace") {
      await api(`/api/pedigrees/${pedigreeId}/restore`, {
        method: "PUT",
        body: JSON.stringify({
          individuals: parsed.individuals,
          relationships: parsed.relationships,
          eggs: parsed.eggs,
        }),
      });
    } else {
      await addEntitiesToPedigree(parsed.individuals, parsed.relationships, parsed.eggs);
    }

    await refreshState();
    await autoLayoutUnpositioned();
    render();
  } catch (err) {
    console.error("Import XEG failed:", err);
  }
});
