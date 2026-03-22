/**
 * OMR config wrapper — server/python/omr/omr_config.json ga mos keladi.
 * React va PDF generator shu fayldan o'qiydi.
 */

export const OMR_VERSION = 2;

// Sheet o'lchamlari (mm)
export const SHEET = {
  PAGE_W: 210,
  PAGE_H: 297,
  CORNER_MARK: 10,
  CORNER_MARGIN: 2,
  PAGE_PAD: 12,
  BUBBLE: 6,
  BUBBLE_GAP: 2,
  NUM_W: 7,
  TIMING_W: 4,
  HEADER_H: 55,
  QR_SIZE: 25,
} as const;

// Bir ustun kengligi: timing(4) + num(7) + A(6)+gap(2)+B(6)+gap(2)+C(6)+gap(2)+D(6) = 41mm
export const COL_W_MM = SHEET.TIMING_W + SHEET.NUM_W + 4 * SHEET.BUBBLE + 3 * SHEET.BUBBLE_GAP;

export const LAYOUT = {
  MAX_ROWS_PER_COL: 30,
  MIN_COLS: 2,
  MAX_COLS: 4,
  ROW_MARGIN_NORMAL: 1.0,
  ROW_MARGIN_DENSE: 0.3,
} as const;

export interface SheetLayout {
  nCols: number;
  rowsPerCol: number;
  rowMarginMm: number;
  rowHMm: number;
  colGapMm: number;
}

export function computeLayout(totalQ: number): SheetLayout {
  const nCols = Math.max(LAYOUT.MIN_COLS, Math.min(LAYOUT.MAX_COLS,
    Math.ceil(totalQ / LAYOUT.MAX_ROWS_PER_COL)));
  const rowsPerCol = Math.ceil(totalQ / nCols);
  const rowMarginMm = rowsPerCol > 28 ? LAYOUT.ROW_MARGIN_DENSE : LAYOUT.ROW_MARGIN_NORMAL;
  const rowHMm = SHEET.BUBBLE + 2 * rowMarginMm;

  const usable = SHEET.PAGE_W - 2 * SHEET.PAGE_PAD;
  const colGapMm = nCols > 1
    ? Math.min(15, (usable - nCols * COL_W_MM) / (nCols - 1))
    : 0;

  return { nCols, rowsPerCol, rowMarginMm, rowHMm, colGapMm };
}

/** QR payload v2 formati */
export function makeQrPayload(variantCode: string, totalQ: number, testType: 'test' | 'block_test'): string {
  return JSON.stringify({ v: OMR_VERSION, c: variantCode, q: totalQ, t: testType });
}
