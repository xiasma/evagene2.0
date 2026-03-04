import "./style.css";
import { recognise, centroid, Point, Shape } from "./recognise";
import { drawIndividual, SymbolSpec, SymbolColors } from "./symbols";
import { initPanel, openPanel, closePanel } from "./panel";
import { cssVar, toggleTheme, fontSettings, updateFontSettings, getCanvasFontWithSize } from "./theme";

// --- Types ---

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
}

interface PlacedRelationship {
  id: string;
  members: string[];
  properties: Record<string, unknown>;
}

interface PlacedEgg {
  id: string;
  individual_id: string | null;
  relationship_id: string | null;
  properties: Record<string, unknown>;
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
    <p>Pedigree management for clinical and research geneticists.</p>
    <div class="toolbar">
      <button id="btn-undo" title="Undo (Ctrl+Z)">Undo</button>
      <button id="btn-redo" title="Redo (Ctrl+Y)">Redo</button>
      <button id="btn-grid" title="Toggle grid (Ctrl+G)">Grid</button>
      <button id="btn-find" title="Find (Ctrl+F)">Find</button>
      <button id="btn-add-note" title="Add floating note">+ Note</button>
      <button id="btn-toggle-notes" title="Show/hide all floating notes">Notes</button>
      <div class="font-settings">
        <button id="btn-font">Font</button>
        <div id="font-popup" class="font-settings-popup">
          <label>Family</label>
          <select id="font-family">
            <option value="system-ui">System UI</option>
            <option value="Arial">Arial</option>
            <option value="Georgia">Georgia</option>
            <option value="monospace">Monospace</option>
          </select>
          <label>Size</label>
          <input id="font-size" type="number" min="8" max="24" value="12">
          <div class="font-row">
            <input id="font-bold" type="checkbox"><label>Bold</label>
            <input id="font-italic" type="checkbox"><label>Italic</label>
          </div>
        </div>
      </div>
      <button id="btn-theme" title="Toggle theme">Theme</button>
      <span class="separator"></span>
      <button id="btn-zoom-in" title="Zoom in">+</button>
      <button id="btn-zoom-out" title="Zoom out">&minus;</button>
      <button id="btn-zoom-reset" title="Reset zoom">1:1</button>
      <span class="separator"></span>
      <button id="btn-save" title="Save JSON">Save</button>
      <button id="btn-load" title="Load JSON">Load</button>
      <button id="btn-export-ged" title="Export GEDCOM">Export .ged</button>
      <button id="btn-import-ged" title="Import GEDCOM">Import .ged</button>
    </div>
  </div>
  <input type="file" id="file-json" accept=".json" style="display:none">
  <input type="file" id="file-ged" accept=".ged,.gedcom" style="display:none">
  <canvas id="canvas"></canvas>
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
const fileJsonInput = document.getElementById("file-json") as HTMLInputElement;
const fileGedInput = document.getElementById("file-ged") as HTMLInputElement;

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
let drawing = false;
let points: Point[] = [];
let toastTimer: ReturnType<typeof setTimeout> | undefined;

// Drag state
let dragging = false;
let groupDragOffsets: Map<string, { dx: number; dy: number }> = new Map();

// Selection state (lasso)
let selectedIds: Set<string> = new Set();

// Single-select state (for properties panel)
let selectedIndividualId: string | null = null;
let pointerMoved = false;
let clickHitId: string | null = null;

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
  individuals: PlacedIndividual[];
  relationships: PlacedRelationship[];
  eggs: PlacedEgg[];
}

const UNDO_LIMIT = 50;
const undoStack: Snapshot[] = [];
const redoStack: Snapshot[] = [];

function captureSnapshot(): Snapshot {
  return {
    individuals: JSON.parse(JSON.stringify(individuals)),
    relationships: JSON.parse(JSON.stringify(relationships)),
    eggs: JSON.parse(JSON.stringify(eggs)),
  };
}

