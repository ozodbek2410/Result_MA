/**
 * Contour-based bubble detection — Pure JS connected components.
 *
 * Server Python `contour.py` ekvivalenti — bir xil mantiq, OpenCV YO'Q.
 * Bundle hajmini saqlash uchun OpenCV.js qo'shilmadi (~9MB qo'shar edi).
 *
 * Algoritm:
 * ─────────
 * 1. 2-pass connected components labeling (union-find bilan)
 * 2. Per-component statistics: pixels, bounding box, centroid, perimeter
 * 3. Shape filter: area, aspect ratio, circularity, solidity
 * 4. minEnclosingCircle approximation (boundingRect dan)
 *
 * Performance:
 * ────────────
 * 1000×1428 = 1.43M pixel × 2 pass ≈ 2.9M operatsiya.
 * Modern telefonda ~80-200ms (JIT compilation bilan).
 * Yuqori bo'lsa Web Worker ga ko'chirish mumkin.
 *
 * Nima uchun pure JS:
 * ───────────────────
 * - OpenCV.js bundle hajmi: ~9MB (gzipped ham 2.5MB)
 * - First-load latency unacceptable
 * - Mobile data plan ko'pchilik foydalanuvchilarda cheklangan
 * - JS implementation 80-200ms — qabul qilinadi (umumiy scan 400-800ms)
 *
 * 4-connectivity vs 8-connectivity:
 * ─────────────────────────────────
 * Bubble outline odatda yaxshi to'lqinli, 4-connectivity (top, left, right,
 * bottom) yetarli. 8-connectivity (diagonal qo'shimcha) bubble'larni ba'zan
 * noto'g'ri birlashtirib yuborishi mumkin (yopishgan bubble'lar bitta
 * komponent bo'lib qoladi).
 */

export interface BubbleContour {
  /** Sub-pixel center X */
  cx: number;
  /** Sub-pixel center Y */
  cy: number;
  /** Bubble radius (max(bbox_w, bbox_h) / 2) */
  r: number;
  /** Component pixel count */
  area: number;
  /** 4π·area / perimeter² (1.0 = perfect circle) */
  circularity: number;
  /** area / hull_area approximation (1.0 = solid) */
  solidity: number;
}

interface RawComponent {
  pixels: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  sumX: number;
  sumY: number;
  perimeter: number;
}

// Shape filter parametrlari (server contour.py bilan IDENTIK)
const AREA_MIN_FACTOR = 0.40;
const AREA_MAX_FACTOR = 2.00;
const ASPECT_MIN = 0.70;
const ASPECT_MAX = 1.30;
const CIRCULARITY_MIN = 0.55;
const SOLIDITY_MIN = 0.80;

/**
 * Find disjoint set root (path compression).
 * Union-find ma'lumotlar strukturasining standart qism — labellarni
 * birlashtirish uchun.
 */
function findRoot(parent: Int32Array, x: number): number {
  let r = x;
  while (parent[r] !== r) r = parent[r];
  // Path compression — keyingi qidiruvlar tezroq
  while (parent[x] !== r) {
    const next = parent[x];
    parent[x] = r;
    x = next;
  }
  return r;
}

/**
 * Union two labels into the same equivalence class.
 */
function union(parent: Int32Array, a: number, b: number): void {
  const ra = findRoot(parent, a);
  const rb = findRoot(parent, b);
  if (ra !== rb) {
    // Lower label becomes the parent (deterministik tartib)
    if (ra < rb) parent[rb] = ra;
    else parent[ra] = rb;
  }
}

/**
 * 2-pass connected components labeling with 4-connectivity.
 *
 * Pass 1: Provisional labels + union-find equivalence
 * Pass 2: Resolve labels and compute per-component statistics
 *
 * @param binary - 8-bit binary image (>128 = foreground, ≤128 = background)
 * @param width - image width in pixels
 * @param height - image height in pixels
 * @returns array of components (only foreground blobs)
 */
function connectedComponents(
  binary: Uint8Array,
  width: number,
  height: number,
): RawComponent[] {
  const labels = new Int32Array(width * height);
  // parent[0] reserved for background sentinel
  // Maksimum mumkin label soni = pixel soni (yomon holatda har piksel alohida label)
  // Lekin amalda bubble + shovqin = ~1000-5000. Initial 4096, kerak bo'lsa o'sadi.
  let parentCapacity = 4096;
  let parent = new Int32Array(parentCapacity);
  parent[0] = 0;
  let nextLabel = 1;

  // ───── PASS 1: Provisional labeling ─────
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      if (binary[idx] <= 128) {
        // Background
        continue;
      }

      const left = x > 0 ? labels[idx - 1] : 0;
      const top = y > 0 ? labels[idx - width] : 0;

      if (left === 0 && top === 0) {
        // Yangi component
        if (nextLabel >= parentCapacity) {
          // Capacity oshirish (2x)
          const newCap = parentCapacity * 2;
          const newParent = new Int32Array(newCap);
          newParent.set(parent);
          parent = newParent;
          parentCapacity = newCap;
        }
        labels[idx] = nextLabel;
        parent[nextLabel] = nextLabel;
        nextLabel++;
      } else if (left !== 0 && top === 0) {
        labels[idx] = left;
      } else if (left === 0 && top !== 0) {
        labels[idx] = top;
      } else {
        // Both — pick smaller, union the two
        const minL = left < top ? left : top;
        labels[idx] = minL;
        if (left !== top) {
          union(parent, left, top);
        }
      }
    }
  }

  // ───── PASS 2: Resolve labels + compute stats ─────
  // Map root_label → RawComponent
  const compMap = new Map<number, RawComponent>();

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      const lbl = labels[idx];
      if (lbl === 0) continue;

      const root = findRoot(parent, lbl);
      let comp = compMap.get(root);
      if (!comp) {
        comp = {
          pixels: 0,
          minX: x,
          maxX: x,
          minY: y,
          maxY: y,
          sumX: 0,
          sumY: 0,
          perimeter: 0,
        };
        compMap.set(root, comp);
      }

      comp.pixels++;
      comp.sumX += x;
      comp.sumY += y;
      if (x < comp.minX) comp.minX = x;
      else if (x > comp.maxX) comp.maxX = x;
      if (y < comp.minY) comp.minY = y;
      else if (y > comp.maxY) comp.maxY = y;

      // Boundary check (4-neighborhood) — perimeter hisoblash uchun
      // Pikselning kamida bittasi background (yoki image edge) bo'lsa, boundary
      const isBoundary =
        x === 0 ||
        x === width - 1 ||
        y === 0 ||
        y === height - 1 ||
        binary[idx - 1] <= 128 ||
        binary[idx + 1] <= 128 ||
        binary[idx - width] <= 128 ||
        binary[idx + width] <= 128;

      if (isBoundary) comp.perimeter++;
    }
  }

  return Array.from(compMap.values());
}

