/**
 * Client-side OMR Scanner — to'liq on-device processing.
 *
 * Pipeline (gibrid contour + layout):
 *   warp → grayscale → CLAHE → Otsu → QR
 *   → buildGrid (expected pozitsiyalar)
 *   → calibrateGrid (timing mark refinement)
 *   → findBubbleContours (haqiqiy bubble pozitsiyalari)
 *   → mapContoursToCells (assignment)
 *   → detectFillsFromMapped (haqiqiy pozitsiyalarda fill)
 *   → results
 *
 * Server ga faqat NATIJA yuboriladi (rasm emas).
 *
 * Performance: ~400-800ms per sheet (contour detection ~80-200ms qo'shadi).
 * EvalBee darajasiga yetadi.
 */
import type { CornerMark } from './cornerDetector';
import type { QRData } from './qrReader';
import { warpPerspective } from './perspectiveTransform';
import { readQR, readQRFromRegion } from './qrReader';
import { toGrayscale, applyCLAHE, otsuThreshold } from './imageProcessing';
import { buildGrid, calibrateGrid } from './gridBuilder';
import { detectFills, detectFillsFromMapped, type FillResult } from './fillDetector';
import { findBubbleContours, estimateBubbleRadius } from './contourDetector';
import { mapContoursToCells, isMappingHighQuality } from './layoutMapper';

export interface ClientScanResult {
  success: boolean;
  qrCode: {
    found: boolean;
    variantCode: string | null;
    totalQuestions: number | null;
  };
  detectedAnswers: Record<string, string>;
  stats: {
    answered: number;
    empty: number;
    multiSelect: number;
    total: number;
    detectionRate: number;
    processingTimeMs: number;
  };
  warnings: string[];
  error?: string;
}

const WARP_WIDTH = 1000;

/**
 * To'liq on-device skanerlash.
 *
 * @param sourceCanvas — kamera frame (full resolution)
 * @param corners — client topgan 4 corner mark
 * @param clientQr — client topgan QR data (optional, tezroq)
 */
export function scanOnDevice(
  sourceCanvas: HTMLCanvasElement,
  corners: { tl: CornerMark; tr: CornerMark; bl: CornerMark; br: CornerMark },
  clientQr?: QRData | null
): ClientScanResult {
  const startTime = performance.now();
  const warnings: string[] = [];

  const result: ClientScanResult = {
    success: false,
    qrCode: { found: false, variantCode: null, totalQuestions: null },
    detectedAnswers: {},
    stats: { answered: 0, empty: 0, multiSelect: 0, total: 0, detectionRate: 0, processingTimeMs: 0 },
    warnings,
  };

  try {
    // 1. Perspective warp
    const warped = warpPerspective(sourceCanvas, corners, WARP_WIDTH);
    const warpedW = warped.width;
    const warpedH = warped.height;

    // 2. Warped rasm pixel data
    const wCtx = warped.canvas.getContext('2d', { willReadFrequently: true })!;
    const warpedImageData = wCtx.getImageData(0, 0, warpedW, warpedH);

    // 3. Grayscale
    const gray = toGrayscale(warpedImageData);

    // 4. QR o'qish (warped rasmda — perspective tuzatilgan = aniq QR)
    let qrData = clientQr || null;
    if (!qrData) {
      try {
        // readQRFromRegion canvas oladi, readQR imageData oladi
        qrData = readQRFromRegion(warped.canvas) || readQR(warpedImageData);
      } catch {
        // QR o'qish xatosi — davom etamiz
      }
    }

    let totalQ: number | null = null;
    if (qrData) {
      result.qrCode = {
        found: true,
        variantCode: qrData.variantCode,
        totalQuestions: qrData.totalQuestions,
      };
      totalQ = qrData.totalQuestions;
    }

    // 5. Total questions aniqlash
    if (!totalQ) {
      // Fallback: 90 (eng keng tarqalgan)
      totalQ = 90;
      warnings.push('QR topilmadi — 90 savol deb taxmin qilindi');
    }

    // 6. CLAHE + Otsu threshold (adaptive — har rasm o'ziga moslanadi)
    const enhanced = applyCLAHE(gray, warpedW, warpedH, 2.0, 8);
    const { binary } = otsuThreshold(enhanced);

    // 7. Grid qurish — EXPECTED bubble pozitsiyalari (matematik formula)
    const expectedCells = buildGrid(warpedW, totalQ);

    // 8. Timing mark calibration — perspektiv kichik xatolarini tuzatish
    calibrateGrid(expectedCells, binary, warpedW, warpedH);

    // 9. CONTOUR DETECTION — bubble'larning HAQIQIY pozitsiyalari
    // Bu EvalBee yondashuvi: rasmda bubble qayerda bo'lsa, shu yerda topiladi
    const expectedR = expectedCells[0]?.r ?? 12;
    const allContours = findBubbleContours(binary, warpedW, warpedH, expectedR);

    // 10. LAYOUT MAPPING — har contour ni Q-N-LETTER ga biriktirish
    // Greedy nearest-neighbor + tolerance (bubbleR × 1.5)
    const mapping = mapContoursToCells(expectedCells, allContours);

    // Mapping sifati past bo'lsa ogohlantirish (lekin scan davom etadi)
    if (!isMappingHighQuality(mapping, expectedR)) {
      warnings.push(
        `Past mapping sifati: ${mapping.matchedCount}/${mapping.totalCount} cell topildi ` +
        `(median offset: ${mapping.medianDistance.toFixed(1)}px)`
      );
    }

    // 11. FILL DETECTION — haqiqiy contour pozitsiyalarida
    // Layout fall qilgan cell'lar uchun degraded fallback (layout pozitsiya ishlatiladi)
    const fills = detectFillsFromMapped(mapping.cells, binary, warpedW, warpedH);

    // 10. Natija format
    const detectedAnswers: Record<string, string> = {};
    let answered = 0, empty = 0, multiSel = 0;

    for (let q = 1; q <= totalQ; q++) {
      const f = fills.get(q);
      if (!f) { empty++; continue; }

      if (f.letter) {
        detectedAnswers[String(q)] = f.letter;
        answered++;
      } else if (f.status === 'multi' && f.candidates.length > 0) {
        detectedAnswers[String(q)] = f.candidates.join(',');
        multiSel++;
        answered++;
      } else {
        empty++;
      }
    }

    if (!qrData) {
      warnings.push('QR topilmadi — variant kodi aniqlanmadi');
    }

    const elapsed = Math.round(performance.now() - startTime);

    result.success = true;
    result.detectedAnswers = detectedAnswers;
    result.stats = {
      answered,
      empty,
      multiSelect: multiSel,
      total: totalQ,
      detectionRate: Math.round((answered / totalQ) * 1000) / 10,
      processingTimeMs: elapsed,
    };

  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  result.warnings = warnings;
  result.stats.processingTimeMs = Math.round(performance.now() - startTime);
  return result;
}
