"""
corners.py — Corner detection va perspektiv tuzatish uchun unit testlar.
Sintetik A4-ko'rinishidagi rasm: 4 burchakda qora kvadratlar.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import numpy as np
import cv2
from corners import find_corners, warp_perspective, _pick_four_corners
from config import SPAN_W, SPAN_H, SCANNER


def make_synthetic_sheet(w: int = 800, h: int = 1131,
                          mark_size: int = 30, margin: int = 10,
                          angle_deg: float = 0.0,
                          noise: bool = False) -> np.ndarray:
    """
    A4 nisbatida sintetik grayscale rasm.
    4 burchakda qora kvadrat markerlar joylashtiriladi.
    angle_deg != 0 bo'lsa rasm biroz buriladi (perspektiv simulatsiya uchun).
    """
    img = np.ones((h, w), dtype=np.uint8) * 220  # oq fon

    # 4 burchak markerlar
    positions = [
        (margin, margin),                          # top-left
        (w - margin - mark_size, margin),          # top-right
        (w - margin - mark_size, h - margin - mark_size),  # bottom-right
        (margin, h - margin - mark_size),          # bottom-left
    ]
    for x, y in positions:
        img[y:y+mark_size, x:x+mark_size] = 0  # qora marker

    if noise:
        # Random noise qo'shish
        rng = np.random.default_rng(42)
        noise_arr = rng.integers(0, 30, img.shape, dtype=np.uint8)
        img = np.clip(img.astype(np.int16) - noise_arr, 0, 255).astype(np.uint8)

    if angle_deg != 0.0:
        cx, cy = w / 2, h / 2
        M = cv2.getRotationMatrix2D((cx, cy), angle_deg, 1.0)
        img = cv2.warpAffine(img, M, (w, h), borderValue=200)

    return img


class TestFindCorners:
    def test_clean_sheet_finds_4_corners(self):
        """Toza rasmda 4 ta burchak topiladi."""
        gray = make_synthetic_sheet()
        corners = find_corners(gray)
        assert corners is not None, "4 burchak topilmadi"
        assert corners.shape == (4, 2)

    def test_corners_in_correct_zones(self):
        """Har bir burchak to'g'ri zonada (TL, TR, BR, BL)."""
        gray = make_synthetic_sheet()
        corners = find_corners(gray)
        assert corners is not None
        h, w = gray.shape

        tl, tr, br, bl = corners
        # TL: chap va yuqori
        assert tl[0] < w * 0.5 and tl[1] < h * 0.5, f"TL noto'g'ri: {tl}"
        # TR: o'ng va yuqori
        assert tr[0] > w * 0.5 and tr[1] < h * 0.5, f"TR noto'g'ri: {tr}"
        # BR: o'ng va pastki
        assert br[0] > w * 0.5 and br[1] > h * 0.5, f"BR noto'g'ri: {br}"
        # BL: chap va pastki
        assert bl[0] < w * 0.5 and bl[1] > h * 0.5, f"BL noto'g'ri: {bl}"

    def test_noisy_sheet_still_detected(self):
        """Shovqinli rasmda ham burchaklar topiladi."""
        gray = make_synthetic_sheet(noise=True)
        corners = find_corners(gray)
        assert corners is not None, "Shovqinli rasmda burchak topilmadi"

    def test_slightly_rotated_sheet(self):
        """3 daraja burilgan rasmda ham burchaklar topiladi."""
        gray = make_synthetic_sheet(angle_deg=3.0)
        corners = find_corners(gray)
        assert corners is not None, "3° burilgan rasmda burchak topilmadi"

    def test_returns_none_for_blank_image(self):
        """Bo'sh (oq) rasmda burchak topilmasligi kerak."""
        gray = np.ones((800, 600), dtype=np.uint8) * 200
        corners = find_corners(gray)
        assert corners is None, "Bo'sh rasmda noto'g'ri burchak topildi"

    def test_returns_none_for_1_corner(self):
        """Faqat 1 ta marker bo'lsa None qaytadi."""
        gray = np.ones((800, 600), dtype=np.uint8) * 200
        gray[10:40, 10:40] = 0  # faqat 1 ta marker
        corners = find_corners(gray)
        assert corners is None, "1 ta marker bilan noto'g'ri burchak topildi"


class TestWarpPerspective:
    def test_output_shape_correct(self):
        """Warp natijasi to'g'ri o'lchamda bo'lishi kerak."""
        gray = make_synthetic_sheet()
        color = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        corners = find_corners(gray)
        assert corners is not None

        warped = warp_perspective(color, corners)
        target_w = SCANNER["target_width_px"]
        target_h = int(target_w * SPAN_H / SPAN_W)

        assert warped.shape[1] == target_w, f"Kenglik {warped.shape[1]} != {target_w}"
        assert warped.shape[0] == target_h, f"Balandlik {warped.shape[0]} != {target_h}"

    def test_warp_is_3channel(self):
        """Warp natijasi BGR (3 kanal) bo'lishi kerak."""
        gray = make_synthetic_sheet()
        color = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        corners = find_corners(gray)
        assert corners is not None
        warped = warp_perspective(color, corners)
        assert len(warped.shape) == 3 and warped.shape[2] == 3

    def test_warp_not_empty(self):
        """Warp natijasi bo'sh (qora) bo'lmasligi kerak."""
        gray = make_synthetic_sheet()
        color = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        corners = find_corners(gray)
        warped = warp_perspective(color, corners)
        # O'rtacha piksel qiymati 50 dan yuqori bo'lishi kerak (oq fon dominant)
        assert warped.mean() > 50, "Warp natijasi juda qora — perspektiv tuzatish xato"


class TestPickFourCorners:
    def _make_squares(self, w: int = 800, h: int = 600) -> list:
        m = 20
        return [
            (m, m, 400),          # TL
            (w - m, m, 400),      # TR
            (w - m, h - m, 400),  # BR
            (m, h - m, 400),      # BL
        ]

    def test_correct_4_corners(self):
        """4 ta aniq burchakdan to'g'ri natija."""
        squares = self._make_squares()
        result = _pick_four_corners(squares, 800, 600)
        assert result is not None
        assert result.shape == (4, 2)

    def test_extra_squares_filtered(self):
        """Ortiqcha kvadratlar (shovqin) filtrlanadi."""
        squares = self._make_squares()
        squares += [(400, 300, 50), (200, 300, 30)]  # ichki shovqin
        result = _pick_four_corners(squares, 800, 600)
        assert result is not None
        assert result.shape == (4, 2)

    def test_missing_corner_returns_none(self):
        """Bir burchak yo'q bo'lsa None qaytadi."""
        squares = self._make_squares()[:3]  # faqat 3 ta
        result = _pick_four_corners(squares, 800, 600)
        assert result is None, "3 ta marker bilan None qaytmadi"


if __name__ == '__main__':
    import pytest
    pytest.main([__file__, '-v'])
