/**
 * Corner Mark Detector v2 — EvalBee-style pixel sampling.
 *
 * NO blob detection, NO flood fill, NO contour search.
 * Simply checks if dark pixels exist at expected positions.
 *
 * How it works:
 * 1. Guide frame = A4 paper area on screen
 * 2. Corner marks are at fixed positions (corners of guide frame)
 * 3. At each corner, sample a small region:
 *    - Center region: should be DARK (the mark)
 *    - Surrounding ring: should be LIGHT (paper)
 * 4. If center is significantly darker than surrounding → mark found
 *
 * This is fast (~1ms), reliable, and matches EvalBee's approach.
 */

export interface CornerMark {
  x: number;
  y: number;
  darkness: number;    // 0-255, lower = darker
  contrast: number;    // difference between surround and center (higher = better)
  found: boolean;
}

export interface CornersResult {
  tl: CornerMark;
  tr: CornerMark;
  bl: CornerMark;
  br: CornerMark;
  count: number;
  stable: boolean;
}

/**
 * Sample average brightness of a rectangular region.
 */
function sampleBrightness(
  data: Uint8ClampedArray, imgW: number, imgH: number,
  cx: number, cy: number, halfW: number, halfH: number
): number {
  const x1 = Math.max(0, Math.round(cx - halfW));
  const y1 = Math.max(0, Math.round(cy - halfH));
  const x2 = Math.min(imgW - 1, Math.round(cx + halfW));
  const y2 = Math.min(imgH - 1, Math.round(cy + halfH));

  let sum = 0, count = 0;
  for (let y = y1; y <= y2; y += 2) { // step 2 for speed
    for (let x = x1; x <= x2; x += 2) {
      const i = (y * imgW + x) * 4;
      sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      count++;
    }
  }
  return count > 0 ? sum / count : 255;
}

/**
 * Check if a corner mark exists at the given position.
 *
 * Compares center darkness with surrounding brightness.
 * Corner mark = dark square (~10mm) surrounded by white paper.
 *
 * @param data - RGBA pixel data
 * @param imgW - Image width
 * @param imgH - Image height
 * @param cx - Expected center X of corner mark
 * @param cy - Expected center Y of corner mark
 * @param markSize - Expected mark size in pixels
 */
function checkMarkAt(
  data: Uint8ClampedArray, imgW: number, imgH: number,
  cx: number, cy: number, markSize: number
): CornerMark {
  const halfMark = markSize / 2;

  // Center region — should be DARK (the black mark)
  const centerBright = sampleBrightness(data, imgW, imgH, cx, cy, halfMark * 0.7, halfMark * 0.7);

  // Surrounding ring — should be LIGHT (white paper)
  // Sample 4 points around the mark (paper area)
  const offset = markSize * 1.5;
  const surr1 = sampleBrightness(data, imgW, imgH, cx + offset, cy, halfMark * 0.5, halfMark * 0.5);
  const surr2 = sampleBrightness(data, imgW, imgH, cx - offset, cy, halfMark * 0.5, halfMark * 0.5);
  const surr3 = sampleBrightness(data, imgW, imgH, cx, cy + offset, halfMark * 0.5, halfMark * 0.5);
  const surr4 = sampleBrightness(data, imgW, imgH, cx, cy - offset, halfMark * 0.5, halfMark * 0.5);

  // Use the 2 brightest surrounding samples (avoid sampling off paper)
  const surrVals = [surr1, surr2, surr3, surr4].sort((a, b) => b - a);
  const surroundBright = (surrVals[0] + surrVals[1]) / 2;

  const contrast = surroundBright - centerBright;

  // Mark found if:
  // 1. Center is dark (< 120)
  // 2. Contrast is significant (surround at least 40 brighter than center)
  // 3. OR center is very dark (< 80) and some contrast exists
  const found = (centerBright < 120 && contrast > 40)
             || (centerBright < 80 && contrast > 25);

  return { x: cx, y: cy, darkness: centerBright, contrast, found };
}

/**
 * Fine-tune mark position by scanning a small grid around expected position.
 * Finds the darkest spot within ±offset pixels.
 */
