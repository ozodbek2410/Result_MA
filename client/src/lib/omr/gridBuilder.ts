/**
 * Grid builder — bubble pozitsiyalarini hisoblash + timing mark calibration.
 * Port: server/python/omr/grid.py → TypeScript
 */
import { SHEET, COL_W_MM, computeLayout } from './answerSheetConfig';

export interface GridCell {
  q: number;
  col: number;
  row: number;
  letter: 'A' | 'B' | 'C' | 'D';
  cx: number;
  cy: number;
  r: number;
  fill?: number;
}

const CORNER_CENTER = SHEET.CORNER_MARGIN + SHEET.CORNER_MARK / 2; // 7mm
const SPAN_W = SHEET.PAGE_W - 2 * CORNER_CENTER; // 196mm

/**
 * Layout formulasidan bubble markazlarini hisoblash.
 * warped image = corner marklar arasi (SPAN_W x SPAN_H)
 */
export function buildGrid(warpedWidth: number, totalQuestions: number): GridCell[] {
  const layout = computeLayout(totalQuestions);
  const mmToPx = (mm: number) => mm * warpedWidth / SPAN_W;

  // M-20 FIX: paddingTop(1mm) + col_header(BUBBLE=5mm) + col_header_mb(1.5mm) = 7.5mm
  const GRID_OFFSET_MM = SHEET.BUBBLE + 2.5;
  const gridLeftPx = mmToPx(SHEET.PAGE_PAD - CORNER_CENTER);
  const gridTopPx = mmToPx(SHEET.PAGE_PAD_TOP + SHEET.HEADER_H + GRID_OFFSET_MM - CORNER_CENTER);
  const colWPx = mmToPx(COL_W_MM);
  const colGapPx = mmToPx(layout.colGapMm);
  const rowHPx = mmToPx(layout.rowHMm);
  const bubbleR = mmToPx(SHEET.BUBBLE) / 2;

  const timingPx = mmToPx(SHEET.TIMING_W);
  const numPx = mmToPx(SHEET.NUM_W);
  const bubblePx = mmToPx(SHEET.BUBBLE);
  const bubbleGapPx = mmToPx(SHEET.BUBBLE_GAP);

  const letterOffsets: number[] = [];
  const xStart = timingPx + numPx;
  for (let i = 0; i < 4; i++) {
    letterOffsets.push(xStart + bubblePx / 2 + i * (bubblePx + bubbleGapPx));
  }

  const letters: GridCell['letter'][] = ['A', 'B', 'C', 'D'];
  const cells: GridCell[] = [];

  for (let q = 1; q <= totalQuestions; q++) {
    const colIdx = Math.floor((q - 1) / layout.rowsPerCol);
    const rowIdx = (q - 1) % layout.rowsPerCol;
    const colX = gridLeftPx + colIdx * (colWPx + colGapPx);
    const rowY = gridTopPx + rowIdx * rowHPx + bubbleR;

    for (let li = 0; li < 4; li++) {
      cells.push({
        q, col: colIdx, row: rowIdx,
        letter: letters[li],
        cx: colX + letterOffsets[li],
        cy: rowY,
        r: bubbleR,
      });
    }
  }

  return cells;
}

/**
 * Timing mark calibration — haqiqiy grid pozitsiyani aniqlash.
 * Binary Uint8Array (255=dark, 0=light) dan timing marklarni topadi.
 */
