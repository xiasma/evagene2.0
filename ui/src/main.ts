import "./style.css";
import { recognise, centroid, Point, Shape } from "./recognise";
import { drawIndividual, SymbolSpec } from "./symbols";
import { initPanel, openPanel, closePanel } from "./panel";

// --- Types ---

interface PlacedIndividual {
  id: string;
  x: number;
  y: number;
  biological_sex: string | null;
  properties: Record<string, unknown>;
  proband: number;
  proband_text: string;
}

interface PlacedRelationship {
  id: string;
  members: string[];
}

interface PlacedEgg {
  id: string;
  individual_id: string | null;
  relationship_id: string | null;
  properties: Record<string, unknown>;
}

// --- DOM ---

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <h1>Evagene</h1>
  <p>Pedigree management for clinical and research geneticists.</p>
  <canvas id="canvas"></canvas>
  <div id="sidebar" class="sidebar hidden"></div>
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

// Single-select state (for properties panel)
let selectedIndividualId: string | null = null;
let pointerMoved = false;
let clickHitId: string | null = null;

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
  pointerMoved = false;
  clickHitId = null;

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
    dragging = true;
    groupDragOffsets = new Map();
    groupDragOffsets.set(hit.id, { dx: hit.x - pos.x, dy: hit.y - pos.y });
    render();
  } else {
    // Hit nothing → clear all selection, close panel, enter draw mode
    selectedIds = new Set();
    selectedIndividualId = null;
    closePanel();
    render();
    beginStroke(pos);
  }
});

