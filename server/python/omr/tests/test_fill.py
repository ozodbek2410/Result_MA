"""
fill.py — Adaptive fill detection uchun unit testlar.
Sintetik binary rasm ishlatiladi (haqiqiy kamera rasmi kerak emas).
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import numpy as np
from fill import _pick_answer, _sample_fill, _confidence


def make_cell(letter: str, cx: float, cy: float, r: float, fill: float = 0.0) -> dict:
    return {'q': 1, 'col': 0, 'row': 0, 'letter': letter, 'cx': cx, 'cy': cy, 'r': r, 'fill': fill}


def make_binary_with_circle(w: int, h: int, cx: int, cy: int, r: int, filled: bool) -> np.ndarray:
    """Doirani to'ldirilgan yoki bo'sh qilib binary rasm yaratish."""
    img = np.zeros((h, w), dtype=np.uint8)
    if filled:
        import cv2
        cv2.circle(img, (cx, cy), r, 255, -1)
    return img


class TestPickAnswer:
    def _q_cells(self, fills: list[float]) -> list:
        letters = ['A', 'B', 'C', 'D']
        return [make_cell(letters[i], 100 + i * 15, 100, 8, f) for i, f in enumerate(fills)]

    def test_single_filled(self):
        cells = self._q_cells([0.8, 0.05, 0.04, 0.03])
        r = _pick_answer(cells)
        assert r['letter'] == 'A'
        assert r['status'] == 'ok'
        assert r['confidence'] > 0.5

    def test_all_empty(self):
        cells = self._q_cells([0.05, 0.03, 0.04, 0.02])
        r = _pick_answer(cells)
        assert r['letter'] is None
        assert r['status'] == 'empty'

    def test_multi_select(self):
        """Ikki bubble bir xilda to'ldirilgan = multi."""
        cells = self._q_cells([0.85, 0.82, 0.05, 0.03])
        r = _pick_answer(cells)
        assert r['status'] == 'multi'
        assert r['letter'] is None
        assert 'A' in r['candidates'] and 'B' in r['candidates']

    def test_b_selected(self):
        cells = self._q_cells([0.05, 0.75, 0.06, 0.04])
        r = _pick_answer(cells)
        assert r['letter'] == 'B'

    def test_confidence_high_when_clear(self):
        """Aniq belgilanganda confidence yuqori bo'ladi."""
        cells = self._q_cells([0.9, 0.02, 0.02, 0.02])
        r = _pick_answer(cells)
        assert r['confidence'] > 0.9

    def test_confidence_lower_when_ambiguous(self):
        """Noaniq holatda confidence pastroq."""
        cells = self._q_cells([0.6, 0.45, 0.05, 0.04])
        r = _pick_answer(cells)
        # Birinchisi tanlanadi lekin confidence past
        if r['letter']:
            assert r['confidence'] < 0.9


class TestSampleFill:
    def test_full_circle_high_fill(self):
        """To'liq qora doira = ~1.0 fill."""
        import cv2
        img = np.zeros((200, 200), dtype=np.uint8)
        cv2.circle(img, (100, 100), 15, 255, -1)
        cell = make_cell('A', 100, 100, 15)
        fill = _sample_fill(cell, img)
        assert fill > 0.85

    def test_empty_circle_zero_fill(self):
        """Bo'sh doira = ~0.0 fill."""
        img = np.zeros((200, 200), dtype=np.uint8)
        cell = make_cell('A', 100, 100, 15)
        fill = _sample_fill(cell, img)
        assert fill < 0.05

    def test_out_of_bounds_safe(self):
        """Chegaradan tashqari cell xato bermasligi kerak."""
        img = np.zeros((50, 50), dtype=np.uint8)
        cell = make_cell('A', 5, 5, 20)  # r=20 > chegaradan chiqadi
        fill = _sample_fill(cell, img)
        assert 0.0 <= fill <= 1.0


class TestConfidence:
    def test_clear_winner(self):
        """0.9 vs 0.1 → confidence ~0.9."""
        c = _confidence(0.9, [0.9, 0.1, 0.05, 0.05])
        assert c > 0.8

    def test_close_competition(self):
        """0.6 vs 0.55 → confidence ~0.52."""
        c = _confidence(0.6, [0.6, 0.55, 0.05, 0.03])
        assert c < 0.6

    def test_zero_fills(self):
        """Hamma 0.0 → confidence 0.0."""
        c = _confidence(0.0, [0.0, 0.0, 0.0, 0.0])
        assert c == 0.0


if __name__ == '__main__':
    import pytest
    pytest.main([__file__, '-v'])
