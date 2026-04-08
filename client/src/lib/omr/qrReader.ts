/**
 * QR Reader — reads QR codes from answer sheets.
 *
 * ASOSIY STRATEGIYA: BarcodeDetector API (native OS QR detector)
 * ──────────────────────────────────────────────────────────────
 * Zamonaviy browser'larda (Chrome, Edge, Samsung Internet, Safari 16.4+)
 * `BarcodeDetector` API mavjud — Android'da Google ML Kit, iOS'da VisionKit
 * ishlatadi. Bu aynan Samsung kamera ilovasi va iPhone kamera ishlatadigan
 * texnologiya. `jsQR` dan 10x kuchliroq: xira, qiya, kichik QR'larni ham
 * muvaffaqiyat bilan o'qiydi.
 *
 * FALLBACK: jsQR (pure JS, har qanday browserda)
 * ───────────────────────────────────────────────
 * Agar BarcodeDetector mavjud emas (eski browser yoki iOS 16 dan oldin)
 * yoki native detector topa olmasa — jsQR bilan 3 marta preprocessing:
 * 1. Original rasm
 * 2. Threshold 128 (yuqori kontrast)
 * 3. Threshold 100 (past kontrast — soyali rasmlar)
 *
 * Qo'llab-quvvatlash tekshirish faqat bitta marta qilinadi (memoized).
 *
 * Supports two QR formats:
 * - Old: plain variant code string "94FB3D53"
 * - New: JSON {"c":"94FB3D53","q":90}
 */

import jsQR from 'jsqr';

export interface QRData {
  variantCode: string;
  totalQuestions: number | null;
  raw: string;
}

// ───────────────────────────────────────────────────
// BarcodeDetector API — native OS QR detection
// ───────────────────────────────────────────────────

interface BarcodeDetectorResult {
  rawValue: string;
  format: string;
}

interface BarcodeDetectorInterface {
  detect(source: ImageBitmapSource): Promise<BarcodeDetectorResult[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorInterface;
  getSupportedFormats?(): Promise<string[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

let _nativeDetector: BarcodeDetectorInterface | null = null;
let _nativeDetectorChecked = false;

/**
 * Singleton BarcodeDetector — bir marta yaratiladi va qayta ishlatiladi.
 * Qo'llab-quvvatlanmasa null qaytaradi (jsQR fallback ishlatiladi).
 */
function getNativeDetector(): BarcodeDetectorInterface | null {
  if (_nativeDetectorChecked) return _nativeDetector;
  _nativeDetectorChecked = true;

  if (typeof window === 'undefined' || !window.BarcodeDetector) {
    return null;
  }

  try {
    _nativeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
  } catch {
    _nativeDetector = null;
  }
  return _nativeDetector;
}

/**
 * Parse raw QR string into structured data.
 */
function parseQrString(raw: string): QRData | null {
  if (!raw || raw.length < 4) return null;

  const trimmed = raw.trim();

  // Try JSON format: {"c":"CODE","q":90}
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.c) {
        return {
          variantCode: String(parsed.c),
          totalQuestions: typeof parsed.q === 'number' ? parsed.q : null,
          raw: trimmed,
        };
      }
    } catch {
      // not JSON, try as plain string
    }
  }

  // Plain variant code: "94FB3D53"
  if (/^[A-Za-z0-9]{6,12}$/.test(trimmed)) {
    return {
      variantCode: trimmed,
      totalQuestions: null,
      raw: trimmed,
    };
  }

  // Try extracting from parenthetical format: "CODE (q=90)"
  const match = trimmed.match(/^([A-Za-z0-9]{6,12})\s*\(q=(\d+)\)$/);
  if (match) {
    return {
      variantCode: match[1],
      totalQuestions: parseInt(match[2], 10),
      raw: trimmed,
    };
  }

  return null;
}

/**
 * Apply simple threshold to ImageData for better QR detection.
 */
function thresholdImage(data: Uint8ClampedArray, w: number, h: number, thresh: number): Uint8ClampedArray {
  const result = new Uint8ClampedArray(data.length);
  for (let i = 0; i < w * h; i++) {
    const off = i * 4;
    const gray = (data[off] * 77 + data[off + 1] * 150 + data[off + 2] * 29) >> 8;
    const val = gray < thresh ? 0 : 255;
    result[off] = val;
    result[off + 1] = val;
    result[off + 2] = val;
    result[off + 3] = 255;
  }
  return result;
}

/**
 * Invert ImageData colors.
 */
function invertImage(data: Uint8ClampedArray): Uint8ClampedArray {
  const result = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    result[i] = 255 - data[i];
    result[i + 1] = 255 - data[i + 1];
    result[i + 2] = 255 - data[i + 2];
    result[i + 3] = 255;
  }
  return result;
}

/**
 * Read QR code from ImageData using jsQR with multi-pass preprocessing.
 *
 * Bu sync funksiya — BarcodeDetector async, shu sababli faqat jsQR ishlatadi.
 * Native detector uchun `readQRAsync()` ni ishlating (tezroq + aniqroq).
 *
 * @param imageData - Canvas ImageData (full frame or cropped to QR region)
 * @returns QRData or null if no QR found
 */
