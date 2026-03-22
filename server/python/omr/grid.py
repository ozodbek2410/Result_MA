"""
Layout-first grid qurish.

EvalBee reliability siri #2:
Bubble pozitsiyalari MATEMATIKA bilan hisoblanadi — detect qilinmaydi.
Bu yondashuvda past sifatli kamera yoki qorong'u sharoit AHAMIYaTSIZ:
bubble joylari doim aniq ma'lum.

Detection faqat ±2px calibration uchun — asosiy grid formula asosida.
"""
import cv2
import numpy as np
from config import (compute_layout, mm_to_px, HEADER_H, PAGE_PAD,
                    TIMING_W, NUM_W, BUBBLE, BUBBLE_GAP, CORNER_CENTER)


def build_grid(warped_gray: np.ndarray, total_questions: int) -> list[dict]:
    """
    Layout formulasidan bubble markazlarini hisoblash.

    Returns list of:
        {q: int, col: int, row: int, letter: 'A'|'B'|'C'|'D',
         cx: float, cy: float, r: float}
    """
    w = warped_gray.shape[1]
    layout = compute_layout(total_questions)

    # Warped image origin = TL corner CENTER (7mm from page edge).
    # Subtract CORNER_CENTER to convert page-edge measurements to warped-origin coordinates.
    #
    # Grid content top offset (AnswerSheetV2.tsx CSS layout):
    #   PAGE_PAD (12mm) + HEADER_H (55mm)
    #   + col header row height (BUBBLE = 6mm) + col header marginBottom (1mm)
    #   − CORNER_CENTER (7mm)
    #   = 67mm  →  Q1 bubble center = 67 + BUBBLE/2 = 70mm ✓
    _GRID_OFFSET_MM = BUBBLE + 1.0  # col_header_h + col_header_mb (paddingTop removed)
    grid_left_px = mm_to_px(PAGE_PAD - CORNER_CENTER, w)
    grid_top_px  = mm_to_px(PAGE_PAD + HEADER_H + _GRID_OFFSET_MM - CORNER_CENTER, w)
    col_w_px = mm_to_px(layout["col_w_mm"], w)
    col_gap_px = mm_to_px(layout["col_gap_mm"], w)
    row_h_px = mm_to_px(layout["row_h_mm"], w)
    bubble_r = mm_to_px(BUBBLE, w) / 2

    timing_px = mm_to_px(TIMING_W, w)
    num_px = mm_to_px(NUM_W, w)
    bubble_px = mm_to_px(BUBBLE, w)
    bubble_gap_px = mm_to_px(BUBBLE_GAP, w)

    # ABCD markazlari (ustun ichida, chap chetidan)
    # Timing | Num | A | gap | B | gap | C | gap | D
    letter_offsets = []
    x_start = timing_px + num_px
    for i in range(4):
        cx = x_start + bubble_px / 2 + i * (bubble_px + bubble_gap_px)
        letter_offsets.append(cx)

    letters = ["A", "B", "C", "D"]
    cells = []

    for q in range(1, total_questions + 1):
        col_idx = (q - 1) // layout["rows_per_col"]
        row_idx = (q - 1) % layout["rows_per_col"]

        col_x = grid_left_px + col_idx * (col_w_px + col_gap_px)
        # Bubble markazi: row_top + BUBBLE/2 (marginBottom faqat pastda, tepada yo'q)
        row_y = grid_top_px + row_idx * row_h_px + bubble_r

        for li, letter in enumerate(letters):
            cx = col_x + letter_offsets[li]
            cy = row_y
            cells.append({
                "q": q,
                "col": col_idx,
                "row": row_idx,
                "letter": letter,
                "cx": cx,
                "cy": cy,
                "r": bubble_r,
            })

    return cells


def calibrate_grid(cells: list[dict], warped_binary: np.ndarray) -> tuple[float, float]:
    """
    Detection bilan grid ni ±2px calibrate qilish.
    Katta bubble konturlarini topib, grid bilan solishtirish.

    Returns: (dx, dy) — piksel offset
    """
    contours, _ = cv2.findContours(warped_binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    bubble_r_approx = cells[0]["r"] if cells else 10
    min_a = np.pi * (bubble_r_approx * 0.5) ** 2
    max_a = np.pi * (bubble_r_approx * 1.8) ** 2

    detected = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if not (min_a < area < max_a):
            continue
        M = cv2.moments(cnt)
        if M["m00"] == 0:
            continue
        cx = M["m10"] / M["m00"]
        cy = M["m01"] / M["m00"]
        detected.append((cx, cy))

    if len(detected) < 4:
        return 0.0, 0.0

    # Har bir detected bubble uchun eng yaqin grid cell topish
    dxs, dys = [], []
    grid_centers = np.array([(c["cx"], c["cy"]) for c in cells])
    det_pts = np.array(detected)

    for dx_pt, dy_pt in det_pts:
        dists = np.sqrt((grid_centers[:, 0] - dx_pt) ** 2 + (grid_centers[:, 1] - dy_pt) ** 2)
        closest_idx = np.argmin(dists)
        if dists[closest_idx] < cells[0]["r"] * 2:
            dxs.append(dx_pt - grid_centers[closest_idx, 0])
            dys.append(dy_pt - grid_centers[closest_idx, 1])

    if not dxs:
        return 0.0, 0.0

    # Median offset (outlierlarni chetlashtirish)
    return float(np.median(dxs)), float(np.median(dys))


def apply_offset(cells: list[dict], dx: float, dy: float) -> list[dict]:
    """Grid ga calibration offset qo'llash."""
    for c in cells:
        c["cx"] += dx
        c["cy"] += dy
    return cells
