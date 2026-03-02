import "./style.css";
import { recognise, centroid, Point, Shape } from "./recognise";

// --- Types ---

interface PlacedIndividual {
  id: string;
  x: number;
  y: number;
  biological_sex: string | null;
}

// --- DOM ---

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <h1>Evagene</h1>
  <p>Pedigree management for clinical and research geneticists.</p>
  <canvas id="canvas"></canvas>
  <div id="toast" class="toast hidden"></div>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const ctx = canvas.getContext("2d")!;
const toast = document.querySelector<HTMLDivElement>("#toast")!;

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
let drawing = false;
let points: Point[] = [];
let toastTimer: ReturnType<typeof setTimeout> | undefined;

// Drag state
let dragging = false;
let dragId: string | null = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

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
  const resp = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!resp.ok) throw new Error(`API ${resp.status}: ${await resp.text()}`);
  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
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

// --- Drawing handlers ---

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  const pos = pointerPos(e);

  // Hit-test existing individuals
  const hitRadius = SHAPE_SIZE / 2 + 4;
  const hit = individuals.find(
    (ind) =>
      ind.x != null &&
      ind.y != null &&
      Math.hypot(pos.x - ind.x, pos.y - ind.y) <= hitRadius,
  );

  if (hit) {
    // Enter drag mode
    dragging = true;
    dragId = hit.id;
    dragOffsetX = hit.x - pos.x;
    dragOffsetY = hit.y - pos.y;
  } else {
    // Enter draw mode
    drawing = true;
    points = [pos];

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (dragging && dragId) {
    const pos = pointerPos(e);
    const ind = individuals.find((i) => i.id === dragId);
    if (ind) {
      ind.x = pos.x + dragOffsetX;
      ind.y = pos.y + dragOffsetY;
      render();
    }
    return;
  }

  if (!drawing) return;
  const pos = pointerPos(e);
  points.push(pos);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
});

canvas.addEventListener("pointerup", () => {
  if (dragging && dragId) {
    const ind = individuals.find((i) => i.id === dragId);
    dragging = false;
    const id = dragId;
    dragId = null;
    if (ind) {
      handleDragEnd(id, ind.x, ind.y);
    }
    return;
  }

  if (!drawing) return;
  drawing = false;

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

  // Immediately clear freehand stroke and show perfect shape
  render();

  handleShapePlaced(sex, center.x, center.y);
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
    const detail = await api<{ individuals: PlacedIndividual[] }>(
      `/api/pedigrees/${pedigreeId}`,
    );
    individuals = detail.individuals;

    // 4. Redraw
    render();
  } catch (err) {
    console.error("Failed to place individual:", err);
  }
}

// --- Drag completion ---

async function handleDragEnd(id: string, x: number, y: number) {
  try {
    await api(`/api/individuals/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ x, y }),
    });

    // Refresh full state
    if (pedigreeId) {
      const detail = await api<{ individuals: PlacedIndividual[] }>(
        `/api/pedigrees/${pedigreeId}`,
      );
      individuals = detail.individuals;
      render();
    }
  } catch (err) {
    console.error("Failed to move individual:", err);
  }
}

// --- Rendering ---

function render() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 2;

  for (const ind of individuals) {
    const { x, y, biological_sex } = ind;
    if (x == null || y == null) continue;

    ctx.beginPath();

    if (biological_sex === "female") {
      // Circle
      const r = SHAPE_SIZE / 2;
      ctx.arc(x, y, r, 0, Math.PI * 2);
    } else if (biological_sex === "male") {
      // Square (centred)
      const half = SHAPE_SIZE / 2;
      ctx.rect(x - half, y - half, SHAPE_SIZE, SHAPE_SIZE);
    } else {
      // Diamond (unknown / intersex / null)
      const half = SHAPE_SIZE / 2;
      ctx.moveTo(x, y - half);
      ctx.lineTo(x + half, y);
      ctx.lineTo(x, y + half);
      ctx.lineTo(x - half, y);
      ctx.closePath();
    }

    ctx.stroke();
  }
}

// --- Rejection animation ---

function rejectStroke(pts: Point[]) {
  if (pts.length < 2) { render(); return; }

  // Redraw the stroke in red over the current canvas
  render();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  // Fade out after a brief moment
  setTimeout(() => render(), 300);
}

// --- Utilities ---

function pointerPos(e: PointerEvent): Point {
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
