// Pedigree symbol rendering system
// Converts WPF XAML 48x48 coordinate system to canvas drawing calls.

export interface SymbolSpec {
  sex: string;              // biological_sex from API
  deathStatus: string;      // properties.death_status ?? "alive"
  affectionStatus: string;  // properties.affection_status ?? "unknown"
  fertilityStatus: string;  // properties.fertility_status ?? "unknown"
  proband: number;          // 0-360, 0 means no arrow
  probandText: string;      // label shown near the arrow
}

// --- Helpers ---

/** Scale factor from XAML 48px coord space to real pixel size. */
function s(size: number): number {
  return size / 48;
}

/** Map XAML x to canvas x. */
function tx(cx: number, xamlX: number, scale: number): number {
  return cx + (xamlX - 24) * scale;
}

/** Map XAML y to canvas y. */
function ty(cy: number, xamlY: number, scale: number): number {
  return cy + (xamlY - 24) * scale;
}

// --- Base shape path builders ---
// Each returns a Path2D so we can stroke/fill/clip reusably.

function circlePath(cx: number, cy: number, scale: number, r: number): Path2D {
  const p = new Path2D();
  p.arc(cx, cy, r * scale, 0, Math.PI * 2);
  return p;
}

function squarePath(cx: number, cy: number, scale: number): Path2D {
  const p = new Path2D();
  const x0 = tx(cx, 2, scale);
  const y0 = ty(cy, 2, scale);
  const side = 44 * scale;
  p.rect(x0, y0, side, side);
  return p;
}

function diamondPath(cx: number, cy: number, scale: number): Path2D {
  const p = new Path2D();
  p.moveTo(tx(cx, 24, scale), ty(cy, 2, scale));
  p.lineTo(tx(cx, 46, scale), ty(cy, 24, scale));
  p.lineTo(tx(cx, 24, scale), ty(cy, 46, scale));
  p.lineTo(tx(cx, 2, scale), ty(cy, 24, scale));
  p.closePath();
  return p;
}

function upperTrianglePath(cx: number, cy: number, scale: number): Path2D {
  const p = new Path2D();
  p.moveTo(tx(cx, 24, scale), ty(cy, 2, scale));
  p.lineTo(tx(cx, 46, scale), ty(cy, 24, scale));
  p.lineTo(tx(cx, 2, scale), ty(cy, 24, scale));
  p.closePath();
  return p;
}

function smallDiamond(cx: number, cy: number, scale: number, r: number): Path2D {
  const p = new Path2D();
  p.moveTo(cx, cy - r * scale);
  p.lineTo(cx + r * scale, cy);
  p.lineTo(cx, cy + r * scale);
  p.lineTo(cx - r * scale, cy);
  p.closePath();
  return p;
}

// --- Main draw function ---

