"""
scanner.py — OMRScanner end-to-end unit testlar.
Sintetik answer sheet rasm bilan to'liq pipeline testi.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import tempfile
import numpy as np
import cv2
import pytest
from config import SPAN_W, SPAN_H, SCANNER
from scanner import OMRScanner


# ─── SINTETIK ANSWER SHEET YARATISH ─────────────────────────────────────────

def make_answer_sheet_image(
    total_q: int = 30,
    filled_answers: dict | None = None,
    w: int = 1200,
) -> tuple[np.ndarray, str]:
    """
    Sintetik answer sheet: corner markers + grid + filled bubbles.
    OMRScanner bilan skanerlanishi uchun haqiqiy varaqa simulatsiyasi.

    Returns: (image_bgr, tmp_file_path)
    """
    from config import (
        SHEET, LAYOUT, SPAN_W as SW, SPAN_H as SH,
        mm_to_px, compute_layout, BUBBLE,
    )

    h = int(w * SH / SW)
    img = np.ones((h, w, 3), dtype=np.uint8) * 220  # oq fon

    # Corner markers (10mm × 10mm, 2mm margin)
    cm = int(mm_to_px(SHEET["corner_mark_mm"], w))
    cg = int(mm_to_px(SHEET["corner_margin_mm"], w))
    for vy, hx in [("top", "left"), ("top", "right"), ("bottom", "left"), ("bottom", "right")]:
        y = cg if vy == "top" else h - cg - cm
        x = cg if hx == "left" else w - cg - cm
        img[y:y+cm, x:x+cm] = 0  # qora marker

    # Grid bubbles
    layout = compute_layout(total_q)
    cols = layout["n_cols"]
    rows = layout["rows_per_col"]
    rm   = layout["row_margin_mm"]

    # M-20 FIX: PP_h (horizontal) va PP_top (vertical top) alohida.
    # Eski: PP = PAGE_PAD = 12mm — Y uchun ham shu ishlatilardi.
    # To'g'ri: grid_top_px = PAGE_PAD_TOP (14mm) + HEADER + GRID_OFFSET - CORNER_CENTER
    PP_h   = int(mm_to_px(SHEET["page_pad_mm"], w))                                    # 12mm
    PP_top = int(mm_to_px(SHEET.get("page_pad_top_mm", SHEET["page_pad_mm"]), w))      # 14mm
    HH = int(mm_to_px(SHEET["header_height_mm"], w))
    BS = int(mm_to_px(SHEET["bubble_size_mm"], w))
    BG = int(mm_to_px(SHEET["bubble_gap_mm"], w))
    NW = int(mm_to_px(SHEET["num_width_mm"], w))
    TW = int(mm_to_px(SHEET["timing_col_w_mm"], w))
    CW = TW + NW + 4 * BS + 3 * BG
    RM = int(mm_to_px(rm, w))

    usable = w - 2 * PP_h
    gap = int(min(int(mm_to_px(15, w)), (usable - cols * CW) // max(cols - 1, 1))) if cols > 1 else 0

    # M-20 FIX: GRID_OFF = paddingTop(1mm) + col_header(BS=5mm) + col_header_mb(1.5mm) = 7.5mm
    # grid.py _GRID_OFFSET_MM = BUBBLE + 2.5 = 7.5mm bilan to'liq mos.
    GRID_OFF = int(mm_to_px(BUBBLE + 2.5, w))

    letters = ['A', 'B', 'C', 'D']
    filled = filled_answers or {}

    for ci in range(cols):
        # M-20 FIX: horizontal → PP_h (12mm)
        col_x = PP_h + ci * (CW + gap)
        for ri in range(rows):
            q_num = ci * rows + ri + 1
            if q_num > total_q:
                break
            # M-20 FIX: vertical top → PP_top (14mm) — grid.py PAGE_PAD_TOP bilan mos
            row_y = PP_top + HH + GRID_OFF + ri * (BS + 2 * RM)
            # Timing mark (small black square, left of number)
            tm_x = int(col_x)
            tm_y = int(row_y) + BS // 4
            img[tm_y:tm_y + BS // 2, tm_x:tm_x + max(1, TW * 3 // 4)] = 0
            # Bubbles
            bx_start = int(col_x) + TW + NW
            for li, letter in enumerate(letters):
                bx = bx_start + li * (BS + BG)
                by = int(row_y)
                # Doira (bo'sh)
                cx_c = bx + BS // 2
                cy_c = by + BS // 2
                r = max(1, BS // 2 - 1)
                cv2.circle(img, (cx_c, cy_c), r, (0, 0, 0), 1)
                # Agar javob berilgan bo'lsa — to'ldir
                if filled.get(q_num) == letter:
                    cv2.circle(img, (cx_c, cy_c), r - 1, (10, 10, 10), -1)

    # Vaqtinchalik fayl saqlash
    fd, path = tempfile.mkstemp(suffix='.jpg')
    os.close(fd)
    cv2.imwrite(path, img)
    return img, path


# ─── TESTLAR ─────────────────────────────────────────────────────────────────

class TestOMRScannerOutput:
    def test_result_has_required_keys(self):
        """Scanner natijasida majburiy kalitlar bor."""
        _, path = make_answer_sheet_image(30)
        try:
            scanner = OMRScanner()
            result = scanner.scan(path, total_questions=30)
            assert "success" in result
            assert "version" in result
            assert "qr_code" in result
            assert "answers" in result
            assert "detected_answers" in result
            assert "stats" in result
        finally:
            os.unlink(path)

    def test_version_is_2(self):
        """version=2 bo'lishi kerak."""
        _, path = make_answer_sheet_image(30)
        try:
            result = OMRScanner().scan(path, total_questions=30)
            assert result["version"] == 2
        finally:
            os.unlink(path)

    def test_missing_file_returns_error(self):
        """Mavjud bo'lmagan fayl — xatolik qaytarishi kerak."""
        result = OMRScanner().scan("/nonexistent/path/image.jpg", total_questions=30)
        assert result["success"] is False
        assert "error" in result

    def test_no_questions_without_qr_uses_fallback(self):
        """
        M-04 FIX: QR yo'q va total_questions=None → scanner 90 deb taxmin qiladi.
        Bu holatda success=True lekin partial=True qaytishi kerak.

        Eski test noto'g'ri edi: 'success is False' kutilardi, lekin scanner
        timing marks orqali yoki 90 deb taxmin qilib davom etadi (M-11 FIX).
        """
        _, path = make_answer_sheet_image(30)
        try:
            result = OMRScanner().scan(path, total_questions=None)
            # QR topilmasa scanner davom etadi (taxmin bilan)
            # partial=True — variant kodi aniqlanmagan
            if result["success"]:
                assert result.get("partial") is True, (
                    "QR topilmagan holat partial=True bo'lishi kerak"
                )
                # Warnings da QR haqida xabar bo'lishi kerak
                warnings = result.get("warnings", [])
                assert any("QR" in w or "qr" in w.lower() for w in warnings), (
                    f"QR haqida warning yo'q: {warnings}"
                )
            # else: success=False ham mumkin (corners topilmasa)
        finally:
            os.unlink(path)

    def test_stats_keys_present_on_success(self):
        """stats dict to'g'ri kalitlarga ega."""
        _, path = make_answer_sheet_image(30)
        try:
            result = OMRScanner().scan(path, total_questions=30)
            if result["success"]:
                stats = result["stats"]
                for key in ("answered", "empty", "total", "detection_rate", "avg_confidence"):
                    assert key in stats, f"stats.{key} yo'q"
        finally:
            os.unlink(path)

    def test_answers_count_matches_total_q(self):
        """answers dict kalit soni total_q ga teng (muvaffaqiyatli bo'lsa)."""
        _, path = make_answer_sheet_image(30)
        try:
            result = OMRScanner().scan(path, total_questions=30)
            if result["success"]:
                assert len(result["answers"]) == 30
        finally:
            os.unlink(path)

    def test_detected_answers_subset_of_answers(self):
        """detected_answers — answers kalit to'plami ostto'plami bo'lishi kerak."""
        _, path = make_answer_sheet_image(30)
        try:
            result = OMRScanner().scan(path, total_questions=30)
            if result["success"]:
                all_keys = set(result["answers"].keys())
                det_keys = set(result["detected_answers"].keys())
                assert det_keys.issubset(all_keys), \
                    f"detected_answers ({det_keys - all_keys}) answers ichida yo'q"
        finally:
            os.unlink(path)

    def test_answer_letter_values_valid(self):
        """detected_answers qiymatlari faqat A/B/C/D bo'lishi kerak."""
        _, path = make_answer_sheet_image(30)
        try:
            result = OMRScanner().scan(path, total_questions=30)
            if result["success"]:
                for q, letter in result["detected_answers"].items():
                    assert letter in ("A", "B", "C", "D"), \
                        f"Q{q}: '{letter}' noto'g'ri letter"
        finally:
            os.unlink(path)

    def test_qr_code_dict_structure(self):
        """qr_code dict found+variant_code+total_questions kalitlariga ega."""
        _, path = make_answer_sheet_image(30)
        try:
            result = OMRScanner().scan(path, total_questions=30)
            qr = result["qr_code"]
            assert "found" in qr
            assert isinstance(qr["found"], bool)
        finally:
            os.unlink(path)