canvas.addEventListener("pointermove", (e) => {
  pointerMoved = true;

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
  // Single-click (no drag) on an individual → open properties panel
  if (clickHitId && !pointerMoved) {
    selectedIndividualId = clickHitId;
    selectedIds = new Set();
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
        // Check if endpoint hits top of another individual → sibling/twin
        const topTarget = hitTop(endpoint);
        console.log("[TWIN] child source, endpoint:", endpoint, "topTarget:", topTarget?.id ?? "none");
        if (topTarget && topTarget.id !== source.indId) {
          const isChevron = detectChevron(points);
          console.log("[TWIN] isChevron:", isChevron, "indA:", source.indId, "indB:", topTarget.id);
          render();
          handleSiblingConnection(source.indId, topTarget.id, isChevron);
        } else {
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
        selectedIndividualId = null;
        closePanel();
        render();
        return;
      }
    }
  }

  // Check for monozygotic bar: short, roughly horizontal stroke crossing twin chevron arms
  if (points.length >= 2 && tryMarkMonozygotic(points)) {
    render();
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

// --- Sibling / twin connection ---

/** Detect if a stroke forms a chevron (V/inverted-V) shape. */
function detectChevron(pts: Point[]): boolean {
  if (pts.length < 5) return false;

  // Find the highest point (lowest y) that isn't the start or end
  const startY = pts[0].y;
  const endY = pts[pts.length - 1].y;
  let peakIdx = -1;
  let peakY = Infinity;
  // Skip first/last 10% of points to avoid endpoints
  const margin = Math.max(1, Math.floor(pts.length * 0.1));
  for (let i = margin; i < pts.length - margin; i++) {
    if (pts[i].y < peakY) {
      peakY = pts[i].y;
      peakIdx = i;
    }
  }
  if (peakIdx < 0) return false;

  // The peak must be significantly above both endpoints
  const threshold = 10;
  const result = (startY - peakY) > threshold && (endY - peakY) > threshold;
  console.log("[CHEVRON] pts:", pts.length, "startY:", startY.toFixed(1), "endY:", endY.toFixed(1),
    "peakY:", peakY.toFixed(1), "peakIdx:", peakIdx,
    "dStart:", (startY - peakY).toFixed(1), "dEnd:", (endY - peakY).toFixed(1),
    "threshold:", threshold, "→", result);
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

    if (twin) {
      // Twin: make both individuals twins under a shared parent relationship
      const targetRel = relA ?? relB;
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
      // Distinct siblings: new pregnancy + new egg for second child
      if (relA) {
        if (hasEggUnder(indBId, relA.id)) {
          render();
          return;
        }
        await api(`/api/relationships/${relA.id}/offspring`, {
          method: "POST",
          body: JSON.stringify({
            individual_id: indBId,
            pedigree_id: pedigreeId,
          }),
        });
      } else if (relB) {
        if (hasEggUnder(indAId, relB.id)) {
          render();
          return;
        }
        await api(`/api/relationships/${relB.id}/offspring`, {
          method: "POST",
          body: JSON.stringify({
            individual_id: indAId,
            pedigree_id: pedigreeId,
          }),
        });
      } else {
        // Neither has parents — can't make siblings without a parent
        rejectStroke(points);
        return;
      }
    }

    await refreshState();
    render();
  } catch (err) {
    console.error("Failed to create sibling connection:", err);
    showToast("error" as Shape);
  }
}

// --- Monozygotic detection ---

function tryMarkMonozygotic(pts: Point[]): boolean {
  // Stroke must be roughly horizontal and short
  const first = pts[0];
  const last = pts[pts.length - 1];
  const dx = Math.abs(last.x - first.x);
  const dy = Math.abs(last.y - first.y);
  if (dx < 15 || dy > dx * 0.7) return false; // not horizontal enough

  // Average Y of the stroke
  const avgY = (first.y + last.y) / 2;
  const minX = Math.min(first.x, last.x);
  const maxX = Math.max(first.x, last.x);

  const half = SHAPE_SIZE / 2;

  // Check each twin group for intersection
  const eggsByRel = new Map<string, PlacedEgg[]>();
  for (const egg of eggs) {
    if (!egg.relationship_id || !egg.individual_id || !egg.properties?.twin) continue;
    const key = egg.relationship_id;
    if (!eggsByRel.has(key)) eggsByRel.set(key, []);
    eggsByRel.get(key)!.push(egg);
  }

  for (const [relId, twinEggs] of eggsByRel) {
    if (twinEggs.length < 2) continue;
    if (twinEggs.some((e) => e.properties?.monozygotic)) continue; // already monozygotic

    const rel = relationships.find((r) => r.id === relId);
    if (!rel) continue;

    let origin: { x: number; y: number } | null = null;
    if (rel.members.length >= 2) {
      origin = getRelationshipMidpoint(rel);
    } else if (rel.members.length === 1) {
      const parent = individuals.find((i) => i.id === rel.members[0]);
      if (parent && parent.x != null && parent.y != null) {
        origin = { x: parent.x, y: parent.y + half };
      }
    }
    if (!origin) continue;

    const twinChildren = twinEggs
      .map((e) => ({
        egg: e,
        ind: individuals.find((i) => i.id === e.individual_id),
      }))
      .filter((t) => t.ind && t.ind.x != null && t.ind.y != null);

    if (twinChildren.length < 2) continue;

    const avgApexX = twinChildren.reduce((s, c) => s + c.ind!.x, 0) / twinChildren.length;
    const minTopY = Math.min(...twinChildren.map((c) => c.ind!.y - half));
    const apexY = (origin.y + minTopY) / 2;

    // Check if the stroke Y is between apex and children
    if (avgY < apexY || avgY > minTopY) continue;

    // Check if the stroke X range intersects both chevron arms
    let armsCrossed = 0;
    for (const tc of twinChildren) {
      const childTopY = tc.ind!.y - half;
      const frac = (avgY - apexY) / (childTopY - apexY);
      const armX = avgApexX + (tc.ind!.x - avgApexX) * frac;
      if (armX >= minX - 5 && armX <= maxX + 5) armsCrossed++;
    }

    if (armsCrossed >= 2) {
      // Mark all twin eggs as monozygotic
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
    // Check if twin individuals have different sexes
    const twinInds = twinEggs
      .map((e) => individuals.find((i) => i.id === e.individual_id))
      .filter((i): i is PlacedIndividual => i != null);

    const sexes = new Set(twinInds.map((i) => i.biological_sex ?? "unknown"));

    if (sexes.size > 1) {
      // Sex conflict — ask the user
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
        // Update both individuals to the chosen sex
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

    // Mark all twin eggs as monozygotic
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
  // Group eggs by relationship_id to detect twins
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
    }
    if (!origin) continue;

    // Separate twin eggs from regular eggs
    const twinEggs = relEggs.filter((e) => e.properties?.twin);
    const regularEggs = relEggs.filter((e) => !e.properties?.twin);

    // Draw regular eggs as orthogonal stepped paths
    for (const egg of regularEggs) {
      const child = individuals.find((i) => i.id === egg.individual_id);
      if (!child || child.x == null || child.y == null) continue;
      const childTopX = child.x;
      const childTopY = child.y - half;
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

    // Draw twin eggs as chevron from shared apex
    if (twinEggs.length >= 2) {
      // Resolve twin children positions
      const twinChildren = twinEggs
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
        // Apex: midpoint X of twins, Y between origin and highest child top
        const avgX = twinChildren.reduce((s, c) => s + c.x, 0) / twinChildren.length;
        const minTopY = Math.min(...twinChildren.map((c) => c.topY));
        const apexY = (origin.y + minTopY) / 2;

        // Draw vertical stem from origin to apex
        ctx.beginPath();
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 2;
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(origin.x, apexY);
        // Horizontal to apex center if needed
        if (Math.abs(origin.x - avgX) > 1) {
          ctx.lineTo(avgX, apexY);
        }
        ctx.stroke();

        // Draw diagonal lines from apex to each twin child
        const isMonozygotic = twinEggs.some((e) => e.properties?.monozygotic);

        for (const tc of twinChildren) {
          ctx.beginPath();
          ctx.moveTo(avgX, apexY);
          ctx.lineTo(tc.x, tc.topY);
          ctx.stroke();
        }

        // Monozygotic: draw horizontal bar across the chevron arms
        if (isMonozygotic && twinChildren.length === 2) {
          const barY = (apexY + Math.min(twinChildren[0].topY, twinChildren[1].topY)) / 2;
          // Find X positions where bar intersects the diagonal arms
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
    } else if (twinEggs.length === 1) {
      // Single twin egg (partner may have been deleted) — draw as regular
      const egg = twinEggs[0];
      const child = individuals.find((i) => i.id === egg.individual_id);
      if (child && child.x != null && child.y != null) {
        const childTopX = child.x;
        const childTopY = child.y - half;
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
    drawIndividual(ctx, x, y, SHAPE_SIZE, spec, isSelected);
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
