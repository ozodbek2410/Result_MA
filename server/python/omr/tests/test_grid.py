"""
grid.py — Layout-first grid qurish uchun unit testlar.
Asosiy tekshiruv: bubble pozitsiyalari to'g'ri hisoblanadi.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import numpy as np
from grid import build_grid
from config import mm_to_px, HEADER_H, PAGE_PAD, BUBBLE


WARPED_W = 1200
FAKE_GRAY = np.zeros((int(WARPED_W * 297 / 196), WARPED_W), dtype=np.uint8)


class TestBuildGrid:
    def _grid(self, q: int) -> list:
        return build_grid(FAKE_GRAY, q)

    def test_cell_count(self):
        """Har savol uchun 4 ta cell (A,B,C,D)."""
        cells = self._grid(30)
        assert len(cells) == 30 * 4

    def test_90q_cell_count(self):
        cells = self._grid(90)
        assert len(cells) == 90 * 4

    def test_letters_abcd(self):
        """Har savolda A,B,C,D harflari bor."""
        cells = self._grid(10)
        for q_num in range(1, 11):
            q_cells = [c for c in cells if c['q'] == q_num]
            letters = {c['letter'] for c in q_cells}
            assert letters == {'A', 'B', 'C', 'D'}

    def test_grid_top_at_header(self):
        """Birinchi qator markazining Y koordinatasi header_h + row_h/2 bo'lishi kerak."""
        cells = self._grid(30)
        q1_cells = [c for c in cells if c['q'] == 1]
        min_y = min(c['cy'] for c in q1_cells)
        header_px = mm_to_px(HEADER_H, WARPED_W)
        assert min_y > header_px, f"Grid top {min_y} header {header_px} dan katta bo'lishi kerak"

    def test_grid_left_at_padding(self):
        """Birinchi ustunning chap chekkasi PAGE_PAD dan boshlanadi."""
        cells = self._grid(30)
        q1_cells = [c for c in cells if c['q'] == 1]
        min_x = min(c['cx'] for c in q1_cells)
        pad_px = mm_to_px(PAGE_PAD, WARPED_W)
        assert min_x > pad_px, f"Grid left {min_x} padding {pad_px} dan katta bo'lishi kerak"

    def test_bubble_radius_positive(self):
        """Bubble radius musbat bo'lishi kerak."""
        cells = self._grid(30)
        for c in cells:
            assert c['r'] > 0

    def test_abcd_x_order(self):
        """A < B < C < D x koordinatalari bo'yicha."""
        cells = self._grid(10)
        q1 = sorted([c for c in cells if c['q'] == 1], key=lambda c: c['letter'])
        xs = [c['cx'] for c in q1]
        # A, B, C, D — sorted by letter
        abcd = {c['letter']: c['cx'] for c in q1}
        assert abcd['A'] < abcd['B'] < abcd['C'] < abcd['D']

    def test_sequential_rows_increasing_y(self):
        """Qatorlar pastga ketishi kerak (Y oshadi)."""
        cells = self._grid(30)
        col0 = [c for c in cells if c['col'] == 0 and c['letter'] == 'A']
        ys = [c['cy'] for c in sorted(col0, key=lambda c: c['q'])]
        for i in range(1, len(ys)):
            assert ys[i] > ys[i-1], f"Y[{i}]={ys[i]} > Y[{i-1}]={ys[i-1]} bo'lishi kerak"


if __name__ == '__main__':
    import pytest
    pytest.main([__file__, '-v'])