export function calibrateGrid(
  cells: GridCell[],
  binary: Uint8Array,
  width: number,
  height: number
): void {
  if (cells.length === 0) return;

  const layout = computeLayout(Math.max(...cells.map(c => c.q)));
  const { rowsPerCol, nCols } = layout;
  const bubbleR = cells[0].r;

  const colCorrections: Map<number, { top: number; rowH: number }> = new Map();

  for (let colIdx = 0; colIdx < nCols; colIdx++) {
    const colCells = cells.filter(c => c.col === colIdx && c.letter === 'A');
    if (colCells.length === 0) continue;

    const colX = colCells[0].cx;
    const firstY = colCells[0].cy;
    const tmXRight = Math.floor(colX - bubbleR);
    const tmXLeft = Math.max(0, tmXRight - 80);
    const tmY1 = Math.max(0, Math.floor(firstY - bubbleR * 8));
    const tmY2 = Math.min(height, Math.floor(firstY + rowsPerCol * bubbleR * 2.5 * 1.5));

    const marks = findTimingMarks(binary, width, height, tmXLeft, tmXRight, tmY1, tmY2, bubbleR);

    // M-21 FIX: 5 → 3 — kam timing mark bo'lsa ham calibration ishlaydi
    if (marks.length >= 3) {
      const actualTop = marks[0];
      const diffs = marks.slice(1).map((m, i) => m - marks[i]);
      diffs.sort((a, b) => a - b);
      const actualRowH = diffs[Math.floor(diffs.length / 2)]; // median

      colCorrections.set(colIdx, { top: actualTop, rowH: actualRowH });
    }
  }

  if (colCorrections.size === 0) return;

  for (const c of cells) {
    let col = c.col;
    if (!colCorrections.has(col)) {
      // Eng yaqin ustun
      let minDist = Infinity;
      for (const k of colCorrections.keys()) {
        if (Math.abs(k - c.col) < minDist) { minDist = Math.abs(k - c.col); col = k; }
      }
    }
    const corr = colCorrections.get(col)!;
    c.cy = corr.top + c.row * corr.rowH;
  }
}

/**
 * Timing marklarni topish — connected component analysis (pure JS).
 * Binary: 255 = dark, 0 = light.
 */
export function findTimingMarks(
  binary: Uint8Array, imgW: number, imgH: number,
  x1: number, x2: number, y1: number, y2: number,
  bubbleR: number
): number[] {
  // ROI dan dark blobs topish (vertical projection profili)
  const roiW = x2 - x1;
  const roiH = y2 - y1;
  if (roiW <= 0 || roiH <= 0) return [];

  // Har bir Y uchun dark pixel soni
  const rowDarkness: number[] = new Array(roiH).fill(0);
  for (let ry = 0; ry < roiH; ry++) {
    const y = y1 + ry;
    if (y >= imgH) break;
    let count = 0;
    for (let rx = 0; rx < roiW; rx++) {
      const x = x1 + rx;
      if (x >= imgW) break;
      if (binary[y * imgW + x] > 128) count++;
    }
    rowDarkness[ry] = count / roiW;
  }

  // Dark band topish (timing mark = band of high darkness)
  const tmSide = bubbleR * 1.2;
  const minBandH = Math.max(3, Math.floor(tmSide * 0.4));
  const darkThreshold = 0.25;

  const candidates: number[] = [];
  let bandStart = -1;

  for (let ry = 0; ry < roiH; ry++) {
    if (rowDarkness[ry] >= darkThreshold) {
      if (bandStart < 0) bandStart = ry;
    } else {
      if (bandStart >= 0) {
        const bandH = ry - bandStart;
        if (bandH >= minBandH && bandH < tmSide * 4) {
          const centerY = y1 + bandStart + bandH / 2;
          candidates.push(centerY);
        }
        bandStart = -1;
      }
    }
  }
  // Oxirgi band
  if (bandStart >= 0) {
    const bandH = roiH - bandStart;
    if (bandH >= minBandH && bandH < tmSide * 4) {
      candidates.push(y1 + bandStart + bandH / 2);
    }
  }

  if (candidates.length < 3) return [];

  // Gap filter
  const expectedRowH = bubbleR * 2 * 1.3;
  const minGap = expectedRowH * 0.5;

  const filtered: number[] = [candidates[0]];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i] - filtered[filtered.length - 1] >= minGap) {
      filtered.push(candidates[i]);
    }
  }

  // Median gap tozalash
  if (filtered.length >= 5) {
    const gaps = filtered.slice(1).map((m, i) => m - filtered[i]);
    gaps.sort((a, b) => a - b);
    const medGap = gaps[Math.floor(gaps.length / 2)];

    const clean: number[] = [filtered[0]];
    for (let i = 1; i < filtered.length; i++) {
      const gap = filtered[i] - clean[clean.length - 1];
      if (Math.abs(gap - medGap) < medGap * 0.4) {
        clean.push(filtered[i]);
      } else if (Math.abs(gap - 2 * medGap) < medGap * 0.4) {
        clean.push(filtered[i]);
      }
    }
    return clean;
  }

  return filtered;
}