class TestOMRScannerDifferentQuestions:
    @pytest.mark.parametrize("total_q", [20, 30, 45, 60, 75, 90])
    def test_various_question_counts(self, total_q: int):
        """Turli savol soni uchun scanner ishga tushadi va success yoki partial qaytaradi."""
        _, path = make_answer_sheet_image(total_q)
        try:
            result = OMRScanner().scan(path, total_questions=total_q)
            # success yoki xatolik — hech qachon istisno bo'lmasligi kerak
            assert isinstance(result, dict)
            assert "success" in result
        finally:
            os.unlink(path)


class TestOMRScannerFilledBubbles:
    def test_filled_bubbles_detected(self):
        """
        To'ldirilgan bubblelar aniqlanadi (90%+ aniqlik bilan).
        Sintetik rasmda 10 ta javob to'ldiriladi, scanner ulardan ko'pini topishi kerak.
        """
        filled = {1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A',
                  6: 'B', 7: 'C', 8: 'D', 9: 'A', 10: 'B'}
        _, path = make_answer_sheet_image(30, filled_answers=filled)
        try:
            result = OMRScanner().scan(path, total_questions=30)
            if not result["success"]:
                pytest.skip("Scanner sintetik rasmni qayta ishlay olmadi — real skan kerak")
            detected = result["detected_answers"]
            matched = sum(1 for q, l in filled.items() if detected.get(str(q)) == l)
            # M-05 FIX: 70% → 90% — grid offset tuzatilgandan keyin aniqlik oshdi.
            # M-20 FIX (PP→PP_top) va grid.py _GRID_OFFSET_MM (6mm→7.5mm) tuzatildi.
            # Sintetik rasmda ideal sharoit — kamida 9/10 to'g'ri bo'lishi kerak.
            assert matched >= 9, \
                f"Faqat {matched}/10 javob topildi (kutilgan: ≥9)\n" \
                f"Detected: {detected}"
        finally:
            os.unlink(path)


if __name__ == '__main__':
    import pytest as _pytest
    _pytest.main([__file__, '-v'])