export function drawIndividual(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  spec: SymbolSpec,
  selected: boolean,
): void {
  const scale = s(size);
  const strokeColor = selected ? "#3b82f6" : "#334155";
  const fillColor = "#334155";

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = fillColor;
  ctx.setLineDash([]);

  // --- Layer 1: Base shape ---
  let basePath: Path2D;
  let shapeType: "circle" | "square" | "diamond" | "triangle" | "smallcircle" | "none";

  // Check mortality-driven shapes first
  if (spec.deathStatus === "lived_one_day") {
    basePath = circlePath(cx, cy, scale, 12);
    shapeType = "smallcircle";
  } else if (spec.deathStatus === "spontaneous_abortion" || spec.deathStatus === "therapeutic_abortion") {
    basePath = upperTrianglePath(cx, cy, scale);
    shapeType = "triangle";
  } else {
    // From biological sex
    switch (spec.sex) {
      case "female":
        basePath = circlePath(cx, cy, scale, 22);
        shapeType = "circle";
        break;

      case "male":
        basePath = squarePath(cx, cy, scale);
        shapeType = "square";
        break;

      case "unknown":
        basePath = diamondPath(cx, cy, scale);
        shapeType = "diamond";
        break;

      case "ambiguous_female":
        basePath = circlePath(cx, cy, scale, 22);
        shapeType = "circle";
        ctx.setLineDash([5 * scale, 4 * scale]);
        break;

      case "ambiguous_male":
        basePath = squarePath(cx, cy, scale);
        shapeType = "square";
        ctx.setLineDash([5 * scale, 4 * scale]);
        break;

      case "intersex": {
        // Draw both circle and square, dashed
        const circ = circlePath(cx, cy, scale, 22);
        const sq = squarePath(cx, cy, scale);
        ctx.setLineDash([5 * scale, 4 * scale]);
        ctx.stroke(circ);
        ctx.stroke(sq);
        // Use circle as the "base" for affection overlays
        basePath = circ;
        shapeType = "circle";
        // Reset dash for overlays
        ctx.setLineDash([]);
        break;
      }

      case "none": {
        // Triple nested diamonds
        const outer = smallDiamond(cx, cy, scale, 22);
        const mid = smallDiamond(cx, cy, scale, 12);
        const inner = smallDiamond(cx, cy, scale, 8);
        ctx.stroke(outer);
        ctx.stroke(mid);
        ctx.stroke(inner);
        basePath = outer;
        shapeType = "none";
        ctx.restore();
        return; // No overlays for "none" sex
      }

      default:
        // "other" or null → diamond fallback
        basePath = diamondPath(cx, cy, scale);
        shapeType = "diamond";
        break;
    }
  }

  // Stroke the base shape (unless intersex already did)
  if (spec.sex !== "intersex" || spec.deathStatus === "lived_one_day" ||
      spec.deathStatus === "spontaneous_abortion" || spec.deathStatus === "therapeutic_abortion") {
    ctx.stroke(basePath);
  }
  ctx.setLineDash([]);

  // --- Layer 2: Affection overlay ---
  drawAffection(ctx, cx, cy, scale, spec.affectionStatus, basePath, shapeType, fillColor);

  // --- Layer 3: Mortality overlay ---
  drawMortality(ctx, cx, cy, scale, size, spec.deathStatus, strokeColor);

  // --- Layer 4: Fertility indicator ---
  drawFertility(ctx, cx, cy, scale, size, spec.fertilityStatus, strokeColor);

  // --- Layer 5: Proband arrow ---
  if (spec.proband > 0) {
    drawProbandArrow(ctx, cx, cy, size, spec.proband, spec.probandText, strokeColor);
  }

  ctx.restore();
}

// --- Layer 2: Affection ---