function pushUndo(snap: Snapshot): void {
  undoStack.push(snap);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
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

/** Pan-drag state (middle-click or Ctrl+left) */
let panning = false;
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

// --- Initialisation: create a working pedigree ---

async function init() {
  const ped = await api<{ id: string }>("/api/pedigrees", {
    method: "POST",
    body: JSON.stringify({ display_name: "Canvas Pedigree" }),
  });
  pedigreeId = ped.id;
}

init();

// --- Properties panel ---

initPanel({
  onUpdate: async () => {
    await refreshState();
    render();
  },
  onClose: () => {
    selectedIndividualId = null;
    render();
  },
  api,
  onBeforeMutation: () => {
    pushUndo(captureSnapshot());
  },
});

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
  const half = SHAPE_SIZE / 2;
  const [left, right] = a.x <= b.x ? [a, b] : [b, a];
  return {
    x: (left.x + half + right.x - half) / 2,
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
  const relEggs = eggs.filter((e) => e.relationship_id === rel.id && e.individual_id && !e.properties?.twin);
  const children = relEggs
    .map((e) => individuals.find((i) => i.id === e.individual_id))
    .filter((i): i is PlacedIndividual => i != null && i.x != null && i.y != null);
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

/** Compute the chevron apex position for a twin relationship. */
function getChevronApexInfo(rel: PlacedRelationship): { apexX: number; apexY: number; relId: string } | null {
  const half = SHAPE_SIZE / 2;
  const twinEggs = eggs.filter((e) => e.relationship_id === rel.id && e.individual_id && e.properties?.twin);
  if (twinEggs.length < 2) return null;

  const twinChildren = twinEggs
    .map((e) => individuals.find((i) => i.id === e.individual_id))
    .filter((i): i is PlacedIndividual => i != null && i.x != null && i.y != null);
  if (twinChildren.length < 2) return null;

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

/** Hit-test the chevron apex point. */
function hitChevronApex(pos: Point): { relId: string } | null {
  const relsWithTwinEggs = new Set(
    eggs.filter((e) => e.relationship_id && e.properties?.twin).map((e) => e.relationship_id!)
  );
  for (const relId of relsWithTwinEggs) {
    const rel = relationships.find((r) => r.id === relId);
    if (!rel) continue;
    const info = getChevronApexInfo(rel);
    if (!info) continue;
    if (Math.hypot(pos.x - info.apexX, pos.y - info.apexY) <= PARENTAL_TOLERANCE) {
      return { relId: info.relId };
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

// --- Drawing handlers ---

function beginStroke(pos: Point) {
  drawing = true;
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

  // Middle-click or Ctrl+click → pan
  if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
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

  // Priority 3: Hit existing parental line → add sibling to same relationship
  const parentalHit = hitParentalLine(pos);
  if (parentalHit) {
    drawingParentalLine = true;
    parentalSource = { type: "relationship", relId: parentalHit.id };
    beginStroke(pos);
    return;
  }

  // Priority 4: Hit relationship line → parental line from relationship
  const relHit = hitRelationshipLine(pos);
  if (relHit) {
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

  if (hit && selectedIds.has(hit.id)) {
    // Hit a selected shape → group drag all selected
    clickHitId = hit.id;
    dragging = true;
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
    selectedNoteId = null;
    dragging = true;
    groupDragOffsets = new Map();
    groupDragOffsets.set(hit.id, { dx: hit.x - pos.x, dy: hit.y - pos.y });
    render();
  } else {
    // Hit nothing → clear all selection, close panel, enter draw mode
    selectedIds = new Set();
    selectedIndividualId = null;
    selectedNoteId = null;
    closePanel();
    render();
    beginStroke(pos);
  }
});

canvas.addEventListener("pointermove", (e) => {
  pointerMoved = true;

  // Pan handling (uses screen coords)
  if (panning) {
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

  if (!drawing) return;
  points.push(pos);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
});

canvas.addEventListener("pointerup", () => {
  // Pan end
  if (panning) {
    panning = false;
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

  // Bar / apex drag end
  if (draggingBar || draggingApex) {
    draggingBar = false;
    draggingApex = false;
    dragRelId = null;
    return;
  }

  // Single-click (no drag) on an individual → open properties panel
  if (clickHitId && !pointerMoved) {

    selectedIndividualId = clickHitId;
    selectedIds = new Set();
    selectedNoteId = null;
    dragging = false;
    groupDragOffsets = new Map();
    drawing = false;
    render();
    openPanel(clickHitId);
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
    if (movedIndividuals.length > 0) {
      pushUndo(captureSnapshot());
      handleGroupDragEnd(movedIndividuals);
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
          pushUndo(captureSnapshot());
          handleParentalLineFromRelationship(source.relId, child.id);
        } else {
          rejectStroke(points);
        }
      } else if (source.type === "parent") {
        const child = hitIndividual(endpoint);
        if (child && child.id !== source.indId) {
          render();
          pushUndo(captureSnapshot());
          handleParentalLineFromIndividual(source.indId, child.id);
        } else {
          rejectStroke(points);
        }
      } else if (source.type === "child") {
        // Check if endpoint hits top or body of another individual → sibling/twin
        const topTarget = hitTop(endpoint) ?? hitIndividual(endpoint);
        console.log("[TWIN] child source, endpoint:", endpoint, "topTarget:", topTarget?.id ?? "none");
        if (topTarget && topTarget.id !== source.indId) {
          const isChevron = detectChevron(points);
          console.log("[TWIN] isChevron:", isChevron, "indA:", source.indId, "indB:", topTarget.id);
          render();
          pushUndo(captureSnapshot());
          handleSiblingConnection(source.indId, topTarget.id, isChevron);
        } else {
          // Reverse: child → relationship line
          const relTarget = hitRelationshipLine(endpoint);
          if (relTarget) {
            render();
            pushUndo(captureSnapshot());
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
        pushUndo(captureSnapshot());
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

        selectedIds = new Set(enclosed.map((ind) => ind.id));
        selectedIndividualId = null;
        closePanel();
        render();
        return;
      }
    }
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

  pushUndo(captureSnapshot());
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

    // 4. Redraw
    render();
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

    // 4. Redraw
    render();
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

async function refreshState() {
  if (!pedigreeId) return;
  const detail = await api<{
    individuals: PlacedIndividual[];
    relationships: PlacedRelationship[];
    eggs: PlacedEgg[];
    properties: Record<string, unknown>;
  }>(`/api/pedigrees/${pedigreeId}`);
  individuals = detail.individuals;
  relationships = detail.relationships ?? [];
  eggs = detail.eggs ?? [];
  // Load floating notes from pedigree properties
  floatingNotes = (detail.properties?.floating_notes as FloatingNote[]) ?? [];
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
      rel = { id: newRel.id, members: [parentId], properties: {} };
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

  // Peak must be well above both endpoints
  const rise = Math.min(startY - peakY, endY - peakY);
  if (rise < 20) return false;

  const flatThreshold = peakY + rise * 0.3;
  let flatCount = 0;
  for (const pt of pts) {
    if (pt.y <= flatThreshold) flatCount++;
  }
  const flatRatio = flatCount / pts.length;

  const result = flatRatio < 0.30;
  console.log("[CHEVRON] rise:", rise.toFixed(1), "flatRatio:", flatRatio.toFixed(2), "→", result);
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
    console.log("[SIBLING] twin:", twin, "relA:", relA?.id ?? "none", "relB:", relB?.id ?? "none");

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

      // If both already marked as twins, nothing to do
      if (eggA?.properties?.twin && eggB?.properties?.twin) {
        render();
        return;
      }

      // Mark existing eggs as twin
      if (eggA && !eggA.properties?.twin) {
        await api(`/api/eggs/${eggA.id}`, {
          method: "PATCH",
          body: JSON.stringify({ properties: { ...eggA.properties, twin: true } }),
        });
      }
      if (eggB && !eggB.properties?.twin) {
        await api(`/api/eggs/${eggB.id}`, {
          method: "PATCH",
          body: JSON.stringify({ properties: { ...eggB.properties, twin: true } }),
        });
      }

      // If one individual doesn't have an egg yet, create it
      if (!eggA) {
        const egg = await api<{ id: string }>("/api/eggs", {
          method: "POST",
          body: JSON.stringify({
            relationship_id: targetRel.id,
            individual_id: indAId,
            properties: { twin: true },
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
            properties: { twin: true },
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
  pushUndo(captureSnapshot());
  try {
    for (const id of ids) {
      // 1. Delete eggs where this individual is the child
      const indEggs = eggs.filter((e) => e.individual_id === id);
      for (const egg of indEggs) {
        await api(`/api/eggs/${egg.id}`, { method: "DELETE" });
      }

      // 2. Delete relationships where this individual is a member, and their eggs
      const indRels = relationships.filter((r) => r.members.includes(id));
      for (const rel of indRels) {
        const relEggs = eggs.filter((e) => e.relationship_id === rel.id);
        for (const egg of relEggs) {
          await api(`/api/eggs/${egg.id}`, { method: "DELETE" });
        }
        await api(`/api/relationships/${rel.id}`, { method: "DELETE" });
      }

      // 3. Delete the individual
      await api(`/api/individuals/${id}`, { method: "DELETE" });
    }

    selectedIds = new Set();
    selectedIndividualId = null;
    closePanel();
    await refreshState();
    render();
  } catch (err) {
    console.error("Failed to delete individuals:", err);
  }
}

// --- Undo/Redo execution ---

async function undo() {
  if (undoStack.length === 0 || !pedigreeId) return;
  const snap = undoStack.pop()!;
  redoStack.push(captureSnapshot());
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
  } catch (err) {
    console.error("Undo failed:", err);
  }
}

async function redo() {
  if (redoStack.length === 0 || !pedigreeId) return;
  const snap = redoStack.pop()!;
  undoStack.push(captureSnapshot());
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
  } catch (err) {
    console.error("Redo failed:", err);
  }
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
  const copiedEggs = eggs.filter(
    (e) =>
      (e.individual_id && ids.has(e.individual_id)) &&
      (e.relationship_id && copiedRelIds.has(e.relationship_id)),
  );

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
  pushUndo(captureSnapshot());

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
      const newRelId = egg.relationship_id ? idMap.get(egg.relationship_id) ?? egg.relationship_id : null;
      const created = await api<{ id: string }>("/api/eggs", {
        method: "POST",
        body: JSON.stringify({
          individual_id: newIndId,
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
  render();
}

function updateFindCount(): void {
  if (findResults.length === 0) {
    findCount.textContent = findInput.value ? "0" : "";
  } else {
    findCount.textContent = `${findIndex + 1}/${findResults.length}`;
  }
}

function findNext(): void {
  if (findResults.length === 0) return;
  findIndex = (findIndex + 1) % findResults.length;
  updateFindCount();
  render();
}

function findPrev(): void {
  if (findResults.length === 0) return;
  findIndex = (findIndex - 1 + findResults.length) % findResults.length;
  updateFindCount();
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
  pushUndo(captureSnapshot());
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
  pushUndo(captureSnapshot());
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

  if (isInput) return;

  // Delete
  if (e.key === "Delete" || e.key === "Backspace") {
    // Delete floating note if selected
    if (selectedNoteId) {
      e.preventDefault();
      deleteSelectedNote();
      return;
    }
    const ids = new Set<string>(selectedIds);
    if (selectedIndividualId) ids.add(selectedIndividualId);
    if (ids.size === 0) return;
    e.preventDefault();
    deleteIndividuals([...ids]);
    return;
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
    pushUndo(captureSnapshot());
    handleSetDeathStatus(hitInd.id, "dead");
    return true;
  }

  if (currentStatus === "dead") {
    const isSameSign = (dx > 0 && dy > 0) || (dx < 0 && dy < 0);
    if (isSameSign) {
      render();
      pushUndo(captureSnapshot());
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

  if (scribbledIds.length === 0) return false;

  flashAndDelete(scribbledIds);
  return true;
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

  const eggsByRel = new Map<string, PlacedEgg[]>();
  for (const egg of eggs) {
    if (!egg.relationship_id || !egg.individual_id || !egg.properties?.twin) continue;
    const key = egg.relationship_id;
    if (!eggsByRel.has(key)) eggsByRel.set(key, []);
    eggsByRel.get(key)!.push(egg);
  }

  for (const [relId, twinEggs] of eggsByRel) {
    if (twinEggs.length < 2) continue;
    if (twinEggs.some((e) => e.properties?.monozygotic)) continue;

    const rel = relationships.find((r) => r.id === relId);
    if (!rel) continue;
    const info = getChevronApexInfo(rel);
    if (!info) continue;

    const twinChildren = twinEggs
      .map((e) => ({
        egg: e,
        ind: individuals.find((i) => i.id === e.individual_id),
      }))
      .filter((t) => t.ind && t.ind.x != null && t.ind.y != null);
    if (twinChildren.length < 2) continue;

    const apexY = info.apexY;
    const minTopY = Math.min(...twinChildren.map((c) => c.ind!.y - half));

    let hitCount = 0;
    for (const pt of pts) {
      if (pt.y < apexY - 5 || pt.y > minTopY + 5) continue;
      const frac = (pt.y - apexY) / (minTopY - apexY);
      if (frac <= 0) continue;
      const armXs = twinChildren.map((tc) => info.apexX + (tc.ind!.x - info.apexX) * frac);
      const armLeft = Math.min(...armXs) - 15;
      const armRight = Math.max(...armXs) + 15;
      if (pt.x >= armLeft && pt.x <= armRight) hitCount++;
    }

    if (hitCount >= Math.min(pts.length * 0.3, 5)) {
      pushUndo(captureSnapshot());
      handleMarkMonozygotic(twinEggs);
      return true;
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

    await Promise.all(
      twinEggs.map((egg) =>
        api(`/api/eggs/${egg.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            properties: { ...(egg.properties ?? {}), twin: true, monozygotic: true },
          }),
        }),
      ),
    );
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

    const half = SHAPE_SIZE / 2;
    const [left, right] = a.x <= b.x ? [a, b] : [b, a];

    ctx.beginPath();
    ctx.moveTo(left.x + half, left.y);
    ctx.lineTo(right.x - half, right.y);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.stroke();
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

    const half = SHAPE_SIZE / 2;
    let origin: { x: number; y: number } | null = null;
    if (rel.members.length >= 2) {
      origin = getRelationshipMidpoint(rel);
    } else if (rel.members.length === 1) {
      const parent = individuals.find((i) => i.id === rel.members[0]);
      if (parent && parent.x != null && parent.y != null) {
        origin = { x: parent.x, y: parent.y + half };
      }
    } else if (rel.members.length === 0) {
      const children = relEggs
        .map((e) => individuals.find((i) => i.id === e.individual_id))
        .filter((i): i is PlacedIndividual => i != null && i.x != null && i.y != null);
      if (children.length >= 2) {
        const avgX = children.reduce((s, c) => s + c.x, 0) / children.length;
        const minY = Math.min(...children.map((c) => c.y - half));
        origin = { x: avgX, y: minY - SIBLING_BAR_HEIGHT * 1.5 };
      }
    }
    if (!origin) continue;

    // Separate twin eggs from regular eggs
    const twinEggs = relEggs.filter((e) => e.properties?.twin);
    const regularEggs = relEggs.filter((e) => !e.properties?.twin);
    const effectiveRegular = twinEggs.length >= 2 ? regularEggs : [...regularEggs, ...twinEggs];
    const effectiveTwins = twinEggs.length >= 2 ? twinEggs : [];

    // Draw regular (non-twin) eggs: single horizontal bar + vertical drops
    const regChildren = effectiveRegular
      .map((e) => individuals.find((i) => i.id === e.individual_id))
      .filter((i): i is PlacedIndividual => i != null && i.x != null && i.y != null);

    if (regChildren.length > 0) {
      const noParents = rel.members.length === 0;
      const minTopY = Math.min(...regChildren.map((c) => c.y - half));
      const defaultBarY = noParents
        ? minTopY - SIBLING_BAR_HEIGHT
        : origin ? (origin.y + minTopY) / 2 : minTopY - SIBLING_BAR_HEIGHT;
      const barOffset = siblingBarOffsets.get(rel.id) ?? 0;
      const barY = defaultBarY + barOffset;

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;

      if (!noParents) {
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(origin.x, barY);
        ctx.stroke();
      }

      const xs = regChildren.map((c) => c.x);
      if (!noParents) xs.push(origin.x);
      const barLeft = Math.min(...xs);
      const barRight = Math.max(...xs);
      ctx.beginPath();
      ctx.moveTo(barLeft, barY);
      ctx.lineTo(barRight, barY);
      ctx.stroke();

      for (const child of regChildren) {
        const childTopY = child.y - half;
        ctx.beginPath();
        ctx.moveTo(child.x, barY);
        ctx.lineTo(child.x, childTopY);
        ctx.stroke();
      }
    }

    // Draw twin eggs as chevron from shared apex
    if (effectiveTwins.length >= 2) {
      const twinChildren = effectiveTwins
        .map((e) => ({
          egg: e,
          ind: individuals.find((i) => i.id === e.individual_id),
        }))
        .filter((t) => t.ind && t.ind.x != null && t.ind.y != null)
        .map((t) => ({
          egg: t.egg,
          x: t.ind!.x,
          topY: t.ind!.y - half,
        }));

      if (twinChildren.length >= 2) {
        const avgX = twinChildren.reduce((s, c) => s + c.x, 0) / twinChildren.length;
        const minTopY = Math.min(...twinChildren.map((c) => c.topY));
        const defaultApexY = minTopY - (minTopY - origin.y) * 0.8;
        const apexY = defaultApexY + (chevronApexOffsets.get(rel.id) ?? 0);

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        if (rel.members.length > 0) {
          ctx.beginPath();
          ctx.moveTo(origin.x, origin.y);
          ctx.lineTo(origin.x, apexY);
          if (Math.abs(origin.x - avgX) > 1) {
            ctx.lineTo(avgX, apexY);
          }
          ctx.stroke();
        }

        const isMonozygotic = effectiveTwins.some((e) => e.properties?.monozygotic);

        for (const tc of twinChildren) {
          ctx.beginPath();
          ctx.moveTo(avgX, apexY);
          ctx.lineTo(tc.x, tc.topY);
          ctx.stroke();
        }

        if (isMonozygotic && twinChildren.length === 2) {
          const barY = (apexY + Math.min(twinChildren[0].topY, twinChildren[1].topY)) / 2;
          const frac0 = (barY - apexY) / (twinChildren[0].topY - apexY);
          const frac1 = (barY - apexY) / (twinChildren[1].topY - apexY);
          const barX0 = avgX + (twinChildren[0].x - avgX) * frac0;
          const barX1 = avgX + (twinChildren[1].x - avgX) * frac1;
          ctx.beginPath();
          ctx.moveTo(barX0, barY);
          ctx.lineTo(barX1, barY);
          ctx.stroke();
        }
      }
    }
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

    const spec: SymbolSpec = {
      sex: biological_sex ?? "unknown",
      deathStatus: (ind.properties?.death_status as string) ?? "alive",
      affectionStatus: (ind.properties?.affection_status as string) ?? "unknown",
      fertilityStatus: (ind.properties?.fertility_status as string) ?? "unknown",
      proband: ind.proband ?? 0,
      probandText: ind.proband_text ?? "",
    };
    const isSelected = selectedIds.has(ind.id) || selectedIndividualId === ind.id;
    drawIndividual(ctx, x, y, SHAPE_SIZE, spec, isSelected, symbolColors);
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
    const detail = await api<Record<string, unknown>>(`/api/pedigrees/${pedigreeId}`);
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
    pushUndo(captureSnapshot());
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
    await refreshState();
    render();
  } catch (err) {
    console.error("Load failed:", err);
  }
});

btnExportGed.addEventListener("click", async () => {
  if (!pedigreeId) return;
  try {
    const resp = await fetch(`/api/pedigrees/${pedigreeId}/export.ged`);
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
    pushUndo(captureSnapshot());
    await api(`/api/pedigrees/${pedigreeId}/import/gedcom`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    await refreshState();
    render();
  } catch (err) {
    console.error("Import GEDCOM failed:", err);
  }
});
