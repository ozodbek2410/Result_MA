"""
Layout-first grid qurish.

EvalBee reliability siri #2:
Bubble pozitsiyalari MATEMATIKA bilan hisoblanadi — detect qilinmaydi.
Bu yondashuvda past sifatli kamera yoki qorong'u sharoit AHAMIYaTSIZ:
bubble joylari doim aniq ma'lum.

Calibration: timing marklardan HAQIQIY grid pozitsiyani aniqlash (v2).

M-20 FIX: _GRID_OFFSET_MM = BUBBLE + 1.0 → BUBBLE + 2.5
          (paddingTop 1mm + col_header BUBBLE + col_header_mb 1.5mm = 7.5mm)
          AnswerSheetV2.tsx CSS bilan to'liq moslik ta'minlandi.
M-19 FIX: timing mark max_area 9x → 4x, aspect ratio 2.8 → 2.2
          Raqam/chiziq artefaktlari timing mark sifatida qabul qilinmaydi.
M-21 FIX: len(marks) >= 5 → >= 3 — kam timing mark bo'lsa ham calibration ishlaydi.
M-22 DOC: calibrate_grid per-cell in-place o'zgartiradi va (0.0, 0.0) qaytaradi.
          apply_offset(cells, 0, 0) zarar keltirmaydi — dizayn qasddan shu.
M-23 FIX: gap filter da max_gap ishlatiladi, birinchi candidate outlier bo'lsa ham filter ishlaydi.
M-24 FIX: cy bounds check — image'dan tashqariga chiqmaslik kafolati.
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

    # M-20 FIX: paddingTop(1mm) + col_header_h(BUBBLE=5mm) + col_header_mb(1.5mm) = 7.5mm
    # Eski: BUBBLE + 1.0 = 6mm → AnswerSheetV2.tsx bilan 1.5mm nomuvofiqlik bor edi
    _GRID_OFFSET_MM = BUBBLE + 2.5  # = 7.5mm — AnswerSheetV2.tsx bilan to'liq mos

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

    M-22 DOC: Bu funksiya cells ni IN-PLACE o'zgartiradi (cy yangilanadi),
              keyin (0.0, 0.0) qaytaradi. apply_offset(cells, 0.0, 0.0) zarar
              keltirmaydi. Kelajakda agar apply_offset real dy ishlatsa —
              ikki marta siljish yuzaga keladi, shu sababli bu hujjatlash MUHIM.

    Returns: (dx, dy) — hozir har doim (0.0, 0.0), per-cell correction in-place
    """
    if not cells:
        return 0.0, 0.0

    from config import compute_layout, TIMING_W
    bubble_r = cells[0]["r"]
    total_q = max(c["q"] for c in cells)
    layout = compute_layout(total_q)
    rows_per_col = layout["rows_per_col"]
    n_cols = layout["n_cols"]
    img_h = warped_binary.shape[0]

    # Per-column timing mark detection
    col_corrections: dict[int, tuple[float, float]] = {}

    for col_idx in range(n_cols):
        col_cells = [c for c in cells if c["col"] == col_idx and c["letter"] == "A"]
        if not col_cells:
            continue

        col_x = col_cells[0]["cx"]
        first_y = col_cells[0]["cy"]
        tm_x_right = col_x - bubble_r
        tm_x_left = tm_x_right - 80

        marks = _find_timing_marks(
            warped_binary,
            x1=max(0, int(tm_x_left)),
            x2=int(tm_x_right),
            y1=max(0, int(first_y - bubble_r * 8)),
            y2=min(img_h, int(first_y + rows_per_col * bubble_r * 2.5 * 1.5)),
            expected_count=rows_per_col,
            bubble_r=bubble_r,
        )

        # M-21 FIX: 5 → 3 — kam timing mark bo'lsa ham calibration ishlaydi
        if len(marks) >= 3:
            actual_top = marks[0]
            diffs = [marks[i + 1] - marks[i] for i in range(len(marks) - 1)]
            actual_row_h = float(np.median(diffs))
            col_corrections[col_idx] = (actual_top, actual_row_h)

    if not col_corrections:
        return _fallback_calibrate(cells, warped_binary)

    # M-22/M-24 FIX: per-cell correction + bounds check
    for c in cells:
        col = c["col"]
        if col not in col_corrections:
            nearest = min(col_corrections.keys(), key=lambda k: abs(k - col))
            col = nearest

        actual_top, actual_row_h = col_corrections[col]
        row = c["row"]
        new_cy = actual_top + row * actual_row_h
        # M-24 FIX: bounds check — image tashqarisiga chiqmaslik
        c["cy"] = max(bubble_r, min(img_h - bubble_r, new_cy))

    return 0.0, 0.0