function drawAffection(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  status: string,
  basePath: Path2D,
  _shapeType: string,
  fillColor: string,
): void {
  switch (status) {
    case "unknown":
      break;

    case "clear": {
      // Small 8x8 filled square at center
      const half = 4 * scale;
      ctx.fillStyle = fillColor;
      ctx.fillRect(cx - half, cy - half, 8 * scale, 8 * scale);
      break;
    }

    case "affected":
      // Fill base shape solid
      ctx.fillStyle = fillColor;
      ctx.fill(basePath);
      break;

    case "carrier": {
      // Inner circle stroked
      const inner = circlePath(cx, cy, scale, 12);
      ctx.stroke(inner);
      break;
    }

    case "heterozygous": {
      // Clip to right half, fill base shape
      ctx.save();
      const clip = new Path2D();
      clip.rect(cx, cy - 24 * scale, 24 * scale, 48 * scale);
      ctx.clip(clip);
      ctx.fillStyle = fillColor;
      ctx.fill(basePath);
      ctx.restore();
      break;
    }

    case "affected_by_hearsay": {
      // Clip to center vertical strip, fill base shape
      ctx.save();
      const clip = new Path2D();
      const stripW = 8 * scale;
      clip.rect(cx - stripW / 2, cy - 24 * scale, stripW, 48 * scale);
      ctx.clip(clip);
      ctx.fillStyle = fillColor;
      ctx.fill(basePath);
      ctx.restore();
      break;
    }

    case "examined": {
      // Horizontal line above symbol
      ctx.beginPath();
      ctx.moveTo(cx - 12 * scale, cy - 26 * scale);
      ctx.lineTo(cx + 12 * scale, cy - 26 * scale);
      ctx.stroke();
      break;
    }

    case "possible_affection": {
      // "?" text below-right
      ctx.fillStyle = fillColor;
      ctx.font = `bold ${12 * scale}px system-ui`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("?", cx + 18 * scale, cy + 14 * scale);
      break;
    }

    case "presymptomatic": {
      // Vertical line through shape center
      ctx.beginPath();
      ctx.moveTo(cx, cy - 24 * scale);
      ctx.lineTo(cx, cy + 24 * scale);
      ctx.stroke();
      break;
    }

    case "immune": {
      // Inner circle (same as carrier)
      const inner = circlePath(cx, cy, scale, 12);
      ctx.stroke(inner);
      break;
    }

    case "untested": {
      // Small X at bottom-right corner
      const bx = cx + 18 * scale;
      const by = cy + 18 * scale;
      const arm = 4 * scale;
      ctx.beginPath();
      ctx.moveTo(bx - arm, by - arm);
      ctx.lineTo(bx + arm, by + arm);
      ctx.moveTo(bx + arm, by - arm);
      ctx.lineTo(bx - arm, by + arm);
      ctx.stroke();
      break;
    }
  }
}

// --- Layer 3: Mortality ---

