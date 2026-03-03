export type Point = { x: number; y: number };
export type Shape = "circle" | "square" | "diamond" | "unrecognised";

const RESAMPLE_N = 64;
const MIN_POINTS = 10;
const CLOSURE_THRESHOLD = 0.5; // max first-last distance as fraction of bounding size
const CIRCULARITY_CV_THRESHOLD = 0.30; // coefficient of variation threshold for circle
const CORNER_ANGLE_THRESHOLD = Math.PI / 2.5; // minimum turning angle to count as corner
const CORNER_WINDOW = 5; // window size for turning angle computation

export function recognise(points: Point[]): Shape {
  if (points.length < MIN_POINTS) return "unrecognised";

  const boundingSize = getBoundingSize(points);
  if (boundingSize < 1) return "unrecognised";
  if (!isClosed(points, boundingSize)) return "unrecognised";

  // Path efficiency: a real shape traces once around its perimeter.
  // Reject paths that are excessively long (scribbles, zig-zags).
  const pLen = pathLength(points);
  if (pLen > 6 * boundingSize) return "unrecognised";

  // Auto-close: append the first point so the resampled path forms a loop
  const closed = [...points, { ...points[0] }];
  const resampled = resample(closed, RESAMPLE_N);
  const center = centroid(resampled);

  // Detect corners first — if we find ~4, it's a quadrilateral
  const corners = findCorners(resampled, CORNER_ANGLE_THRESHOLD);
  if (corners.length >= 3 && corners.length <= 6) {
    const cornerAngles = corners.map((i) => angleToCentroid(resampled[i], center));
    return classifyOrientation(cornerAngles);
  }

  // No clear corners — check circularity
  if (isCircle(resampled, center)) return "circle";

  return "unrecognised";
}

// --- helpers ---

export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function pathLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += distance(points[i - 1], points[i]);
  }
  return len;
}

export function centroid(points: Point[]): Point {
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

export function resample(points: Point[], n: number): Point[] {
  const total = pathLength(points);
  if (total === 0) return points.slice(0, n);

  const interval = total / (n - 1);
  const result: Point[] = [{ ...points[0] }];
  let carry = 0;

  for (let i = 1; i < points.length && result.length < n; i++) {
    const d = distance(points[i - 1], points[i]);
    if (d === 0) continue;

    let remaining = d;

    // Account for leftover distance from previous segment
    if (carry > 0) {
      if (carry <= remaining) {
        const t = carry / d;
        const newPt = lerp(points[i - 1], points[i], t);
        result.push(newPt);
        remaining -= carry;
        carry = 0;
      } else {
        carry -= remaining;
        continue;
      }
    }

    while (remaining >= interval && result.length < n) {
      const t = 1 - (remaining - interval) / d;
      const newPt = lerp(points[i - 1], points[i], t);
      result.push(newPt);
      remaining -= interval;
    }

    carry = interval - remaining;
  }

  // Pad to exactly n if rounding errors left us short
  while (result.length < n) {
    result.push({ ...points[points.length - 1] });
  }

  return result;
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function getBoundingSize(points: Point[]): number {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return Math.max(maxX - minX, maxY - minY);
}

function isClosed(points: Point[], boundingSize: number): boolean {
  const gap = distance(points[0], points[points.length - 1]);
  return gap / boundingSize < CLOSURE_THRESHOLD;
}

function isCircle(points: Point[], center: Point): boolean {
  const distances = points.map((p) => distance(p, center));
  const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
  if (mean === 0) return false;
  const variance =
    distances.reduce((acc, d) => acc + (d - mean) ** 2, 0) / distances.length;
  const cv = Math.sqrt(variance) / mean;
  return cv < CIRCULARITY_CV_THRESHOLD;
}

export function findCorners(
  points: Point[],
  threshold: number,
): number[] {
  const n = points.length;
  const angles: number[] = [];

  for (let i = 0; i < n; i++) {
    const prev = points[(i - CORNER_WINDOW + n) % n];
    const curr = points[i];
    const next = points[(i + CORNER_WINDOW) % n];

    const v1x = prev.x - curr.x;
    const v1y = prev.y - curr.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;

    const dot = v1x * v2x + v1y * v2y;
    const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);

    if (mag1 === 0 || mag2 === 0) {
      angles.push(Math.PI);
      continue;
    }

    const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    angles.push(Math.acos(cosAngle));
  }

  // Find local minima in the angle array (sharp turns = small angles)
  const candidates: { index: number; angle: number }[] = [];
  const minAngle = Math.PI - threshold;

  for (let i = 0; i < n; i++) {
    if (angles[i] > minAngle) continue;

    const prev = angles[(i - 1 + n) % n];
    const next = angles[(i + 1) % n];
    if (angles[i] <= prev && angles[i] <= next) {
      candidates.push({ index: i, angle: angles[i] });
    }
  }

  // Sort by sharpest angle first
  candidates.sort((a, b) => a.angle - b.angle);

  // Suppress nearby corners (non-maximum suppression)
  const suppressionDist = n / 8;
  const selected: number[] = [];

  for (const c of candidates) {
    const tooClose = selected.some((s) => {
      const diff = Math.abs(c.index - s);
      return Math.min(diff, n - diff) < suppressionDist;
    });
    if (!tooClose) {
      selected.push(c.index);
    }
  }

  return selected.sort((a, b) => a - b);
}

export function angleToCentroid(corner: Point, center: Point): number {
  return Math.atan2(corner.y - center.y, corner.x - center.x);
}

export function classifyOrientation(cornerAngles: number[]): Shape {
  // Diamond corners align at 0°, 90°, 180°, 270° (i.e. 0, π/2, π, 3π/2)
  // Square corners align at 45°, 135°, 225°, 315° (i.e. π/4, 3π/4, 5π/4, 7π/4)

  const diamondAxes = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  const squareAxes = [Math.PI / 4, (3 * Math.PI) / 4, -(3 * Math.PI) / 4, -Math.PI / 4];

  const diamondScore = fitScore(cornerAngles, diamondAxes);
  const squareScore = fitScore(cornerAngles, squareAxes);

  const best = Math.min(diamondScore, squareScore);
  // Average angular deviation per corner must be under ~35° to count
  if (best / cornerAngles.length > Math.PI / 5) return "unrecognised";

  // Bias away from diamond: diamond must win by a margin
  return diamondScore * 1.15 < squareScore ? "diamond" : "square";
}

function fitScore(measured: number[], targets: number[]): number {
  // For each measured angle, find the nearest target and sum the angular distances
  let total = 0;
  for (const angle of measured) {
    let best = Infinity;
    for (const target of targets) {
      const diff = angleDiff(angle, target);
      if (diff < best) best = diff;
    }
    total += best;
  }
  return total;
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}