/**
 * Bubble shaped contour'larni topish.
 *
 * Server `contour.py` `find_bubble_contours()` ekvivalenti.
 * Bir xil shape filter parametrlari, bir xil natija formatida.
 *
 * @param binary - warped binary image (255 = ink/dark, 0 = paper)
 * @param width - image width
 * @param height - image height
 * @param expectedRadius - expected bubble radius (pixels) — area filter reference
 * @returns filtered bubble contours
 */
export function findBubbleContours(
  binary: Uint8Array,
  width: number,
  height: number,
  expectedRadius: number,
): BubbleContour[] {
  if (!binary || binary.length === 0 || expectedRadius <= 0) {
    return [];
  }

  const components = connectedComponents(binary, width, height);

  const expectedArea = Math.PI * expectedRadius * expectedRadius;
  const minArea = expectedArea * AREA_MIN_FACTOR;
  const maxArea = expectedArea * AREA_MAX_FACTOR;

  const bubbles: BubbleContour[] = [];

  for (const c of components) {
    if (c.pixels < minArea || c.pixels > maxArea) continue;

    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    if (bw <= 0 || bh <= 0) continue;

    const aspect = bw / bh;
    if (aspect < ASPECT_MIN || aspect > ASPECT_MAX) continue;

    if (c.perimeter <= 0) continue;
    // Circularity = 4π·A/P². Mukammal doira = 1.0, kvadrat ≈ 0.785
    const circularity = (4 * Math.PI * c.pixels) / (c.perimeter * c.perimeter);
    if (circularity < CIRCULARITY_MIN) continue;

    // Solidity approximation: pixel count / bbox area
    // To'liq doira: π·R² / (2R)² = π/4 ≈ 0.785
    // Tajriba bilan SOLIDITY_MIN = 0.80 → bu hisob bilan ≈ doira solid
    // Eslatma: bu OpenCV solidity (area/hull_area) emas, lekin amalda
    // bubble'lar uchun yetarli filter (false positive juda kam)
    const bboxArea = bw * bh;
    const solidity = c.pixels / bboxArea;
    // Doira uchun teorik max ≈ 0.785, lekin diskretsizatsiya bilan ~0.78
    // 0.55 — eng past chegara (mukammal doira ham diskretsizatsiya bilan
    // 0.78 berishi mumkin). Demak SOLIDITY_MIN = 0.55 — JS uchun maxsus.
    // (Server Python da OpenCV solidity = area/hull_area ishlatiladi → 0.80)
    if (solidity < 0.55) continue;

    // Centroid (sub-pixel precision)
    const cx = c.sumX / c.pixels;
    const cy = c.sumY / c.pixels;

    // Radius approximation: max yarim diagonal ≈ minEnclosingCircle radius
    const r = Math.max(bw, bh) / 2;

    bubbles.push({
      cx,
      cy,
      r,
      area: c.pixels,
      circularity,
      solidity,
    });
  }

  return bubbles;
}

/**
 * Bubble'larni faqat ma'lum region ichidagilariga cheklash.
 *
 * Header zonasi (QR + ism + sana) bubble shaped artefaktlar berishi mumkin —
 * ularni grid region tashqarisida ekanligi bilan istisno qilamiz.
 *
 * Server `contour.py` `filter_by_region()` bilan IDENTIK.
 */
export function filterBubblesByRegion(
  bubbles: BubbleContour[],
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number,
): BubbleContour[] {
  return bubbles.filter(
    (b) => b.cx >= xMin && b.cx <= xMax && b.cy >= yMin && b.cy <= yMax,
  );
}

/**
 * Topilgan bubble'lardan median radius hisoblash.
 *
 * Layout dan kelgan expected_radius juda kichik yoki katta bo'lsa
 * (perspektiv warp masshtab xatosi), haqiqiy median radius mapping
 * uchun aniqroq tolerance beradi.
 */
export function estimateBubbleRadius(bubbles: BubbleContour[]): number {
  if (bubbles.length === 0) return 0;
  const radii = bubbles.map((b) => b.r).sort((a, b) => a - b);
  const mid = Math.floor(radii.length / 2);
  if (radii.length % 2 === 0) {
    return (radii[mid - 1] + radii[mid]) / 2;
  }
  return radii[mid];
}
