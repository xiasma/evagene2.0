import "./style.css";
import { recognise, centroid, Point, Shape } from "./recognise";

// --- Types ---

interface PlacedIndividual {
  id: string;
  x: number;
  y: number;
  biological_sex: string | null;
}

interface PlacedRelationship {
  id: string;
  members: string[];
}

interface PlacedEgg {
  id: string;
  individual_id: string | null;
  relationship_id: string | null;
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

// Connection drawing state
let connecting = false;
let connectSourceId: string | null = null;

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

// --- Drawing handlers ---

function beginStroke(pos: Point) {
  drawing = true;
  points = [pos];
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  const pos = pointerPos(e);

  // Priority 1: Hit relationship line → parental line from relationship
  const relHit = hitRelationshipLine(pos);
  if (relHit) {
    drawingParentalLine = true;
    parentalSource = { type: "relationship", relId: relHit.id };
    beginStroke(pos);
    return;
  }

  // Priority 2: Hit bottom of individual → parental line from parent
  const bottomHit = hitBottom(pos);
  if (bottomHit) {
    drawingParentalLine = true;
    parentalSource = { type: "parent", indId: bottomHit.id };
    beginStroke(pos);
    return;
  }

  // Priority 3: Hit top of individual → parental line (reverse: child→parent)
  const topHit = hitTop(pos);
  if (topHit) {
    drawingParentalLine = true;
    parentalSource = { type: "child", indId: topHit.id };
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
    dragging = true;
    groupDragOffsets = new Map();
    for (const id of selectedIds) {
      const ind = individuals.find((i) => i.id === id);
      if (ind && ind.x != null && ind.y != null) {
        groupDragOffsets.set(id, { dx: ind.x - pos.x, dy: ind.y - pos.y });
      }
    }
  } else if (hit) {
    // Hit an unselected shape → clear selection, single drag
    selectedIds = new Set();
    dragging = true;
    groupDragOffsets = new Map();
    groupDragOffsets.set(hit.id, { dx: hit.x - pos.x, dy: hit.y - pos.y });
    render();
  } else {
    // Hit nothing → clear selection, enter draw mode
    selectedIds = new Set();
    render();
    beginStroke(pos);
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (dragging && groupDragOffsets.size > 0) {
    const pos = pointerPos(e);
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
  const pos = pointerPos(e);
  points.push(pos);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
});

canvas.addEventListener("pointerup", () => {
  if (dragging && groupDragOffsets.size > 0) {
    const movedIndividuals: { id: string; x: number; y: number }[] = [];
    for (const id of groupDragOffsets.keys()) {
      const ind = individuals.find((i) => i.id === id);
      if (ind) {
        movedIndividuals.push({ id: ind.id, x: ind.x, y: ind.y });
      }
    }
    dragging = false;
    groupDragOffsets = new Map();
    if (movedIndividuals.length > 0) {
      handleGroupDragEnd(movedIndividuals);
    }
    return;
  }

  if (!drawing) return;
  drawing = false;

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
          handleParentalLineFromRelationship(source.relId, child.id);
        } else {
          rejectStroke(points);
        }
      } else if (source.type === "parent") {
        const child = hitIndividual(endpoint);
        if (child && child.id !== source.indId) {
          render();
          handleParentalLineFromIndividual(source.indId, child.id);
        } else {
          rejectStroke(points);
        }
      } else if (source.type === "child") {
        // Reverse: child → relationship line OR child → parent individual
        const relTarget = hitRelationshipLine(endpoint);
        if (relTarget) {
          render();
          handleParentalLineFromRelationship(relTarget.id, source.indId);
        } else {
          const parent = hitIndividual(endpoint);
          if (parent && parent.id !== source.indId) {
            render();
            handleParentalLineFromIndividual(parent.id, source.indId);
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
        render();
        return;
      }
    }
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
  }>(`/api/pedigrees/${pedigreeId}`);
  individuals = detail.individuals;
  relationships = detail.relationships ?? [];
  eggs = detail.eggs ?? [];
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
      rel = { id: newRel.id, members: [parentId] };
    }

    await api(`/api/relationships/${rel.id}/offspring`, {
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

// --- Rendering ---

function render() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

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
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Draw parental lines (egg connections)
  for (const egg of eggs) {
    if (!egg.relationship_id || !egg.individual_id) continue;

    const rel = relationships.find((r) => r.id === egg.relationship_id);
    if (!rel) continue;

    // Compute origin based on relationship type
    let origin: { x: number; y: number } | null = null;
    const half = SHAPE_SIZE / 2;

    if (rel.members.length >= 2) {
      // 2-member: midpoint of couple line
      origin = getRelationshipMidpoint(rel);
    } else if (rel.members.length === 1) {
      // 1-member: bottom of single parent
      const parent = individuals.find((i) => i.id === rel.members[0]);
      if (parent && parent.x != null && parent.y != null) {
        origin = { x: parent.x, y: parent.y + half };
      }
    }

    if (!origin) continue;

    // Find child individual → target is top-center
    const child = individuals.find((i) => i.id === egg.individual_id);
    if (!child || child.x == null || child.y == null) continue;
    const childTopX = child.x;
    const childTopY = child.y - half;

    // Draw orthogonal path: vertical → horizontal → vertical
    const midY = (origin.y + childTopY) / 2;
    ctx.beginPath();
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 2;
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(origin.x, midY);
    ctx.lineTo(childTopX, midY);
    ctx.lineTo(childTopX, childTopY);
    ctx.stroke();
  }

  // Draw individual shapes
  for (const ind of individuals) {
    const { x, y, biological_sex } = ind;
    if (x == null || y == null) continue;

    ctx.strokeStyle = selectedIds.has(ind.id) ? "#3b82f6" : "#334155";
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
