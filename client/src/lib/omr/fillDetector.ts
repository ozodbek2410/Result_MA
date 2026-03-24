/**
 * Fill detection — bubble to'ldirilganlikni aniqlash.
 * Port: server/python/omr/fill.py → TypeScript
 */
import type { GridCell } from './gridBuilder';

export interface FillResult {
  letter: string | null;
  status: 'ok' | 'empty' | 'multi';
  confidence: number;
  candidates: string[];
}

const FILL_INNER_RATIO = 0.78;
const PRIMARY_THRESHOLD = 0.50;
const RATIO_MIN_FILL = 0.48;
const RATIO_MULTIPLIER = 1.8;
const ABS_MIN = 0.42;

/**
 * Har bir savol uchun javobni aniqlash.
 * binary: Uint8Array (255=dark, 0=light), width x height
 */
export function detectFills(
  cells: GridCell[],
  binary: Uint8Array,
  width: number,
  height: number
): Map<number, FillResult> {
  // 1. Fill ratio hisoblash
  for (const cell of cells) {
    cell.fill = sampleFill(cell, binary, width, height, FILL_INNER_RATIO);
  }

  // 2. Savollar bo'yicha guruhlash
  const questions = new Map<number, GridCell[]>();
  for (const cell of cells) {
    const arr = questions.get(cell.q) || [];
    arr.push(cell);
    questions.set(cell.q, arr);
  }

  // 3. Javob aniqlash
  const results = new Map<number, FillResult>();
  for (const [q, qCells] of questions) {
    results.set(q, pickAnswer(qCells));
  }

  return results;
}

/** Bubble ichidagi dark piksellar nisbati */
export function sampleFill(
  cell: GridCell,
  binary: Uint8Array,
  width: number,
  height: number,
  innerRatio: number
): number {
  const cx = Math.round(cell.cx);
  const cy = Math.round(cell.cy);
  const r = Math.round(cell.r);
  const innerR = Math.max(2, Math.round(r * innerRatio));
  const innerR2 = innerR * innerR;

  let filled = 0;
  let total = 0;

  for (let dy = -innerR; dy <= innerR; dy++) {
    const py = cy + dy;
    if (py < 0 || py >= height) continue;
    for (let dx = -innerR; dx <= innerR; dx++) {
      if (dx * dx + dy * dy > innerR2) continue; // circle mask
      const px = cx + dx;
      if (px < 0 || px >= width) continue;
      total++;
      if (binary[py * width + px] > 128) filled++;
    }
  }

  return total > 0 ? filled / total : 0;
}

/** Bitta savol uchun javob tanlash — adaptive threshold */
function pickAnswer(qCells: GridCell[]): FillResult {
  const fills = qCells.map(c => c.fill ?? 0);
  const baseline = Math.min(...fills);
  const adjusted = fills.map(f => f - baseline);
  const maxAdj = Math.max(...adjusted);

  const EMPTY: FillResult = { letter: null, status: 'empty', confidence: 0, candidates: [] };

  // Ratio fallback
  let ratioMode = false;
  if (maxAdj < PRIMARY_THRESHOLD) {
    const maxFill = Math.max(...fills);
    const maxIdx = fills.indexOf(maxFill);
    const others = fills.filter((_, i) => i !== maxIdx);
    const avgOthers = others.length > 0 ? others.reduce((a, b) => a + b, 0) / others.length : 0;

    if (maxFill >= RATIO_MIN_FILL && avgOthers > 0.05 && maxFill / avgOthers >= RATIO_MULTIPLIER) {
      ratioMode = true;
    } else {
      return EMPTY;
    }
  }

  // Absolute threshold
  const maxFill = Math.max(...fills);
  if (maxFill < ABS_MIN && maxAdj < 0.35) return EMPTY;

  // Candidate topish
  const relMinAdj = ratioMode ? 0.15 : 0.20;
  const relativeThreshold = Math.max(maxAdj * 0.60, relMinAdj);

  const candidates: GridCell[] = [];
  for (let i = 0; i < qCells.length; i++) {
    if (adjusted[i] >= relativeThreshold && adjusted[i] >= relMinAdj) {
      candidates.push(qCells[i]);
    }
  }

  if (candidates.length === 0) return EMPTY;

  if (candidates.length === 1) {
    const letter = candidates[0].letter;
    return {
      letter,
      status: 'ok',
      confidence: calcConfidence(candidates[0].fill ?? 0, fills),
      candidates: [letter],
    };
  }

  // Multi-select tekshirish
  const sorted = [...candidates].sort((a, b) => (b.fill ?? 0) - (a.fill ?? 0));
  const candAdj = sorted.map(c => (c.fill ?? 0) - baseline);

  if (candAdj.length >= 2 && candAdj[1] >= maxAdj * 0.85) {
    return {
      letter: null,
      status: 'multi',
      confidence: 0,
      candidates: sorted.map(c => c.letter),
    };
  }

  const letter = sorted[0].letter;
  return {
    letter,
    status: 'ok',
    confidence: calcConfidence(sorted[0].fill ?? 0, fills),
    candidates: [letter],
  };
}

function calcConfidence(fill: number, allFills: number[]): number {
  const sorted = [...allFills].sort((a, b) => b - a);
  const best = sorted[0];
  const second = sorted.length > 1 ? sorted[1] : 0;
  return best + second === 0 ? 0 : Math.round((best / (best + second)) * 1000) / 1000;
}
