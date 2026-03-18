/**
 * QR Reader — reads QR codes from answer sheets using jsQR.
 *
 * Supports two QR formats:
 * - Old: plain variant code string "94FB3D53"
 * - New: JSON {"c":"94FB3D53","q":90}
 *
 * Tries multiple preprocessing methods for robustness:
 * 1. Original image
 * 2. Inverted
 * 3. High contrast (threshold)
 */

import jsQR from 'jsqr';

export interface QRData {
  variantCode: string;
  totalQuestions: number | null;
  raw: string;
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
 * Read QR code from ImageData. Tries multiple preprocessing methods.
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
 * Try to read QR from a specific region of the image (top-right area where QR is placed).
 * This is faster than scanning the full image.
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
