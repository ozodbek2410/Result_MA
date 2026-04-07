/**
 * Layout Mapper — contour'larni layout cell'larga assignment.
 *
 * Vazifa:
 * ────────
 * `contourDetector.findBubbleContours()` warped binary'da BARCHA bubble shaped
 * pikselni topadi (qaysi savol/harf ekanligini bilmaydi).
 * `gridBuilder.buildGrid()` esa layout formula bilan EXPECTED pozitsiyalarni
 * hisoblaydi (qaysi savol/harf ekanini biladi, lekin haqiqiy joyini emas).
 *
 * Bu fayl ikkalasini birlashtiradi:
 *   "Q5-B harfi qaysi contour ga to'g'ri keladi?"
 *
 * Algoritm:
 * ─────────
 * Greedy nearest-neighbor with first-come-first-serve assignment.
 *
 * Har expected cell uchun:
 * 1. Tolerance radius ichidagi band qilinmagan eng yaqin contour topiladi
 * 2. Topilsa: cell.actualCx/Cy/R = contour markazi (sub-pixel precision)
 * 3. Topilmasa: cell layout pozitsiyasini saqlaydi (degraded fallback)
 *
 * Tolerance: bubbleR × 1.5 (yarmi diameter)
 * Sabab: perspektiv warp xatosi odatda < 1 bubble radius. 1.5R tolerance
 * realistik ravishda ham yetadi, ham false matching dan saqlaydi.
 *
 * Sort tartibi: top→bottom, left→right (stable assignment, deterministic)
 *
 * Hungarian algoritmi qarshi greedy:
 * ────────────────────────────────────
 * Hungarian (linear_sum_assignment) optimal global matching beradi —
 * yig'indi distance minimal. Lekin O(n³) va 360 cell × 360 contour uchun
 * ~47M operatsiya = sekin.
 *
 * Greedy + sort yetarli:
 * - Cell'lar top-down sort qilinsa, har cell uchun ostidagi contour
 *   tolerance ichida bo'ladi (perspektiv juda kam ta'sir qiladi)
 * - 99% holatda greedy = optimal
 * - O(n²) lekin small constant, ~130k operatsiya = ~5ms
 */

import type { GridCell } from './gridBuilder';
import type { BubbleContour } from './contourDetector';

export interface MappedCell extends GridCell {
  /** Contour topilgan haqiqiy markaz X (pixel). matched=false bo'lsa = expected cx */
  actualCx: number;
  /** Contour topilgan haqiqiy markaz Y. matched=false bo'lsa = expected cy */
  actualCy: number;
  /** Contour radiusi. matched=false bo'lsa = expected r */
  actualR: number;
  /** Contour topildimi (true) yoki layout fallback (false) */
  matched: boolean;
  /** Expected position dan distance (pixel). matched=false bo'lsa 0 */
  distance: number;
}

export interface MappingResult {
  cells: MappedCell[];
  matchedCount: number;
  totalCount: number;
  matchRate: number;
  /** Median distance for matched cells — diagnostic uchun */
  medianDistance: number;
}

const TOLERANCE_FACTOR = 1.5;

/**
 * Topilgan contour'larni expected cell'larga assignment qilish.
 *
 * @param expectedCells - gridBuilder.buildGrid() natijasi
 * @param contours - contourDetector.findBubbleContours() natijasi
 * @returns MappingResult — matched cell'lar + statistika
 */
export function mapContoursToCells(
  expectedCells: GridCell[],
  contours: BubbleContour[],
): MappingResult {
  if (expectedCells.length === 0) {
    return { cells: [], matchedCount: 0, totalCount: 0, matchRate: 0, medianDistance: 0 };
  }

  // Original tartibni saqlash uchun index belgilash
  // (assignment top-down qilinadi, lekin qaytarish original q×letter tartibida)
  type Indexed = { idx: number; cell: GridCell };
  const indexed: Indexed[] = expectedCells.map((cell, idx) => ({ idx, cell }));

  // Top → bottom, left → right tartibida sort
  // Bu greedy assignment uchun deterministik tartibni ta'minlaydi —
  // yuqoridagi cell birinchi tanlov olishi mumkin, pastdagi keyin
  indexed.sort((a, b) => {
    const dy = a.cell.cy - b.cell.cy;
    if (Math.abs(dy) > a.cell.r) return dy; // bir xil row da bo'lmasa Y bilan
    return a.cell.cx - b.cell.cx; // bir xil row da X bilan
  });

  const used = new Uint8Array(contours.length);
  const result = new Array<MappedCell>(expectedCells.length);
  const distances: number[] = [];

  for (const { idx, cell } of indexed) {
    const tolerance = cell.r * TOLERANCE_FACTOR;
    const toleranceSq = tolerance * tolerance;
    let bestDistSq = toleranceSq;
    let bestContourIdx = -1;

    for (let i = 0; i < contours.length; i++) {
      if (used[i]) continue;
      const c = contours[i];
      const dx = c.cx - cell.cx;
      const dy = c.cy - cell.cy;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestContourIdx = i;
      }
    }

    if (bestContourIdx >= 0) {
      used[bestContourIdx] = 1;
      const c = contours[bestContourIdx];
      const distance = Math.sqrt(bestDistSq);
      distances.push(distance);
      result[idx] = {
        ...cell,
        actualCx: c.cx,
        actualCy: c.cy,
        actualR: c.r,
        matched: true,
        distance,
      };
    } else {
      // Layout fallback — cell o'z pozitsiyasini saqlaydi
      result[idx] = {
        ...cell,
        actualCx: cell.cx,
        actualCy: cell.cy,
        actualR: cell.r,
        matched: false,
        distance: 0,
      };
    }
  }

  // Median distance hisoblash
  let medianDistance = 0;
  if (distances.length > 0) {
    distances.sort((a, b) => a - b);
    const mid = Math.floor(distances.length / 2);
    medianDistance =
      distances.length % 2 === 0
        ? (distances[mid - 1] + distances[mid]) / 2
        : distances[mid];
  }

  const matchedCount = distances.length;
  const totalCount = expectedCells.length;
  const matchRate = totalCount > 0 ? matchedCount / totalCount : 0;

  return {
    cells: result,
    matchedCount,
    totalCount,
    matchRate,
    medianDistance,
  };
}

/**
 * Mapping sifatini tekshirish — past sifatli mapping bo'lsa scanner ogohlantirishi uchun.
 *
 * Mezonlar:
 * - matchRate ≥ 0.85 (kamida 85% cell topilgan)
 * - medianDistance ≤ bubbleR (median offset bir bubble radiusdan kam)
 *
 * Past matchRate sabablari:
 * - Perspective xato katta → contour'lar expected pozitsiyadan uzoq
 * - Binary threshold xato (CLAHE / Otsu yomon ishlagan)
 * - Sheet sifati past (tutilgan, bukilgan)
 *
 * @returns true — sifat yaxshi, false — sifat past, ogohlantirish kerak
 */
export function isMappingHighQuality(result: MappingResult, expectedRadius: number): boolean {
  if (result.totalCount === 0) return false;
  if (result.matchRate < 0.85) return false;
  if (result.medianDistance > expectedRadius) return false;
  return true;
}