function drawMortality(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  size: number,
  status: string,
  strokeColor: string,
): void {
  ctx.strokeStyle = strokeColor;

  switch (status) {
    case "alive":
    case "unknown":
    case "lived_one_day":    // handled in base shape
    case "spontaneous_abortion": // handled in base shape
      break;

    case "dead": {
      // Single diagonal line corner-to-corner
      ctx.beginPath();
      ctx.moveTo(tx(cx, 48, scale), ty(cy, 0, scale));
      ctx.lineTo(tx(cx, 0, scale), ty(cy, 48, scale));
      ctx.stroke();
      break;
    }

    case "suicide_confirmed":
    case "suicide_unconfirmed": {
      // X: two diagonals
      ctx.beginPath();
      ctx.moveTo(tx(cx, 48, scale), ty(cy, 0, scale));
      ctx.lineTo(tx(cx, 0, scale), ty(cy, 48, scale));
      ctx.moveTo(tx(cx, 0, scale), ty(cy, 0, scale));
      ctx.lineTo(tx(cx, 48, scale), ty(cy, 48, scale));
      ctx.stroke();
      break;
    }

    case "neonatal_death": {
      // Text "NND" below shape
      ctx.fillStyle = strokeColor;
      ctx.font = `bold ${10 * scale}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("NND", cx, cy + size / 2 + 4);
      break;
    }

    case "stillborn": {
      // Text "SB" below shape
      ctx.fillStyle = strokeColor;
      ctx.font = `bold ${10 * scale}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("SB", cx, cy + size / 2 + 4);
      break;
    }

    case "pregnancy": {
      // Text "P" centered in shape
      ctx.fillStyle = strokeColor;
      ctx.font = `bold ${14 * scale}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("P", cx, cy);
      break;
    }

    case "therapeutic_abortion": {
      // Base triangle handled in layer 1, add diagonal
      ctx.beginPath();
      ctx.moveTo(tx(cx, 44, scale), ty(cy, 0, scale));
      ctx.lineTo(tx(cx, 6, scale), ty(cy, 36, scale));
      ctx.stroke();
      break;
    }
  }
}

// --- Layer 4: Fertility ---

function drawFertility(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  size: number,
  status: string,
  strokeColor: string,
): void {
  ctx.strokeStyle = strokeColor;

  const stemTop = cy + size / 2;
  const stemBottom = stemTop + 10 * scale;
  const barHalf = 6 * scale;

  switch (status) {
    case "unknown":
    case "fertile":
      break;

    case "infertile": {
      // Stem + double horizontal crossbar
      ctx.beginPath();
      ctx.moveTo(cx, stemTop);
      ctx.lineTo(cx, stemBottom);
      ctx.stroke();
      // First crossbar
      const bar1Y = stemTop + 4 * scale;
      ctx.beginPath();
      ctx.moveTo(cx - barHalf, bar1Y);
      ctx.lineTo(cx + barHalf, bar1Y);
      ctx.stroke();
      // Second crossbar
      const bar2Y = bar1Y + 4 * scale;
      ctx.beginPath();
      ctx.moveTo(cx - barHalf, bar2Y);
      ctx.lineTo(cx + barHalf, bar2Y);
      ctx.stroke();
      break;
    }

    case "infertile_by_choice": {
      // Stem + single horizontal crossbar
      ctx.beginPath();
      ctx.moveTo(cx, stemTop);
      ctx.lineTo(cx, stemBottom);
      ctx.stroke();
      const barY = stemTop + 5 * scale;
      ctx.beginPath();
      ctx.moveTo(cx - barHalf, barY);
      ctx.lineTo(cx + barHalf, barY);
      ctx.stroke();
      break;
    }

    case "other": {
      // Small "+" mark below
      const plusCx = cx;
      const plusCy = stemTop + 6 * scale;
      const arm = 3 * scale;
      ctx.beginPath();
      ctx.moveTo(plusCx - arm, plusCy);
      ctx.lineTo(plusCx + arm, plusCy);
      ctx.moveTo(plusCx, plusCy - arm);
      ctx.lineTo(plusCx, plusCy + arm);
      ctx.stroke();
      break;
    }
  }
}

// --- Layer 5: Proband arrow ---

function drawProbandArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  angleDeg: number,
  label: string,
  strokeColor: string,
): void {
  // Convert degrees to radians. 0° = up (12 o'clock), clockwise.
  // Canvas angles: 0 = right. So rotate: canvasAngle = (angleDeg - 90) in degrees.
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;

  const gap = size / 2 + 8;          // gap between shape edge and arrow tip
  const arrowLen = 22;                // length of the arrow shaft
  const headLen = 8;                  // arrowhead arm length
  const headAngle = Math.PI / 6;     // 30° spread

  // Tip of arrow points toward the individual (closer to shape)
  const tipX = cx + Math.cos(angleRad) * gap;
  const tipY = cy + Math.sin(angleRad) * gap;
  // Tail extends outward from the shape
  const tailX = cx + Math.cos(angleRad) * (gap + arrowLen);
  const tailY = cy + Math.sin(angleRad) * (gap + arrowLen);

  // Draw shaft
  ctx.beginPath();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // Arrowhead: two lines from tip spreading back toward tail
  // angleRad points outward (center → tip → tail), so arms fan from angleRad
  ctx.beginPath();
  ctx.moveTo(
    tipX + Math.cos(angleRad - headAngle) * headLen,
    tipY + Math.sin(angleRad - headAngle) * headLen,
  );
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(
    tipX + Math.cos(angleRad + headAngle) * headLen,
    tipY + Math.sin(angleRad + headAngle) * headLen,
  );
  ctx.stroke();

  // Draw label near the tail of the arrow
  if (label) {
    ctx.fillStyle = strokeColor;
    ctx.font = "bold 10px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const labelDist = gap + arrowLen + 10;
    const labelX = cx + Math.cos(angleRad) * labelDist;
    const labelY = cy + Math.sin(angleRad) * labelDist;
    ctx.fillText(label, labelX, labelY);
  }
}
