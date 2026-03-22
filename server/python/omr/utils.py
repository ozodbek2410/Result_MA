"""
Rasm preprocessingi va debug yordamchi funksiyalar.
CLAHE — qorong'u/soyali rasmlarda kontrast kuchaytirish (EvalBee reliability siri #1).
"""
import cv2
import numpy as np
from config import SCANNER


def load_and_preprocess(image_path: str, target_width: int = None) -> tuple[np.ndarray, np.ndarray, float]:
    """
    Rasmni yuklash, o'lchamini qisqartirish, CLAHE kontrast kuchaytirish.

    Returns:
        gray    — grayscale, CLAHE qo'llanilgan
        color   — BGR, o'lcham qisqartirilgan
        scale   — qisqartirish koeffitsienti (original piksel → scaled piksel)
    """
    tw = target_width or SCANNER["target_width_px"]

    color = cv2.imread(image_path)
    if color is None:
        raise FileNotFoundError(f"Rasm topilmadi: {image_path}")

    # O'lchamni qisqartirish (tezlik uchun, sifat yo'qotilmaydi)
    h, w = color.shape[:2]
    scale = tw / w if w > tw else 1.0
    if scale < 1.0:
        color = cv2.resize(color, (tw, int(h * scale)), interpolation=cv2.INTER_AREA)

    gray = cv2.cvtColor(color, cv2.COLOR_BGR2GRAY)

    # CLAHE — lokal kontrast kuchaytirish
    # clipLimit=2.0: o'ta keskinlashtirishni oldini oladi (artifact yo'q)
    # tileGridSize=(8,8): 8x8 mintaqalarda alohida hisoblash → soya muammosini hal qiladi
    clahe = cv2.createCLAHE(
        clipLimit=SCANNER["clahe_clip_limit"],
        tileGridSize=(SCANNER["clahe_tile_grid"], SCANNER["clahe_tile_grid"])
    )
    gray = clahe.apply(gray)

    return gray, color, scale


def multi_threshold(gray: np.ndarray, thresholds: list = None) -> list[np.ndarray]:
    """
    Bir nechta threshold qiymatlari bilan binary rasm yaratish.
    EvalBee reliability siri #4: bitta threshold fail bo'lganda boshqasi ishlaydi.
    """
    thresholds = thresholds or SCANNER["corner_thresholds"]
    results = []
    for t in thresholds:
        _, binary = cv2.threshold(gray, t, 255, cv2.THRESH_BINARY_INV)
        results.append(binary)

    # Otsu ham qo'shamiz
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    results.append(otsu)

    # Adaptive threshold — soya tushgan rasmlarda eng ishonchli
    adaptive = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=51, C=10
    )
    results.append(adaptive)

    return results


def sort_corners(pts: np.ndarray) -> np.ndarray:
    """
    4 ta nuqtani [top-left, top-right, bottom-right, bottom-left] tartibida saralash.
    """
    pts = pts.reshape(4, 2).astype(np.float32)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1)
    return np.array([
        pts[np.argmin(s)],   # top-left
        pts[np.argmin(d)],   # top-right
        pts[np.argmax(s)],   # bottom-right
        pts[np.argmax(d)],   # bottom-left
    ], dtype=np.float32)


def draw_debug(img: np.ndarray, corners=None, grid_cells=None, filled=None) -> np.ndarray:
    """Debug rasmi yaratish — corners va grid ko'rsatish."""
    dbg = img.copy() if len(img.shape) == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    if corners is not None:
        for pt in corners:
            cv2.circle(dbg, (int(pt[0]), int(pt[1])), 8, (0, 255, 0), -1)

    if grid_cells is not None:
        for (x, y, r) in grid_cells:
            color = (0, 0, 255) if (filled and (x, y) in filled) else (255, 0, 0)
            cv2.circle(dbg, (int(x), int(y)), int(r), color, 1)

    return dbg
