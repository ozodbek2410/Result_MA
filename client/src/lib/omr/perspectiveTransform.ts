/**
 * Perspective Transform — 4-point homography warp in pure TypeScript.
 *
 * Takes 4 source corner points (detected from camera frame) and
 * warps the image to a corrected rectangle matching A4 proportions.
 *
 * Uses DLT (Direct Linear Transform) to compute the 3×3 homography matrix,
 * then applies inverse mapping with bilinear interpolation.
 */

import type { CornerMark } from './cornerDetector';

export interface WarpResult {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

// --- 3x3 matrix inversion ---
function invert3x3(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-10) return null;
  const invDet = 1 / det;
  return [
    (e * i - f * h) * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet,
    (f * g - d * i) * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet,
    (d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet,
  ];
}

/**
 * Compute 3×3 homography matrix from 4 point correspondences.
 * Maps source points to destination points.
 *
 * Uses DLT: Ax = 0, where A is 8×9, solve via SVD approximation.
 * Simplified: solve 8×8 system directly (last element = 1).
 */
function computeHomography(
  src: [number, number][],
  dst: [number, number][]
): number[] {
  // Build 8x8 system: Ah = b
  // For each point pair (sx,sy) → (dx,dy):
  //   dx = (h0*sx + h1*sy + h2) / (h6*sx + h7*sy + 1)
  //   dy = (h3*sx + h4*sy + h5) / (h6*sx + h7*sy + 1)
  // Rearranged:
  //   h0*sx + h1*sy + h2 - h6*sx*dx - h7*sy*dx = dx
  //   h3*sx + h4*sy + h5 - h6*sx*dy - h7*sy*dy = dy

  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const [sx, sy] = src[i];
    const [dx, dy] = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
    b.push(dy);
  }

  // Solve 8×8 system via Gaussian elimination
  const n = 8;
  const aug: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Pivot
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-12) continue;
    for (let j = col; j <= n; j++) aug[col][j] /= pivot;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = col; j <= n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }

  const h = aug.map(row => row[n]);
  // h = [h0..h7], h8 = 1
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/**
 * Warp source image using 4 corner points to a corrected rectangle.
 *
 * Output dimensions: ~1000px width, height = A4 ratio (285/198).
 * Matches Python omr_hybrid.py: SPAN_W_MM=198, SPAN_H_MM=285.
 *
 * @param sourceCanvas - Canvas with the source image (camera frame crop)
 * @param corners - 4 detected corner marks
 * @param outputWidth - Output width in pixels (default 1000)
 */
export function warpPerspective(
  sourceCanvas: HTMLCanvasElement,
  corners: { tl: CornerMark; tr: CornerMark; bl: CornerMark; br: CornerMark },
  outputWidth = 1000
): WarpResult {
  const { tl, tr, bl, br } = corners;
  const SPAN_W_MM = 198.0;
  const SPAN_H_MM = 285.0;
  const outputHeight = Math.round(outputWidth * (SPAN_H_MM / SPAN_W_MM));

  // Source points (detected corners)
  const src: [number, number][] = [
    [tl.x, tl.y],
    [tr.x, tr.y],
    [bl.x, bl.y],
    [br.x, br.y],
  ];

  // Destination points (corrected rectangle)
  const dst: [number, number][] = [
    [0, 0],
    [outputWidth - 1, 0],
    [0, outputHeight - 1],
    [outputWidth - 1, outputHeight - 1],
  ];

  // Compute INVERSE homography (dst → src) for inverse mapping
  const H_inv = computeHomography(dst, src);

  // Get source pixel data
  const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true })!;
  const srcData = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const srcPixels = srcData.data;
  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;

  // Create output canvas
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outputWidth;
  outCanvas.height = outputHeight;
  const outCtx = outCanvas.getContext('2d')!;
  const outData = outCtx.createImageData(outputWidth, outputHeight);
  const outPixels = outData.data;

  // Inverse mapping with bilinear interpolation
  for (let dy = 0; dy < outputHeight; dy++) {
    for (let dx = 0; dx < outputWidth; dx++) {
      // Map destination pixel to source using inverse homography
      const w = H_inv[6] * dx + H_inv[7] * dy + H_inv[8];
      if (Math.abs(w) < 1e-10) continue;
      const sx = (H_inv[0] * dx + H_inv[1] * dy + H_inv[2]) / w;
      const sy = (H_inv[3] * dx + H_inv[4] * dy + H_inv[5]) / w;

      // Bilinear interpolation
      if (sx < 0 || sx >= srcW - 1 || sy < 0 || sy >= srcH - 1) continue;

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;

      const i00 = (y0 * srcW + x0) * 4;
      const i10 = i00 + 4;
      const i01 = ((y0 + 1) * srcW + x0) * 4;
      const i11 = i01 + 4;

      const outIdx = (dy * outputWidth + dx) * 4;
      for (let c = 0; c < 3; c++) {
        outPixels[outIdx + c] = Math.round(
          srcPixels[i00 + c] * (1 - fx) * (1 - fy) +
          srcPixels[i10 + c] * fx * (1 - fy) +
          srcPixels[i01 + c] * (1 - fx) * fy +
          srcPixels[i11 + c] * fx * fy
        );
      }
      outPixels[outIdx + 3] = 255; // alpha
    }
  }

  outCtx.putImageData(outData, 0, 0);

  return { canvas: outCanvas, width: outputWidth, height: outputHeight };
}

/**
 * Quick perspective transform using Canvas 2D transforms (faster but less accurate).
 * Falls back to this if warpPerspective is too slow on mobile.
 */
export function warpPerspectiveQuick(
  sourceCanvas: HTMLCanvasElement,
  corners: { tl: CornerMark; tr: CornerMark; bl: CornerMark; br: CornerMark },
  outputWidth = 1000
): WarpResult {
  const SPAN_H_MM = 285.0;
  const SPAN_W_MM = 198.0;
  const outputHeight = Math.round(outputWidth * (SPAN_H_MM / SPAN_W_MM));

  const { tl, tr, bl, br } = corners;

  // Use triangulation: split quad into 2 triangles and draw each
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outputWidth;
  outCanvas.height = outputHeight;
  const ctx = outCanvas.getContext('2d')!;

  // Simple approach: drawImage with crop from the bounding box of corners
  // then scale to output — less accurate but very fast
  const minX = Math.min(tl.x, bl.x);
  const minY = Math.min(tl.y, tr.y);
  const maxX = Math.max(tr.x, br.x);
  const maxY = Math.max(bl.y, br.y);

  ctx.drawImage(
    sourceCanvas,
    minX, minY, maxX - minX, maxY - minY,
    0, 0, outputWidth, outputHeight
  );

  return { canvas: outCanvas, width: outputWidth, height: outputHeight };
}
