/**
 * Image processing — grayscale, CLAHE, Otsu threshold.
 * Pure TypeScript, no dependencies. Canvas API only.
 */

/** RGBA ImageData → grayscale Uint8Array */
export function toGrayscale(imageData: ImageData): Uint8Array {
  const { data, width, height } = imageData;
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const j = i * 4;
    gray[i] = Math.round(data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114);
  }
  return gray;
}

/** Otsu's method — optimal binary threshold */
export function otsuThreshold(gray: Uint8Array): { binary: Uint8Array; threshold: number } {
  const len = gray.length;
  // Histogram
  const hist = new Float64Array(256);
  for (let i = 0; i < len; i++) hist[gray[i]]++;

  const total = len;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];

  let sumB = 0, wB = 0;
  let maxVariance = 0, bestT = 0;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const meanB = sumB / wB;
    const meanF = (sumAll - sumB) / wF;
    const variance = wB * wF * (meanB - meanF) * (meanB - meanF);

    if (variance > maxVariance) {
      maxVariance = variance;
      bestT = t;
    }
  }

  // Binary: THRESH_BINARY_INV (dark pixels = 255, light = 0)
  const binary = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    binary[i] = gray[i] <= bestT ? 255 : 0;
  }

  return { binary, threshold: bestT };
}

/** Simplified CLAHE — contrast limited adaptive histogram equalization */
export function applyCLAHE(
  gray: Uint8Array, width: number, height: number,
  clipLimit = 2.0, tileSize = 8
): Uint8Array {
  const tileW = Math.ceil(width / tileSize);
  const tileH = Math.ceil(height / tileSize);
  const result = new Uint8Array(gray.length);

  // Per-tile histogram equalization with clip limit
  const mappings: Uint8Array[][] = [];

  for (let ty = 0; ty < tileSize; ty++) {
    mappings[ty] = [];
    for (let tx = 0; tx < tileSize; tx++) {
      const x0 = tx * tileW, y0 = ty * tileH;
      const x1 = Math.min(x0 + tileW, width);
      const y1 = Math.min(y0 + tileH, height);
      const tilePixels = (x1 - x0) * (y1 - y0);
      if (tilePixels === 0) { mappings[ty][tx] = new Uint8Array(256); continue; }

      // Build histogram
      const hist = new Float64Array(256);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          hist[gray[y * width + x]]++;
        }
      }

      // Clip
      const limit = Math.max(1, clipLimit * tilePixels / 256);
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > limit) { excess += hist[i] - limit; hist[i] = limit; }
      }
      const redistrib = excess / 256;
      for (let i = 0; i < 256; i++) hist[i] += redistrib;

      // CDF → mapping
      const mapping = new Uint8Array(256);
      let cdf = 0;
      const scale = 255.0 / tilePixels;
      for (let i = 0; i < 256; i++) {
        cdf += hist[i];
        mapping[i] = Math.min(255, Math.round(cdf * scale));
      }
      mappings[ty][tx] = mapping;
    }
  }

  // Bilinear interpolation between tiles
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tx = x / tileW - 0.5;
      const ty2 = y / tileH - 0.5;
      const tx0 = Math.max(0, Math.min(tileSize - 1, Math.floor(tx)));
      const ty0 = Math.max(0, Math.min(tileSize - 1, Math.floor(ty2)));
      const tx1 = Math.min(tileSize - 1, tx0 + 1);
      const ty1 = Math.min(tileSize - 1, ty0 + 1);
      const fx = Math.max(0, Math.min(1, tx - tx0));
      const fy = Math.max(0, Math.min(1, ty2 - ty0));

      const val = gray[y * width + x];
      const v00 = mappings[ty0][tx0][val];
      const v10 = mappings[ty0][tx1][val];
      const v01 = mappings[ty1][tx0][val];
      const v11 = mappings[ty1][tx1][val];

      result[y * width + x] = Math.round(
        v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) +
        v01 * (1 - fx) * fy + v11 * fx * fy
      );
    }
  }

  return result;
}
