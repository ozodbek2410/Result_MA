"""
config.py — layout formula va mm_to_px uchun unit testlar.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from config import compute_layout, mm_to_px, SPAN_W, COL_W


class TestComputeLayout:
    def test_30q_2cols(self):
        L = compute_layout(30)
        assert L["n_cols"] == 2
        assert L["rows_per_col"] == 15
        assert L["row_margin_mm"] == 1.0  # rows <= 28

    def test_60q_2cols(self):
        L = compute_layout(60)
        assert L["n_cols"] == 2
        assert L["rows_per_col"] == 30
        assert L["row_margin_mm"] == 0.5  # rows > 28

    def test_75q_3cols(self):
        L = compute_layout(75)
        assert L["n_cols"] == 3
        assert L["rows_per_col"] == 25

    def test_90q_3cols(self):
        L = compute_layout(90)
        assert L["n_cols"] == 3
        assert L["rows_per_col"] == 30
        assert L["row_margin_mm"] == 0.5

    def test_120q_4cols(self):
        L = compute_layout(120)
        assert L["n_cols"] == 4
        assert L["rows_per_col"] == 30
        assert L["row_margin_mm"] == 0.5

    def test_min_2_cols(self):
        """Hatto 10 savol bo'lsa ham min 2 ustun."""
        L = compute_layout(10)
        assert L["n_cols"] == 2

    def test_max_4_cols(self):
        """200 savol bo'lsa ham max 4 ustun."""
        L = compute_layout(200)
        assert L["n_cols"] == 4


class TestMmToPx:
    def test_span_maps_to_full_width(self):
        """SPAN_W mm = warped_width_px piksel."""
        px = mm_to_px(SPAN_W, 1200)
        assert abs(px - 1200) < 0.01

    def test_col_width_reasonable(self):
        """41mm ustun kengligi 1200px da ~251px bo'lishi kerak."""
        px = mm_to_px(COL_W, 1200)
        # 41 / 196 * 1200 ≈ 251.0
        assert abs(px - (41 / 196 * 1200)) < 0.01

    def test_not_210_divisor(self):
        """XATO: mm/210 ishlatilmaydi — SPAN_W=196 ishlatiladi."""
        px_correct = mm_to_px(100, 1200)
        px_wrong = 100 * 1200 / 210
        assert abs(px_correct - px_wrong) > 10  # sezilarli farq


if __name__ == '__main__':
    import pytest
    pytest.main([__file__, '-v'])
