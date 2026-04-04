/**
 * Fill detection — bubble to'ldirilganlikni aniqlash.
 * Synced with: server/python/omr/fill.py (M-14, M-15, M-16, M-18 FIX)
 *
 * 3 ta yondashuv:
 * 1. Inner sampling (r * 0.78) — bubble chizig'ini o'tkazib yuborish
 * 2. Per-row baseline subtraction — soya/yoritish farqi avtomatik yo'qoladi
 * 3. Adaptive threshold — qora va ko'k qalam ikkalasini ham qo'llab-quvvatlaydi
 */
import type { GridCell } from './gridBuilder';

export interface FillResult {
  letter: string | null;
  status: 'ok' | 'empty' | 'multi';
  confidence: number;
  candidates: string[];
}

// Python fill.py va omr_config.json bilan sinxron
const FILL_INNER_RATIO = 0.78;
const FILL_RATIO_THRESHOLD = 0.30; // omr_config.json: fill_ratio_threshold
// M-14 FIX: 0.50 → 0.30 — past kontrast (ko'k qalam) marklar ham topiladi
const PRIMARY_THRESHOLD = 0.30;

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

/**
 * Bitta savol uchun javobni tanlash.
 * Python fill.py _pick_answer() bilan to'liq sinxron.
 *
 * Algoritm:
 * 1. Per-row baseline subtraction: min fill = "bo'sh bubble darajasi"
 * 2. adjusted fill = fill - baseline
 * 3. Agar max_adjusted < 0.30 → ratio_mode (past kontrast: ko'k qalam, soya)
 * 4. ratio_mode da: max_fill >= 0.30 AND ratio >= 1.5 → haqiqiy belgi
 * 5. Candidate tanlash → multi-select tekshirish (0.75 threshold)
 *
 * Qora qalam:  fill ≈ 0.60–0.90, ajralib turadi, baseline path o'tadi
 * Ko'k qalam:  fill ≈ 0.30–0.50, ratio_mode orqali topiladi
 * Bo'sh:        fill ≈ 0.03–0.10, barcha tekshiruvlardan o'tmaydi
 */
function pickAnswer(qCells: GridCell[]): FillResult {
  const fills = qCells.map(c => c.fill ?? 0);
  const baseline = Math.min(...fills);
  const adjusted = fills.map(f => f - baseline);
  const maxAdj = Math.max(...adjusted);

  const EMPTY: FillResult = { letter: null, status: 'empty', confidence: 0, candidates: [] };

  // Ko'k qalam va soyali rasmlarda adjusted farq kichik bo'ladi.
  // M-14/M-15 FIX: 0.50 → 0.30
  if (maxAdj < PRIMARY_THRESHOLD) {
    const maxFillVal = Math.max(...fills);
    const maxFillIdx = fills.indexOf(maxFillVal);
    const others = fills.filter((_, i) => i !== maxFillIdx);
    const avgOthers = others.length > 0 ? others.reduce((a, b) => a + b, 0) / others.length : 0;

    // M-15 FIX: abs 0.48→0.30, avg_others 0.05→0.03, ratio 1.8→1.5
    // Ko'k qalam: fill ~0.35, others ~0.08, ratio ~4.4 ≥ 1.5 → topiladi
    if (maxFillVal >= FILL_RATIO_THRESHOLD && avgOthers > 0.03 && maxFillVal / avgOthers >= 1.5) {
      // ratio_mode: adjusted thresholdlar pastroq
      const relMinAdj = 0.12;
      const relativeThreshold = Math.max(maxAdj * 0.60, relMinAdj);
      const candidates = qCells.filter((_, i) => adjusted[i] >= relativeThreshold && adjusted[i] >= relMinAdj);
      if (candidates.length === 0) return EMPTY;
      return finalize(candidates, baseline, maxAdj, fills);
    }
    return EMPTY;
  }

  // Normal mode: max_adjusted >= 0.30 — ajralib turuvchi belgi
  // M-18 FIX: ikki marta tekshiruv bitta shartga birlashtirildi
  if (Math.max(...fills) < FILL_RATIO_THRESHOLD) return EMPTY;

  const relMinAdj = 0.18;
  const relativeThreshold = Math.max(maxAdj * 0.60, relMinAdj);

  const candidates = qCells.filter((_, i) => adjusted[i] >= relativeThreshold && adjusted[i] >= relMinAdj);
  if (candidates.length === 0) return EMPTY;

  return finalize(candidates, baseline, maxAdj, fills);
}

/**
 * Candidate ro'yxatidan yakuniy javob tanlash.
 * Python fill.py _finalize() bilan sinxron.
 */
function finalize(candidates: GridCell[], baseline: number, maxAdj: number, allFills: number[]): FillResult {
  if (candidates.length === 1) {
    const letter = candidates[0].letter;
    return {
      letter,
      status: 'ok',
      confidence: calcConfidence(candidates[0].fill ?? 0, allFills),
      candidates: [letter],
    };
  }

  // M-16 FIX: 0.85 → 0.75 — ikkita aniq belgi multi sifatida aniqlanadi
  const sorted = [...candidates].sort((a, b) => (b.fill ?? 0) - (a.fill ?? 0));
  const candAdj = sorted.map(c => (c.fill ?? 0) - baseline);

  if (candAdj.length >= 2 && candAdj[1] >= maxAdj * 0.75) {
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
    confidence: calcConfidence(sorted[0].fill ?? 0, allFills),
    candidates: [letter],
  };
}

function calcConfidence(fill: number, allFills: number[]): number {
  const sorted = [...allFills].sort((a, b) => b - a);
  const best = sorted[0];
  const second = sorted.length > 1 ? sorted[1] : 0;
  return best + second === 0 ? 0 : Math.round((best / (best + second)) * 1000) / 1000;
}
