"""
Burchak markerlarni aniqlash va perspektiv tuzatish.

EvalBee reliability sirlari:
- Multi-threshold: 7+ threshold sinab ko'riladi, eng yaxshi 4-burchak olinadi
- Katta markerlar (10mm): qorong'u/blur rasmlarda ham topiladi
- Sodda kvadrat shakl: doira emas, kvadrat → Canny edge aniqroq ishlaydi
"""
import cv2
import numpy as np
from utils import multi_threshold, sort_corners
from config import SCANNER, SPAN_W, SPAN_H, mm_to_px


def find_corners(gray: np.ndarray) -> np.ndarray | None:
    """
    4 ta burchak markerni topish.

    Returns:
        np.ndarray shape (4,2) — [tl, tr, br, bl] koordinatalar
        None — topilmadi
    """
    h, w = gray.shape

    best = None
    best_score = 0

    for binary in multi_threshold(gray):
        result = _find_in_binary(binary, w, h)
        if result is not None:
            score = _corner_quality(result, w, h)
            if score > best_score:
                best_score = score
                best = result

    return best


def _find_in_binary(binary: np.ndarray, w: int, h: int) -> np.ndarray | None:
    """Bitta binary rasmda 4 ta burchak topish."""
    # Kichik konturlarni yo'qotish (shovqin)
    kernel = np.ones((3, 3), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    min_area = SCANNER["min_marker_area_px"]
    max_area = SCANNER["max_marker_area_px"]

    # Kvadrat-ga yaqin konturlarni filtr qilish
    squares = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if not (min_area < area < max_area):
            continue

        x, y, cw, ch = cv2.boundingRect(cnt)
        aspect = cw / ch if ch > 0 else 0
        if not (0.5 < aspect < 2.0):  # kvadratga yaqin
            continue

        cx = x + cw / 2
        cy = y + ch / 2
        squares.append((cx, cy, area))

    if len(squares) < 4:
        return None

    # 4 ta burchakga eng yaqin marker (har burchak zonasidan 1 ta)
    corners = _pick_four_corners(squares, w, h)
    return corners


def _pick_four_corners(
    squares: list[tuple], w: int, h: int
) -> np.ndarray | None:
    """
    Har bir burchak zonasidan 1 ta marker tanlash.
    Zona: rasming 30%x30% burchak qismi.
    """
    zones = {
        "tl": (0, 0, w * 0.4, h * 0.4),
        "tr": (w * 0.6, 0, w, h * 0.4),
        "br": (w * 0.6, h * 0.6, w, h),
        "bl": (0, h * 0.6, w * 0.4, h),
    }

    selected = {}
    for zone_name, (x1, y1, x2, y2) in zones.items():
        candidates = [
            s for s in squares
            if x1 <= s[0] <= x2 and y1 <= s[1] <= y2
        ]
        if not candidates:
            return None
        # Eng katta markerini olish
        best = max(candidates, key=lambda s: s[2])
        selected[zone_name] = (best[0], best[1])

    pts = np.array([
        selected["tl"],
        selected["tr"],
        selected["br"],
        selected["bl"],
    ], dtype=np.float32)

    return pts


def _corner_quality(corners: np.ndarray, w: int, h: int) -> float:
    """
    4 burchakning sifat ballini hisoblash.
    Kattaroq = sahifani to'liqroq qamrab olgan = yaxshiroq.
    """
    xs = corners[:, 0]
    ys = corners[:, 1]
    span_x = xs.max() - xs.min()
    span_y = ys.max() - ys.min()
    return (span_x / w) * (span_y / h)


def warp_perspective(color: np.ndarray, corners: np.ndarray) -> np.ndarray:
    """
    4 burchak marker orqali perspektiv tuzatish.
    Natija: A4 nisbatida to'g'rilangan rasm (SPAN_W x SPAN_H mm).

    Target o'lchami: 1200px kenglik (aniqlik uchun yetarli).
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