function refineMark(
  data: Uint8ClampedArray, imgW: number, imgH: number,
  cx: number, cy: number, markSize: number, searchRadius: number
): CornerMark {
  let bestMark = checkMarkAt(data, imgW, imgH, cx, cy, markSize);
  let bestDarkness = bestMark.darkness;

  const step = Math.max(2, Math.round(markSize * 0.3));

  for (let dy = -searchRadius; dy <= searchRadius; dy += step) {
    for (let dx = -searchRadius; dx <= searchRadius; dx += step) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= imgW || ny >= imgH) continue;

      const brightness = sampleBrightness(data, imgW, imgH, nx, ny, markSize * 0.35, markSize * 0.35);
      if (brightness < bestDarkness) {
        bestDarkness = brightness;
        const mark = checkMarkAt(data, imgW, imgH, nx, ny, markSize);
        if (mark.found && mark.contrast > bestMark.contrast) {
          bestMark = mark;
        }
      }
    }
  }

  return bestMark;
}

/**
 * Detect 4 corner marks in the guide frame image.
 *
 * @param imageData - ImageData of the GUIDE FRAME area
 * @returns CornersResult
 */
export function detectCorners(imageData: ImageData): CornersResult {
  const { width: w, height: h, data } = imageData;

  // Corner mark = 10mm on A4 (210mm wide) — matches AnswerSheetV2 CM = 10mm
  // In the guide frame image, mark ~= 10/210 * w pixels
  const markSize = Math.max(6, (10 / 210) * w);

  // Mark center = corner_margin (2mm) + CM/2 (5mm) = 7mm from page edge
  // A4: 210mm wide × 297mm tall
  const insetX = (7 / 210) * w;
  const insetY = (7 / 297) * h;

  // Search radius: katta zona — telefon burchagidan olsa ham topishi uchun
  const searchRadius = Math.max(markSize * 2.0, w * 0.08);

  const tl = refineMark(data, w, h, insetX, insetY, markSize, searchRadius);
  const tr = refineMark(data, w, h, w - insetX, insetY, markSize, searchRadius);
  const bl = refineMark(data, w, h, insetX, h - insetY, markSize, searchRadius);
  const br = refineMark(data, w, h, w - insetX, h - insetY, markSize, searchRadius);

  const count = [tl, tr, bl, br].filter(c => c.found).length;

  return {
    tl, tr, bl, br,
    count,
    stable: count === 4,
  };
}

/**
 * Estimate a missing corner from 3 known corners (parallelogram).
 */
export function estimateMissingCorner(corners: CornersResult): CornersResult {
  if (corners.count >= 4 || corners.count < 3) return corners;

  const { tl, tr, bl, br } = corners;
  const result = { ...corners };

  const makeMark = (x: number, y: number): CornerMark => ({
    x, y, darkness: 100, contrast: 30, found: true,
  });

  if (!tl.found && tr.found && bl.found && br.found) {
    result.tl = makeMark(bl.x + tr.x - br.x, bl.y + tr.y - br.y);
  } else if (!tr.found && tl.found && bl.found && br.found) {
    result.tr = makeMark(tl.x + br.x - bl.x, tl.y + br.y - bl.y);
  } else if (!bl.found && tl.found && tr.found && br.found) {
    result.bl = makeMark(tl.x + br.x - tr.x, tl.y + br.y - tr.y);
  } else if (!br.found && tl.found && tr.found && bl.found) {
    result.br = makeMark(tr.x + bl.x - tl.x, tr.y + bl.y - tl.y);
  }

  result.count = [result.tl, result.tr, result.bl, result.br].filter(c => c.found).length;
  result.stable = result.count === 4;
  return result;
}

/**
 * Validate that 4 corners form a reasonable quadrilateral.
 */
export function validateCorners(corners: CornersResult, imgW: number, imgH: number): boolean {
  const { tl, tr, bl, br } = corners;
  if (!tl.found || !tr.found || !bl.found || !br.found) return false;

  // Check ordering
  if (tl.x >= tr.x || bl.x >= br.x) return false;
  if (tl.y >= bl.y || tr.y >= br.y) return false;

  // Check minimum size (at least 30% of image)
  const topW = tr.x - tl.x;
  const botW = br.x - bl.x;
  const leftH = bl.y - tl.y;
  const rightH = br.y - tr.y;

  if (topW < imgW * 0.3 || botW < imgW * 0.3) return false;
  if (leftH < imgH * 0.3 || rightH < imgH * 0.3) return false;

  // Check parallelism
  const wRatio = Math.min(topW, botW) / Math.max(topW, botW);
  const hRatio = Math.min(leftH, rightH) / Math.max(leftH, rightH);
  if (wRatio < 0.6 || hRatio < 0.6) return false;

  return true;
}
