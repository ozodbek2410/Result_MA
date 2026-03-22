"""
omr_config.json dan konfiguratsiya o'qish va layout formulalari.
Barcha o'lchamlar bu fayldan — Python, TypeScript, React bitta manbadan foydalanadi.
"""
import json
import math
from pathlib import Path

_config_path = Path(__file__).parent / "omr_config.json"
with open(_config_path, "r") as f:
    CFG = json.load(f)

SHEET = CFG["sheet"]
SCANNER = CFG["scanner"]
LAYOUT = CFG["layout"]

# Sahifa o'lchamlari (mm)
PAGE_W = SHEET["page_w_mm"]
PAGE_H = SHEET["page_h_mm"]
CORNER_MARK = SHEET["corner_mark_mm"]
CORNER_MARGIN = SHEET["corner_margin_mm"]
PAGE_PAD = SHEET["page_pad_mm"]
BUBBLE = SHEET["bubble_size_mm"]
BUBBLE_GAP = SHEET["bubble_gap_mm"]
NUM_W = SHEET["num_width_mm"]
TIMING_W = SHEET["timing_col_w_mm"]
HEADER_H = SHEET["header_height_mm"]
QR_SIZE = SHEET["qr_size_mm"]

# Perspektiv tuzatishdan keyin actual span
# Burchak markeri markazidan markazgacha = page - 2*(margin + mark/2)
CORNER_CENTER = CORNER_MARGIN + CORNER_MARK / 2   # 7mm
SPAN_W = PAGE_W - 2 * CORNER_CENTER               # 196mm
SPAN_H = PAGE_H - 2 * CORNER_CENTER               # 283mm

# Grid o'lchamlari
# 1 ustun kengligi: timing(4) + num(7) + A(6) + gap(2) + B(6) + gap(2) + C(6) + gap(2) + D(6) = 41mm
COL_W = TIMING_W + NUM_W + 4 * BUBBLE + 3 * BUBBLE_GAP  # 41mm


def col_gap(n_cols: int) -> float:
    """Ustunlar orasidagi bo'shliq (mm), max 15mm."""
    usable = PAGE_W - 2 * PAGE_PAD   # 186mm
    total_col = n_cols * COL_W
    if n_cols <= 1:
        return 0.0
    gap = (usable - total_col) / (n_cols - 1)
    return min(15.0, max(0.0, gap))


def compute_layout(total_questions: int) -> dict:
    """
    Savol soniga qarab layout parametrlarini hisoblash.
    Bitta formula — 5 tier emas.
    """
    n_cols = max(LAYOUT["min_columns"], min(LAYOUT["max_columns"],
                 math.ceil(total_questions / LAYOUT["max_rows_per_col"])))
    rows_per_col = math.ceil(total_questions / n_cols)

    if rows_per_col > 28:
        row_margin = LAYOUT["row_margin_dense_mm"]
    else:
        row_margin = LAYOUT["row_margin_normal_mm"]

    row_h = BUBBLE + 2 * row_margin
    grid_h = rows_per_col * row_h

    gap = col_gap(n_cols)

    return {
        "n_cols": n_cols,
        "rows_per_col": rows_per_col,
        "row_margin_mm": row_margin,
        "row_h_mm": row_h,
        "grid_h_mm": grid_h,
        "col_gap_mm": gap,
        "col_w_mm": COL_W,
    }


def mm_to_px(mm: float, warped_width_px: int) -> float:
    """
    mm → pixel konvertatsiya.
    warped_width_px — perspektiv tuzatilgan rasmning kengligi.
    SPAN_W = 196mm (corner markerlar orasidagi masofa).
    XATO: avval `width/210` ishlatilgan — bu noto'g'ri!
    TO'G'RI: `width/196` — chunki transform corner markazlarini to'g'irlaydi.
    """
    return mm * warped_width_px / SPAN_W
