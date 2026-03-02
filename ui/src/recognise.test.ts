import { describe, it, expect } from "vitest";
import { recognise, Point } from "./recognise";

// --- shape generators ---

function generateCircle(cx: number, cy: number, r: number, n: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const angle = (2 * Math.PI * i) / n;
    pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return pts;
}

function generateNoisyCircle(
  cx: number,
  cy: number,
  r: number,
  n: number,
  noise: number,
): Point[] {
  const pts: Point[] = [];
  // Use a seeded-ish approach with deterministic noise
  for (let i = 0; i <= n; i++) {
    const angle = (2 * Math.PI * i) / n;
    const jitter = (((i * 7 + 3) % 11) / 11 - 0.5) * 2 * noise;
    const nr = r + jitter;
    pts.push({ x: cx + nr * Math.cos(angle), y: cy + nr * Math.sin(angle) });
  }
  return pts;
}

function generateSquare(cx: number, cy: number, size: number, n: number): Point[] {
  // Axis-aligned square: corners at (cx±half, cy±half)
  const half = size / 2;
  const corners: Point[] = [
    { x: cx - half, y: cy - half },
    { x: cx + half, y: cy - half },
    { x: cx + half, y: cy + half },
    { x: cx - half, y: cy + half },
    { x: cx - half, y: cy - half }, // close the path
  ];
  return interpolateCorners(corners, n);
}

function generateRotatedSquare(
  cx: number,
  cy: number,
  size: number,
  angleDeg: number,
  n: number,
): Point[] {
  const half = size / 2;
  const rad = (angleDeg * Math.PI) / 180;
  const baseCorners = [
    { x: -half, y: -half },
    { x: half, y: -half },
    { x: half, y: half },
    { x: -half, y: half },
    { x: -half, y: -half },
  ];
  const corners = baseCorners.map((p) => ({
    x: cx + p.x * Math.cos(rad) - p.y * Math.sin(rad),
    y: cy + p.x * Math.sin(rad) + p.y * Math.cos(rad),
  }));
  return interpolateCorners(corners, n);
}

function generateDiamond(cx: number, cy: number, size: number, n: number): Point[] {
  // Diamond = square rotated 45°: corners on axes
  const half = size / 2;
  const corners: Point[] = [
    { x: cx, y: cy - half },     // top
    { x: cx + half, y: cy },     // right
    { x: cx, y: cy + half },     // bottom
    { x: cx - half, y: cy },     // left
    { x: cx, y: cy - half },     // close
  ];
  return interpolateCorners(corners, n);
}

function interpolateCorners(corners: Point[], totalPoints: number): Point[] {
  // Distribute points evenly along the edges
  let totalLen = 0;
  const segLens: number[] = [];
  for (let i = 1; i < corners.length; i++) {
    const dx = corners[i].x - corners[i - 1].x;
    const dy = corners[i].y - corners[i - 1].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    segLens.push(len);
    totalLen += len;
  }

  const pts: Point[] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const segPoints = Math.max(1, Math.round((segLens[i] / totalLen) * totalPoints));
    for (let j = 0; j < segPoints; j++) {
      const t = j / segPoints;
      pts.push({
        x: corners[i].x + (corners[i + 1].x - corners[i].x) * t,
        y: corners[i].y + (corners[i + 1].y - corners[i].y) * t,
      });
    }
  }
  // Close the path
  pts.push({ ...corners[corners.length - 1] });
  return pts;
}

function generateScribble(n: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    // Deterministic pseudo-random using a simple hash
    const x = ((i * 137 + 51) % 300) - 150;
    const y = ((i * 251 + 89) % 300) - 150;
    pts.push({ x, y });
  }
  return pts;
}

// --- tests ---

describe("recognise", () => {
  describe("circle detection", () => {
    it("recognises a perfect circle", () => {
      const pts = generateCircle(100, 100, 50, 80);
      expect(recognise(pts)).toBe("circle");
    });

    it("recognises a noisy hand-drawn circle", () => {
      const pts = generateNoisyCircle(100, 100, 50, 80, 4);
      expect(recognise(pts)).toBe("circle");
    });

    it("recognises a small circle", () => {
      const pts = generateCircle(0, 0, 20, 60);
      expect(recognise(pts)).toBe("circle");
    });
  });

  describe("square detection", () => {
    it("recognises an axis-aligned square", () => {
      const pts = generateSquare(100, 100, 80, 80);
      expect(recognise(pts)).toBe("square");
    });

    it("recognises a slightly rotated square (15°)", () => {
      const pts = generateRotatedSquare(100, 100, 80, 15, 80);
      expect(recognise(pts)).toBe("square");
    });

    it("recognises a slightly rotated square (-10°)", () => {
      const pts = generateRotatedSquare(100, 100, 80, -10, 80);
      expect(recognise(pts)).toBe("square");
    });
  });

  describe("diamond detection", () => {
    it("recognises a diamond", () => {
      const pts = generateDiamond(100, 100, 80, 80);
      expect(recognise(pts)).toBe("diamond");
    });

    it("recognises a larger diamond", () => {
      const pts = generateDiamond(200, 200, 120, 100);
      expect(recognise(pts)).toBe("diamond");
    });
  });

  describe("unrecognised shapes", () => {
    it("returns unrecognised for too few points", () => {
      const pts = [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 0 },
      ];
      expect(recognise(pts)).toBe("unrecognised");
    });

    it("returns unrecognised for an open path", () => {
      // Half circle — not closed
      const pts: Point[] = [];
      for (let i = 0; i <= 40; i++) {
        const angle = (Math.PI * i) / 40; // only 0 to π
        pts.push({ x: 100 + 50 * Math.cos(angle), y: 100 + 50 * Math.sin(angle) });
      }
      expect(recognise(pts)).toBe("unrecognised");
    });

    it("returns unrecognised for a random scribble", () => {
      const pts = generateScribble(60);
      expect(recognise(pts)).toBe("unrecognised");
    });
  });
});
