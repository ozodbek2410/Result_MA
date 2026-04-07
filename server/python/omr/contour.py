"""
Contour-based bubble detection — EvalBee yondashuvi.

Layout-first matematik formula o'rniga: warped binary rasmda barcha bubble shaped
contour'larni FIZIK topadi. Keyin layout_mapper.py ularni Q-N-LETTER ga biriktiradi.

Nima uchun bu yondashuv kerak:
─────────────────────────────────
Layout-first kamchiligi: agar perspektiv tuzatish 3-5 piksel xato berib qo'ysa,
hisoblangan bubble pozitsiya bo'sh joyga to'g'ri keladi va fill ratio = 0.
Natijada juda yaxshi rasm bo'lsa ham detection 0% bo'ladi (iPhone 15 holatidagi
bug aynan shu).

Contour detection EvalBee, OMRChecker va boshqa professional OMR tizimlari
ishlatadigan asosiy texnika. Bubble qayerda bo'lsa shu yerda topiladi —
matematik xato uning ishini buzmaydi.

Shape filtri (yolg'on positivelarni yo'qotish):
─────────────────────────────────────────────
- Area: π·R²·[0.4, 2.0] — kichik shovqin va katta blob'lar tashlanadi
- Aspect ratio: bbox kengligi/balandligi ∈ [0.7, 1.3] — kvadrat ≈ doira
- Circularity: 4π·area/perimeter² ≥ 0.55 — haqiqiy doira
- Solidity: area/hull_area ≥ 0.85 — to'liq doira (U-shape rad qilinadi)

Bo'sh va to'ldirilgan bubble'lar:
─────────────────────────────────
- Bo'sh bubble: faqat tashqi chiziq qora → contour = outline ring
  cv2.contourArea() ring tomonidan o'rab olingan area ni qaytaradi ≈ π·R²
- To'ldirilgan: butun disk qora → contour = solid disk
  cv2.contourArea() = π·R²
Ikkalasi ham bir xil shape filter dan o'tadi.

Touching bubbles (yopishgan):
──────────────────────────────
MORPH_CLOSE (3x3) kichik bo'shliqlarni yopiq qilish uchun, ammo bubble'larni
qo'shmasligi uchun kernel kichik. Yopishgan bubble'lar holatida watershed
algoritmi keyinchalik qo'shilishi mumkin (hozircha kerak emas, chunki
ResultMA javob varaqlarda bubble'lar 1.5mm gap bilan ajratilgan).

M-FIX referenslari:
M-15: ko'k qalam uchun fill threshold tuning (fill.py da)
"""
from __future__ import annotations

import cv2
import numpy as np


# Shape filter parametrlari (empirik, EvalBee/OMRChecker bilan mos)
_AREA_MIN_FACTOR = 0.40   # min_area = π·R²·0.40
_AREA_MAX_FACTOR = 2.00   # max_area = π·R²·2.00
_ASPECT_MIN = 0.70        # bbox W/H min
_ASPECT_MAX = 1.30        # bbox W/H max
_CIRCULARITY_MIN = 0.55   # 4π·A/P²
_SOLIDITY_MIN = 0.80      # A/hull_A — bo'sh ringga moslik uchun 0.85→0.80


def find_bubble_contours(
    binary: np.ndarray,
    expected_radius: float,
    apply_morph_close: bool = True,
) -> list[dict]:
    """
    Warped binary rasmda barcha bubble shaped contour'larni topadi.

    Args:
        binary: 8-bit binary image (255 = foreground/dark/ink, 0 = background/paper).
                Otsu THRESH_BINARY_INV natijasi shu formatda.
        expected_radius: Layout dan bubble radius (pixel) — area filtri uchun reference.
                         Misol uchun bubble 5mm, warped 1000px width 196mm dan:
                         R = 5/2 * 1000/196 = ~12.75 px
        apply_morph_close: Bubble outline gap'larini yopish (default True).
                           Faqat juda toza rasmlarda False qilish mumkin.

    Returns:
        Bubble dict list: [{"cx", "cy", "r", "area", "circularity", "solidity"}, ...]
        cx, cy — float pixel coordinates (sub-pixel center)
        r — float radius (cv2.minEnclosingCircle dan)
    """
    if binary is None or binary.size == 0:
        return []
    if expected_radius <= 0:
        return []

    # Bubble outline'larni yopish — kichik gap'lar (anti-aliasing artefaktlari)
    src = binary
    if apply_morph_close:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        src = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)

    contours, _ = cv2.findContours(src, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return []

    expected_area = np.pi * expected_radius * expected_radius
    min_area = expected_area * _AREA_MIN_FACTOR
    max_area = expected_area * _AREA_MAX_FACTOR

    bubbles: list[dict] = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue

        perimeter = cv2.arcLength(cnt, True)
        if perimeter <= 0.0:
            continue

        # Circularity = 4π·A/P². Mukammal doira = 1.0, kvadrat ≈ 0.785
        circularity = 4.0 * np.pi * area / (perimeter * perimeter)
        if circularity < _CIRCULARITY_MIN:
            continue

        x, y, w, h = cv2.boundingRect(cnt)
        if h <= 0 or w <= 0:
            continue

        aspect = w / h
        if aspect < _ASPECT_MIN or aspect > _ASPECT_MAX:
            continue

        hull = cv2.convexHull(cnt)
        hull_area = cv2.contourArea(hull)
        if hull_area <= 0.0:
            continue
        solidity = area / hull_area
        if solidity < _SOLIDITY_MIN:
            continue

        # Sub-pixel markaz (minEnclosingCircle ko'p hollarda boundingRect dan aniqroq)
        (cx, cy), enclosing_r = cv2.minEnclosingCircle(cnt)

        bubbles.append({
            "cx": float(cx),
            "cy": float(cy),
            "r": float(enclosing_r),
            "area": float(area),
            "circularity": float(circularity),
            "solidity": float(solidity),
        })

    return bubbles


def filter_by_region(
    bubbles: list[dict],
    x_min: float,
    y_min: float,
    x_max: float,
    y_max: float,
) -> list[dict]:
    """
    Bubble'larni faqat ma'lum region ichidagilariga cheklash.

    Header zonasi (QR + ism + sana) bubble shaped artefaktlar berishi mumkin —
    ularni grid region tashqarisida ekanligi bilan istisno qilamiz.

    Args:
        bubbles: find_bubble_contours() natijasi
        x_min, y_min, x_max, y_max: grid bounding box (pixel)

    Returns:
        Faqat region ichidagi bubble'lar
    """
    return [
        b for b in bubbles
        if x_min <= b["cx"] <= x_max and y_min <= b["cy"] <= y_max
    ]


def estimate_bubble_radius(bubbles: list[dict]) -> float:
    """
    Topilgan bubble'lardan median radius hisoblash.

    Layout dan kelgan expected_radius juda kichik yoki katta bo'lsa
    (perspektiv warp masshtab xatosi), haqiqiy median radius mapping
    uchun aniqroq tolerance beradi.

    Returns:
        Median radius. Bubbles bo'sh bo'lsa 0.0.
    """
    if not bubbles:
        return 0.0
    radii = [b["r"] for b in bubbles]
    return float(np.median(radii))