def _find_timing_marks(
    binary: np.ndarray,
    x1: int, x2: int, y1: int, y2: int,
    expected_count: int,
    bubble_r: float,
) -> list[float]:
    """
    Berilgan hududda timing marklarni (3x3mm qora kvadratlar) topish.

    M-19 FIX: max_area 9x → 4x, aspect ratio 2.8 → 2.2
              Raqam harflari va chiziqlar yolg'on timing mark bo'lmasligi uchun.
    M-23 FIX: max_gap filtri qo'shildi, birinchi candidate outlier bo'lsa ham
              keyingi marklarni to'g'ri aniqlaydi.

    Returns: sorted list of Y center positions
    """
    roi = binary[y1:y2, x1:x2]
    if roi.size == 0:
        return []

    cnts, _ = cv2.findContours(roi, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Timing mark ≈ 3mm square. bubble_r ≈ 2.5mm → timing = 3/2.5 * r = 1.2r
    tm_side = bubble_r * 1.2
    min_area = (tm_side * 0.5) ** 2   # 25% expected
    # M-19 FIX: 9x (3.0**2) → 4x (2.0**2) — keng artefaktlarni istisno qilish
    max_area = (tm_side * 2.0) ** 2

    candidates = []
    for cnt in cnts:
        area = cv2.contourArea(cnt)
        if not (min_area < area < max_area):
            continue
        x, y, cw, ch = cv2.boundingRect(cnt)
        if cw < 3 or ch < 3:
            continue
        asp = cw / ch
        # M-19 FIX: 2.8 → 2.2 — juda cho'ziq shakllarni istisno qilish
        if not (0.35 < asp < 2.2):
            continue
        M_mom = cv2.moments(cnt)
        if M_mom["m00"] > 0:
            cy = M_mom["m01"] / M_mom["m00"] + y1  # absolute Y
            candidates.append(cy)

    if len(candidates) < 3:
        return []

    candidates.sort()

    # Expected row_h interval
    expected_row_h = bubble_r * 2 * 1.3
    min_gap = expected_row_h * 0.5
    # M-23 FIX: max_gap endi filtrda ishlatiladi
    max_gap = expected_row_h * 2.5

    # M-23 FIX: Birinchi candidate outlier bo'lishi mumkin.
    # Median bilan eng ishonchli boshlanish nuqtasini topish.
    # Avval barcha mantiqiy (min_gap) bo'shliqlar orqali initial filter:
    filtered = [candidates[0]]
    for i in range(1, len(candidates)):
        gap = candidates[i] - filtered[-1]
        # M-23 FIX: ham min_gap, ham max_gap tekshiriladi
        if min_gap <= gap <= max_gap:
            filtered.append(candidates[i])
        elif gap > max_gap:
            # Juda katta bo'shliq — ehtimol 1 ta mark skip bo'lgan (2x row_h)
            if gap <= max_gap * 1.5:
                filtered.append(candidates[i])

    if len(filtered) < 3:
        return []

    # Median gap bilan tozalash (agar yetarli mark bor)
    if len(filtered) >= 4:
        gaps = [filtered[i + 1] - filtered[i] for i in range(len(filtered) - 1)]
        med_gap = float(np.median(gaps))
        clean = [filtered[0]]
        for i in range(1, len(filtered)):
            gap = filtered[i] - clean[-1]
            if abs(gap - med_gap) < med_gap * 0.4:
                clean.append(filtered[i])
            elif abs(gap - 2 * med_gap) < med_gap * 0.4:
                # 1 ta mark skip bo'lgan
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
        M_mom = cv2.moments(cnt)
        if M_mom["m00"] == 0:
            continue
        cx = M_mom["m10"] / M_mom["m00"]
        cy = M_mom["m01"] / M_mom["m00"]
        detected.append((cx, cy))

    if len(detected) < 4:
        return 0.0, 0.0

    dxs, dys = [], []
    grid_centers = np.array([(c["cx"], c["cy"]) for c in cells])

    for dx_pt, dy_pt in detected:
        dists = np.sqrt((grid_centers[:, 0] - dx_pt) ** 2 + (grid_centers[:, 1] - dy_pt) ** 2)
        closest_idx = np.argmin(dists)
        if dists[closest_idx] < cells[0]["r"] * 4:
            dxs.append(dx_pt - grid_centers[closest_idx, 0])
            dys.append(dy_pt - grid_centers[closest_idx, 1])

    if not dxs:
        return 0.0, 0.0

    return float(np.median(dxs)), float(np.median(dys))


def apply_offset(cells: list[dict], dx: float, dy: float) -> list[dict]:
    """
    Grid ga calibration offset qo'llash.

    M-22 DOC: calibrate_grid per-cell in-place correction qilganida (0.0, 0.0)
    qaytaradi. Shu sababli bu funksiya odatda cx/cy ni o'zgartirmaydi.
    Agar kelajakda calibrate_grid real offset qaytarsa — IKKI MARTA siljish
    xavfi bor: calibrate_grid ichida + bu yerda. Shu holat yuzaga kelsa
    calibrate_grid dagi in-place correction olib tashlanishi kerak.
    """
    for c in cells:
        c["cx"] += dx
        c["cy"] += dy
    return cells
