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


def find_corners(gray: np.ndarray) -> np.ndarray | None:
    """
    4 ta burchak markerni topish — 3-bosqichli EvalBee-level pipeline.

    Returns:
        np.ndarray shape (4,2) — [tl, tr, br, bl] koordinatalar
        None — topilmadi
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
        return sort_corners(result)

    # 3 ta burchak topildimi? → 4-chisini hisoblash
    result_3 = _estimate_fourth(candidates, w, h, zone_pct)
    if result_3 is not None and validate_rectangle(result_3, w, h):
        return sort_corners(result_3)

    # ──── STAGE 3: Geometric fallback ────
    if len(candidates) >= 4:
        result_geo = _geometric_pick(candidates, w, h)
        if result_geo is not None and validate_rectangle(result_geo, w, h):
            return sort_corners(result_geo)

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
    """Har bir burchak zonasidan 1 ta eng yaxshi marker tanlash."""
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
            # Score: area * fill * solidity
            best = max(zone_cands, key=lambda c: c[2] * c[3] * c[4])
            selected[zone_name] = best

    if len(selected) == 4:
        pts = np.array([
            selected["tl"][:2], selected["tr"][:2],
            selected["br"][:2], selected["bl"][:2],
        ], dtype=np.float32)
        return pts

    return None


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


def warp_perspective(color: np.ndarray, corners: np.ndarray) -> np.ndarray:
    """
    4 burchak marker orqali perspektiv tuzatish.
    Target: SPAN_W x SPAN_H mm nisbatida.
    """
    target_w = SCANNER["target_width_px"]
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
