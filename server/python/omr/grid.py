"""
Layout-first grid qurish.

EvalBee reliability siri #2:
Bubble pozitsiyalari MATEMATIKA bilan hisoblanadi — detect qilinmaydi.
Bu yondashuvda past sifatli kamera yoki qorong'u sharoit AHAMIYaTSIZ:
bubble joylari doim aniq ma'lum.

Calibration: timing marklardan HAQIQIY grid pozitsiyani aniqlash (v2).
"""
import cv2
import numpy as np
from config import (compute_layout, mm_to_px, HEADER_H, PAGE_PAD, PAGE_PAD_TOP,
                    TIMING_W, NUM_W, BUBBLE, BUBBLE_GAP, CORNER_CENTER)


def build_grid(warped_gray: np.ndarray, total_questions: int,
               is_doc_boundary: bool = False) -> list[dict]:
    """
    Layout formulasidan bubble markazlarini hisoblash.

    is_doc_boundary=True: warped image = butun sahifa (210x297mm)
      → CORNER_CENTER ayirilmaydi, mm_to_px PAGE_W ishlatadi
    is_doc_boundary=False: warped image = corner marklar arasi (196x283mm)
      → CORNER_CENTER ayiriladi, mm_to_px SPAN_W ishlatadi
    """
    from config import PAGE_W, PAGE_H
    w = warped_gray.shape[1]
    layout = compute_layout(total_questions)

    # Document boundary: origin = sahifa cheti (0,0)
    # Corner marks: origin = TL corner CENTER (7mm from page edge)
    cc = 0 if is_doc_boundary else CORNER_CENTER

    def _mm_px(mm: float) -> float:
        if is_doc_boundary:
            return mm * w / PAGE_W
        return mm_to_px(mm, w)

    _GRID_OFFSET_MM = BUBBLE + 1.0  # col_header_h + col_header_mb
    grid_left_px = _mm_px(PAGE_PAD - cc)
    grid_top_px  = _mm_px(PAGE_PAD_TOP + HEADER_H + _GRID_OFFSET_MM - cc)
    col_w_px = _mm_px(layout["col_w_mm"])
    col_gap_px = _mm_px(layout["col_gap_mm"])
    row_h_px = _mm_px(layout["row_h_mm"])
    bubble_r = _mm_px(BUBBLE) / 2

    timing_px = _mm_px(TIMING_W)
    num_px = _mm_px(NUM_W)
    bubble_px = _mm_px(BUBBLE)
    bubble_gap_px = _mm_px(BUBBLE_GAP)

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
    Timing mark asosida grid calibration (v2).

    Har ustunning chap tomonida 3x3mm timing marklar bor.
    Bu marklarning Y pozitsiyalari → haqiqiy grid_top va row_h aniqlash.
    Natija: grid celllarni timing marklarga mos joyga siljitish.

    Returns: (dx, dy) — umumiy offset (lekin asosan per-cell correction ichida)
    """
    if not cells:
        return 0.0, 0.0

    from config import compute_layout, TIMING_W
    bubble_r = cells[0]["r"]
    total_q = max(c["q"] for c in cells)
    layout = compute_layout(total_q)
    rows_per_col = layout["rows_per_col"]
    n_cols = layout["n_cols"]

    # Per-column timing mark detection
    col_corrections = {}  # col_idx -> (grid_top_actual, row_h_actual)

    for col_idx in range(n_cols):
        col_cells = [c for c in cells if c["col"] == col_idx and c["letter"] == "A"]
        if not col_cells:
            continue

        # Timing mark search area: col chap chekkasidan timing_w gacha
        col_x = col_cells[0]["cx"]
        first_y = col_cells[0]["cy"]
        # Timing mark col_x dan chapda: timing marklar A bubbledan 13.5mm chapda
        # TM x-range: col_x - (num_w + bubble/2) ... col_x - (num_w + bubble/2 - timing_w)
        tm_x_right = col_x - bubble_r  # A bubble chap chekkasi
        tm_x_left = tm_x_right - 80  # keng qidirish

        marks = _find_timing_marks(
            warped_binary,
            x1=max(0, int(tm_x_left)),
            x2=int(tm_x_right),
            y1=max(0, int(first_y - bubble_r * 8)),  # grid_top yuqorisidan
            y2=min(warped_binary.shape[0], int(first_y + rows_per_col * bubble_r * 2.5 * 1.5)),
            expected_count=rows_per_col,
            bubble_r=bubble_r,
        )

        if len(marks) >= 5:
            # Actual grid_top = birinchi timing mark Y
            actual_top = marks[0]
            # Actual row_h = median oraliq
            diffs = [marks[i + 1] - marks[i] for i in range(len(marks) - 1)]
            actual_row_h = float(np.median(diffs))

            col_corrections[col_idx] = (actual_top, actual_row_h)

    if not col_corrections:
        # Fallback: eski global calibration
        return _fallback_calibrate(cells, warped_binary)

    # Apply per-cell correction
    for c in cells:
        col = c["col"]
        if col not in col_corrections:
            # Bu ustun uchun timing mark topilmadi — eng yaqin ustun correction ishlatish
            nearest = min(col_corrections.keys(), key=lambda k: abs(k - col))
            col = nearest

        actual_top, actual_row_h = col_corrections[col]
        row = c["row"]
        # Yangi Y pozitsiya: timing mark + row * actual_row_h
        c["cy"] = actual_top + row * actual_row_h

    # dx uchun umumiy bubble offset hisoblash (timing marklardan)
    # Timing mark markazidan bubble A markazigacha offset doimiy
    # dx=0 qaytaramiz — Y calibration yetarli
    return 0.0, 0.0


def _find_timing_marks(
    binary: np.ndarray,
    x1: int, x2: int, y1: int, y2: int,
    expected_count: int,
    bubble_r: float,
) -> list[float]:
    """
    Berilgan hududda timing marklarni (3x3mm qora kvadratlar) topish.

    Returns: sorted list of Y center positions
    """
    roi = binary[y1:y2, x1:x2]
    if roi.size == 0:
        return []

    cnts, _ = cv2.findContours(roi, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Timing mark ≈ 3mm square. bubble_r ≈ 2.5mm → timing = 3/2.5 * r = 1.2r
    # Area: timing = (3mm)^2 * px_scale ≈ (2*1.2*r)^2 / pi ≈ 5.76*r^2
    tm_side = bubble_r * 1.2  # 3mm vs 2.5mm radius
    min_area = (tm_side * 0.5) ** 2  # 25% of expected
    max_area = (tm_side * 3.0) ** 2  # 9x expected

    candidates = []
    for cnt in cnts:
        area = cv2.contourArea(cnt)
        if not (min_area < area < max_area):
            continue
        x, y, w, h = cv2.boundingRect(cnt)
        if w < 3 or h < 3:
            continue
        asp = w / h
        if not (0.35 < asp < 2.8):
            continue
        M = cv2.moments(cnt)
        if M["m00"] > 0:
            cy = M["m01"] / M["m00"] + y1  # absolute Y
            candidates.append(cy)

    if len(candidates) < 3:
        return []

    candidates.sort()

    # Expected row_h interval bilan filter
    # Row_h ≈ 6mm → px: 6 * (warped_width/196) ≈ 37px, lekin actual 35-45 oraliqda bo'lishi mumkin
    expected_row_h = bubble_r * 2 * 1.3  # ~6mm/5mm * 2*r
    min_gap = expected_row_h * 0.5
    max_gap = expected_row_h * 2.5

    # Filter: ketma-ket marklarning oralig'i mantiqiy bo'lishi kerak
    filtered = [candidates[0]]
    for i in range(1, len(candidates)):
        gap = candidates[i] - filtered[-1]
        if gap >= min_gap:
            filtered.append(candidates[i])

    # Agar juda ko'p (outlier bor), median gap bilan tozalash
    if len(filtered) >= 5:
        gaps = [filtered[i + 1] - filtered[i] for i in range(len(filtered) - 1)]
        med_gap = float(np.median(gaps))
        clean = [filtered[0]]
        for i in range(1, len(filtered)):
            gap = filtered[i] - clean[-1]
            if abs(gap - med_gap) < med_gap * 0.4:
                clean.append(filtered[i])
            elif abs(gap - 2 * med_gap) < med_gap * 0.4:
                # 1 ta mark skip bo'lgan — oralik 2x
                clean.append(filtered[i])
        filtered = clean

    return filtered


def _fallback_calibrate(cells: list[dict], warped_binary: np.ndarray) -> tuple[float, float]:
    """Eski global calibration — timing mark topilmaganda."""
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

    dxs, dys = [], []
    grid_centers = np.array([(c["cx"], c["cy"]) for c in cells])

    for dx_pt, dy_pt in detected:
        dists = np.sqrt((grid_centers[:, 0] - dx_pt) ** 2 + (grid_centers[:, 1] - dy_pt) ** 2)
        closest_idx = np.argmin(dists)
        if dists[closest_idx] < cells[0]["r"] * 4:  # kengaytirilgan radius
            dxs.append(dx_pt - grid_centers[closest_idx, 0])
            dys.append(dy_pt - grid_centers[closest_idx, 1])

    if not dxs:
        return 0.0, 0.0

    return float(np.median(dxs)), float(np.median(dys))


def apply_offset(cells: list[dict], dx: float, dy: float) -> list[dict]:
    """Grid ga calibration offset qo'llash."""
    for c in cells:
        c["cx"] += dx
        c["cy"] += dy
    return cells
