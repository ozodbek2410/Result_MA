"""
Burchak markerlarni aniqlash va perspektiv tuzatish.

EvalBee-level robustness:
- 3-bosqichli pipeline: multi-threshold → 3-corner estimation → geometric fallback
- GaussianBlur + Canny edge detection
- Resolution-adaptive marker sizing
- Solidity + fill ratio filtrlari
- Deduplication across thresholds
"""
import cv2
import numpy as np
from utils import (multi_threshold, canny_binary, gaussian_blur,
                   sort_corners, estimate_missing_corner, validate_rectangle,
                   deduplicate_candidates)
from config import SCANNER, SPAN_W, SPAN_H, mm_to_px


def find_corners(gray: np.ndarray) -> tuple[np.ndarray | None, bool]:
    """
    4 ta burchak markerni topish — 4-bosqichli EvalBee-level pipeline.

    Returns:
        (np.ndarray shape (4,2), is_doc_boundary: bool)
        is_doc_boundary=True: hujjat chegarasi topildi (varaq cheti, corner mark emas)
          → scanner PAGE_W/PAGE_H ishlatadi, SPAN_W/SPAN_H emas
        (None, False) — topilmadi
    """
    h, w = gray.shape

    # Resolution-adaptive sizing (omr_hybrid.py dan)
    mm_px = w / 210.0
    expected_mark = 10.0 * mm_px  # 10mm corner mark
    min_side = max(4, int(expected_mark * 0.3))
    max_side = int(expected_mark * 3.0)
    min_area = min_side ** 2
    max_area = max_side ** 2

    solidity_min = SCANNER.get("corner_solidity_min", 0.6)
    fill_min = SCANNER.get("corner_fill_min", 0.4)
    zone_pct = SCANNER.get("corner_zone_pct", 0.30)

    # ──── STAGE 1: Multi-threshold + deduplication ────
    all_candidates = []

    for binary in multi_threshold(gray):
        _extract_candidates(binary, w, h, min_area, max_area,
                            solidity_min, fill_min, all_candidates)

    # Deduplication
    candidates = deduplicate_candidates(all_candidates, min_dist=expected_mark * 0.8)

    # ──── STAGE 2: Quadrant grouping + missing corner estimation ────
    result = _select_from_quadrants(candidates, w, h, zone_pct)
    if result is not None and validate_rectangle(result, w, h):
        return sort_corners(result), False

    # 3 ta burchak topildimi? → 4-chisini hisoblash
    result_3 = _estimate_fourth(candidates, w, h, zone_pct)
    if result_3 is not None and validate_rectangle(result_3, w, h):
        return sort_corners(result_3), False

    # ──── STAGE 3: Geometric fallback ────
    if len(candidates) >= 4:
        result_geo = _geometric_pick(candidates, w, h)
        if result_geo is not None and validate_rectangle(result_geo, w, h):
            return sort_corners(result_geo), False

    # ──── STAGE 4: EvalBee-style hujjat chegarasi ────
    # Corner marklar topilmasa — varaqning CHETINI topish
    # is_doc_boundary=True → scanner PAGE_W ishlatadi (210mm, corner emas)
    doc = _detect_document_boundary(gray)
    if doc is not None:
        return sort_corners(doc), True

    return None, False


def _inset_to_corner_marks(
    doc_corners: np.ndarray, img_w: int, img_h: int,
    corner_center_mm: float, page_w_mm: float, page_h_mm: float
) -> np.ndarray | None:
    """
    Hujjat chegarasidan corner mark markazlariga o'tish.

    doc_corners: varaq chetining 4 burchagi [tl, tr, br, bl]
    corner_center_mm: corner mark markazi chetdan (7mm)

    Har burchakni proporsional ichkariga siljitadi:
      inset_x = corner_center_mm / page_w_mm  (3.33%)
      inset_y = corner_center_mm / page_h_mm  (2.36%)
    """
    tl, tr, br, bl = doc_corners[:4]

    # Proporsional inset (0-1 oralig'ida)
    ix = corner_center_mm / page_w_mm  # ~0.0333
    iy = corner_center_mm / page_h_mm  # ~0.0236

    # Har burchakni ichkariga siljitish
    # TL → o'ngga-pastga, TR → chapga-pastga, BR → chapga-tepaga, BL → o'ngga-tepaga
    top_vec = tr - tl      # tepa tomon yo'nalishi
    left_vec = bl - tl     # chap tomon yo'nalishi
    right_vec = br - tr
    bot_vec = br - bl

    new_tl = tl + top_vec * ix + left_vec * iy
    new_tr = tr - top_vec * ix + right_vec * iy
    new_br = br - bot_vec * ix - right_vec * iy
    new_bl = bl + bot_vec * ix - left_vec * iy

    return np.array([new_tl, new_tr, new_br, new_bl], dtype=np.float32)