export function readQR(imageData: ImageData): QRData | null {
  const { data, width, height } = imageData;

  // Attempt 1: Original image
  const qr1 = jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
  if (qr1?.data) {
    const parsed = parseQrString(qr1.data);
    if (parsed) return parsed;
  }

  // Attempt 2: Thresholded (high contrast)
  const threshed = thresholdImage(data, width, height, 128);
  const qr2 = jsQR(threshed, width, height, { inversionAttempts: 'attemptBoth' });
  if (qr2?.data) {
    const parsed = parseQrString(qr2.data);
    if (parsed) return parsed;
  }

  // Attempt 3: Lower threshold
  const threshed2 = thresholdImage(data, width, height, 100);
  const qr3 = jsQR(threshed2, width, height, { inversionAttempts: 'attemptBoth' });
  if (qr3?.data) {
    const parsed = parseQrString(qr3.data);
    if (parsed) return parsed;
  }

  return null;
}

/**
 * Read QR code asynchronously — native BarcodeDetector birinchi, jsQR fallback.
 *
 * Bu eng kuchli usul: zamonaviy browser'larda native OS QR detector ishlatadi
 * (Samsung kamera ilovasi va iPhone kamera bilan bir xil aniqlik). Topilmasa
 * jsQR + 3 preprocessing variantiga o'tadi.
 *
 * Qo'llab-quvvatlash:
 * - Chrome/Edge desktop, Android: Google ML Kit (eng kuchli)
 * - Samsung Internet: ML Kit
 * - Safari iOS 16.4+: VisionKit
 * - Firefox: jsQR fallback (BarcodeDetector yo'q)
 *
 * Native detector ishlatilganda:
 * - Aniqlik: ~95-99% (xira, qiya, kichik QR'larni ham o'qiydi)
 * - Tezlik: ~10-30ms (jsQR ~50-150ms)
 *
 * @param canvas - Canvas with image (full frame)
 * @param hintRegion - Optional cropped region for faster scan (top-right)
 * @returns Promise<QRData | null>
 */
export async function readQRAsync(
  canvas: HTMLCanvasElement,
  hintRegion?: { x: number; y: number; w: number; h: number },
): Promise<QRData | null> {
  // ─── 1. Native BarcodeDetector (eng kuchli) ───
  const detector = getNativeDetector();
  if (detector) {
    try {
      // Native detector to'liq canvas'da ishlaydi (ImageBitmap support)
      // Hint region berilsa — faqat shu zona crop qilinadi (tezroq)
      let source: ImageBitmapSource = canvas;
      if (hintRegion) {
        // Crop region uchun o'tkinchi canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = hintRegion.w;
        tempCanvas.height = hintRegion.h;
        const tctx = tempCanvas.getContext('2d');
        if (tctx) {
          tctx.drawImage(
            canvas,
            hintRegion.x, hintRegion.y, hintRegion.w, hintRegion.h,
            0, 0, hintRegion.w, hintRegion.h,
          );
          source = tempCanvas;
        }
      }

      const barcodes = await detector.detect(source);
      for (const b of barcodes) {
        if (b.format === 'qr_code' && b.rawValue) {
          const parsed = parseQrString(b.rawValue);
          if (parsed) return parsed;
        }
      }

      // Hint region da topilmasa — to'liq frame'da urinish
      if (hintRegion && source !== canvas) {
        const fullBarcodes = await detector.detect(canvas);
        for (const b of fullBarcodes) {
          if (b.format === 'qr_code' && b.rawValue) {
            const parsed = parseQrString(b.rawValue);
            if (parsed) return parsed;
          }
        }
      }
    } catch {
      // Native detector xatoga uchradi — jsQR ga o'tamiz
    }
  }

  // ─── 2. jsQR fallback (har qanday browserda) ───
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Hint region birinchi (tezroq)
  if (hintRegion) {
    const regionData = ctx.getImageData(hintRegion.x, hintRegion.y, hintRegion.w, hintRegion.h);
    const result = readQR(regionData);
    if (result) return result;
  }

  // To'liq frame fallback
  const fullData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return readQR(fullData);
}

/**
 * Try to read QR from a specific region of the image (top-right area where QR is placed).
 * This is faster than scanning the full image.
 *
 * Sync versiya — faqat jsQR ishlatadi. Yangi kod uchun `readQRAsync()` ni
 * ishlating (native detector + 10x kuchliroq).
 *
 * QR code is at top-right of the answer sheet:
 * - Approximately at x: 70-95%, y: 5-25% of the warped image
 */
export function readQRFromRegion(
  canvas: HTMLCanvasElement,
  ctx?: CanvasRenderingContext2D
): QRData | null {
  const c = ctx || canvas.getContext('2d', { willReadFrequently: true })!;
  const w = canvas.width;
  const h = canvas.height;

  // Region where QR should be (top-right)
  const qrX = Math.floor(w * 0.65);
  const qrY = Math.floor(h * 0.02);
  const qrW = Math.floor(w * 0.33);
  const qrH = Math.floor(h * 0.20);

  const regionData = c.getImageData(qrX, qrY, qrW, qrH);
  const result = readQR(regionData);
  if (result) return result;

  // Fallback: scan full image
  const fullData = c.getImageData(0, 0, w, h);
  return readQR(fullData);
}

/**
 * Async version of readQRFromRegion — native detector + jsQR fallback.
 * Xuddi readQRFromRegion kabi top-right zonadan boshlanadi.
 */
export async function readQRFromRegionAsync(canvas: HTMLCanvasElement): Promise<QRData | null> {
  const w = canvas.width;
  const h = canvas.height;

  return readQRAsync(canvas, {
    x: Math.floor(w * 0.65),
    y: Math.floor(h * 0.02),
    w: Math.floor(w * 0.33),
    h: Math.floor(h * 0.20),
  });
}