def _detect_document_boundary(gray: np.ndarray) -> np.ndarray | None:
    """
    EvalBee Qadam 2-4:
    GaussianBlur → Canny(75,200) → findContours → eng katta 4-burchakli kontur.

    Bu corner marklar topilmaganda FALLBACK sifatida ishlatiladi.
    Varaqning o'zi (oq qog'oz vs qorong'u fon) kontrast orqali topiladi.
    """
    h, w = gray.shape
    img_area = h * w

    # GaussianBlur — shovqin kamaytirish
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Multi-threshold Canny — turli yoritish sharoitlari uchun
    for canny_low, canny_high in [(50, 150), (75, 200), (30, 100)]:
        edges = cv2.Canny(blurred, canny_low, canny_high)

        # Dilate — chiziq bo'shliqlarini yopish
        kernel = np.ones((3, 3), np.uint8)
        edges = cv2.dilate(edges, kernel, iterations=2)

        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # Eng katta konturlarni tekshirish
        contours = sorted(contours, key=cv2.contourArea, reverse=True)

        for cnt in contours[:5]:
            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)

            if len(approx) == 4:
                area = cv2.contourArea(approx)
                # M-26 FIX: 15% → 25% — stol yuzasi, kitob muqovasi kabi
                # ob'ektlar (>15% lekin <25%) yolg'on hujjat sifatida qabul qilinmasin.
                # Haqiqiy A4 varaq odatda >40% bo'lishi kerak.
                if area > img_area * 0.25:
                    pts = approx.reshape(4, 2).astype(np.float32)
                    # M-26 FIX: validate_rectangle aspect ratio 0.62–0.85 tekshiruvi
                    # bu yerda ham ishlaydi — A4 bo'lmagan ob'ektlarni rad etadi.
                    if validate_rectangle(pts, w, h):
                        return pts

    return None


def _extract_candidates(
    binary: np.ndarray, w: int, h: int,
    min_area: int, max_area: int,
    solidity_min: float, fill_min: float,
    out: list
) -> None:
    """Binary rasmdan marker kandidatlarini chiqarish."""
    # Morphology close — kichik bo'shliqlarni yopish
    kernel = np.ones((3, 3), np.uint8)
    cleaned = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if not (min_area < area < max_area):
            continue

        x, y, cw, ch = cv2.boundingRect(cnt)
        if cw < 3 or ch < 3:
            continue

        # Aspect ratio — kvadratga yaqin
        aspect = cw / ch
        if not (0.45 < aspect < 2.2):
            continue

        # Solidity — konveks shakl (to'g'ri to'rtburchak = yuqori solidity)
        hull = cv2.convexHull(cnt)
        hull_area = cv2.contourArea(hull)
        solidity = area / hull_area if hull_area > 0 else 0
        if solidity < solidity_min:
            continue

        # Fill ratio — bounding rect ning qancha qismi to'ldirilgan
        fill = area / (cw * ch)
        if fill < fill_min:
            continue

        cx = x + cw / 2
        cy = y + ch / 2
        out.append((cx, cy, area, fill, solidity))


def _select_from_quadrants(
    candidates: list, w: int, h: int, zone_pct: float
) -> np.ndarray | None:
    """Har bir burchak zonasidan 1 ta eng yaxshi marker tanlash.
    Area outlier filtri: boshqa zonalardagi median area dan 3x katta = reject."""
    zones = {
        "tl": (0, 0, w * zone_pct, h * zone_pct),
        "tr": (w * (1 - zone_pct), 0, w, h * zone_pct),
        "br": (w * (1 - zone_pct), h * (1 - zone_pct), w, h),
        "bl": (0, h * (1 - zone_pct), w * zone_pct, h),
    }

    # 1-pass: har zonadan eng yaxshi kandidatni tanlash
    zone_bests = {}
    for zone_name, (x1, y1, x2, y2) in zones.items():
        zone_cands = [
            c for c in candidates
            if x1 <= c[0] <= x2 and y1 <= c[1] <= y2
        ]
        if zone_cands:
            best = max(zone_cands, key=lambda c: c[2] * c[3] * c[4])
            zone_bests[zone_name] = (best, zone_cands)

    if len(zone_bests) < 4:
        return None

    # 2-pass: area outlier filtri
    # Reference = eng kichik 2 area (odatda TL, TR — soyasiz, aniq)
    areas = sorted([zone_bests[z][0][2] for z in zone_bests])
    ref_area = (areas[0] + areas[1]) / 2 if len(areas) >= 2 else areas[0]

    # M-25 FIX: return None o'rniga outlier best'ni saqlab validate_rectangle ga topshirish.
    # _estimate_fourth va _geometric_pick fallback'lari find_corners() da chaqiriladi,
    # lekin ular uchun ham kandidatlar kerak. Outlier mavjud bo'lganda uni
    # "best available" sifatida qoldirish — validate_rectangle noto'g'ri burchakni rad etadi.
    selected = {}
    for zone_name in zone_bests:
        best, zone_cands = zone_bests[zone_name]
        if best[2] > ref_area * 2.5:
            # Outlier — kichikroq kandidatni tanlash
            filtered = [c for c in zone_cands if c[2] <= ref_area * 2.5]
            if filtered:
                best = max(filtered, key=lambda c: c[2] * c[3] * c[4])
            # M-25 FIX: else: return None → outlier best sifatida qoladi.
            # validate_rectangle noto'g'ri natijani rad etadi.
        selected[zone_name] = best

    pts = np.array([
        selected["tl"][:2], selected["tr"][:2],
        selected["br"][:2], selected["bl"][:2],
    ], dtype=np.float32)
    return pts


def _estimate_fourth(
    candidates: list, w: int, h: int, zone_pct: float
) -> np.ndarray | None:
    """3 burchakdan 4-chisini parallelogram bilan hisoblash."""
    zones = {
        "tl": (0, 0, w * zone_pct, h * zone_pct),
        "tr": (w * (1 - zone_pct), 0, w, h * zone_pct),
        "br": (w * (1 - zone_pct), h * (1 - zone_pct), w, h),
        "bl": (0, h * (1 - zone_pct), w * zone_pct, h),
    }

    selected = {}
    for zone_name, (x1, y1, x2, y2) in zones.items():
        zone_cands = [
            c for c in candidates
            if x1 <= c[0] <= x2 and y1 <= c[1] <= y2
        ]
        if zone_cands:
            best = max(zone_cands, key=lambda c: c[2] * c[3] * c[4])
            selected[zone_name] = best[:2]  # faqat (cx, cy)

    if len(selected) != 3:
        return None

    missing_key = [k for k in ["tl", "tr", "br", "bl"] if k not in selected][0]
    estimated = estimate_missing_corner(selected, missing_key)
    selected[missing_key] = estimated

    pts = np.array([
        selected["tl"][:2], selected["tr"][:2],
        selected["br"][:2], selected["bl"][:2],
    ], dtype=np.float32)
    return pts


def _geometric_pick(candidates: list, w: int, h: int) -> np.ndarray | None:
    """
    Barcha kandidatlardan 4 burchakka eng yaqin 4 tasini tanlash.
    Fallback — zona chegaralari ishlamaganda.
    """
    if len(candidates) < 4:
        return None

    # Ideal burchaklar
    corners_ideal = [(0, 0), (w, 0), (w, h), (0, h)]  # TL, TR, BR, BL
    selected = []
    used = set()

    for cx_i, cy_i in corners_ideal:
        best_idx = -1
        best_dist = float('inf')
        for i, (cx, cy, *_) in enumerate(candidates):
            if i in used:
                continue
            dist = (cx - cx_i) ** 2 + (cy - cy_i) ** 2
            if dist < best_dist:
                best_dist = dist
                best_idx = i
        if best_idx >= 0:
            selected.append(candidates[best_idx][:2])
            used.add(best_idx)

    if len(selected) == 4:
        return np.array(selected, dtype=np.float32)
    return None


def _corner_quality(corners: np.ndarray, w: int, h: int) -> float:
    """4 burchakning sifat ballini hisoblash."""
    xs = corners[:, 0]
    ys = corners[:, 1]
    span_x = xs.max() - xs.min()
    span_y = ys.max() - ys.min()
    return (span_x / w) * (span_y / h)


def warp_perspective(color: np.ndarray, corners: np.ndarray,
                     is_doc_boundary: bool = False) -> np.ndarray:
    """
    4 burchak orqali perspektiv tuzatish.

    is_doc_boundary=False: corners = corner mark markazlari → SPAN_W x SPAN_H
    is_doc_boundary=True:  corners = varaq cheti → PAGE_W x PAGE_H
    """
    from config import PAGE_W, PAGE_H
    target_w = SCANNER["target_width_px"]
    if is_doc_boundary:
        target_h = int(target_w * PAGE_H / PAGE_W)
    else:
        target_h = int(target_w * SPAN_H / SPAN_W)

    dst = np.array([
        [0, 0],
        [target_w - 1, 0],
        [target_w - 1, target_h - 1],
        [0, target_h - 1],
    ], dtype=np.float32)

    src = sort_corners(corners)
    M = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(color, M, (target_w, target_h),
                                  flags=cv2.INTER_LINEAR)
    return warped
