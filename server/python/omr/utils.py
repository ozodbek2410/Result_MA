"""
Rasm preprocessingi va debug yordamchi funksiyalar.
EvalBee reliability sirlari: CLAHE, GaussianBlur, Canny, multi-threshold.
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
        scale   — qisqartirish koeffitsienti
    """
    tw = target_width or SCANNER["target_width_px"]

    color = cv2.imread(image_path)
    if color is None:
        raise FileNotFoundError(f"Rasm topilmadi: {image_path}")

    h, w = color.shape[:2]
    scale = tw / w if w > tw else 1.0
    if scale < 1.0:
        color = cv2.resize(color, (tw, int(h * scale)), interpolation=cv2.INTER_AREA)

    gray = cv2.cvtColor(color, cv2.COLOR_BGR2GRAY)

    clahe = cv2.createCLAHE(
        clipLimit=SCANNER["clahe_clip_limit"],
        tileGridSize=(SCANNER["clahe_tile_grid"], SCANNER["clahe_tile_grid"])
    )
    gray = clahe.apply(gray)

    return gray, color, scale


# ─── EvalBee-style preprocessing helpers ─────────────────────────────────────


def gaussian_blur(gray: np.ndarray) -> np.ndarray:
    """GaussianBlur (5×5) — EvalBee Qadam 2: shovqinni kamaytirish."""
    return cv2.GaussianBlur(gray, (5, 5), 0)


def canny_binary(gray: np.ndarray) -> np.ndarray:
    """
    Canny Edge Detection — EvalBee Qadam 2.
    GaussianBlur → Canny(75, 200) → dilate (chiziqlarni birlashtirish).
    """
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 75, 200)
    kernel = np.ones((3, 3), np.uint8)
    return cv2.dilate(edges, kernel, iterations=1)


# ─── Corner estimation & validation ──────────────────────────────────────────


def estimate_missing_corner(
    known: dict[str, tuple], missing_key: str
) -> tuple[float, float]:
    """
    3 burchakdan 4-chisini parallelogram formulasi bilan hisoblash.
    missing = adj1 + adj2 - opposite

    Args:
        known: {"tl": (x,y), "tr": (x,y), ...} — kamida 3 ta
        missing_key: "tl" | "tr" | "br" | "bl"
    Returns:
        (x, y) estimated coordinates
    """
    opposites = {"tl": "br", "tr": "bl", "br": "tl", "bl": "tr"}
    adjacents = {
        "tl": ("tr", "bl"), "tr": ("tl", "br"),
        "br": ("tr", "bl"), "bl": ("tl", "br"),
    }

    opp_key = opposites[missing_key]
    adj1_key, adj2_key = adjacents[missing_key]

    # Get coordinates (handle both tuple and dict-with-extras formats)
    def _pt(k):
        v = known[k]
        return (v[0], v[1]) if isinstance(v, (tuple, list)) else (v["x"], v["y"])

    opp = _pt(opp_key)
    adj1 = _pt(adj1_key)
    adj2 = _pt(adj2_key)

    # Parallelogram: missing = adj1 + adj2 - opposite
    x = adj1[0] + adj2[0] - opp[0]
    y = adj1[1] + adj2[1] - opp[1]
    return (x, y)


def validate_rectangle(
    pts: np.ndarray, img_w: int, img_h: int
) -> bool:
    """
    4 burchak to'g'ri to'rtburchak hosil qilishini tekshirish.
    - Har tomon > 25% img min dimension
    - Width/Height ratio 0.4 — 1.2 (A4 = 0.707)
    - Parallellik: qarama-qarshi tomonlar ±40% farq
    """
    if pts is None or len(pts) != 4:
        return False

    # Sort: [tl, tr, br, bl]
    sorted_pts = sort_corners(pts)
    tl, tr, br, bl = sorted_pts

    # Tomonlar
    top_w = np.linalg.norm(tr - tl)
    bot_w = np.linalg.norm(br - bl)
    left_h = np.linalg.norm(bl - tl)
    right_h = np.linalg.norm(br - tr)

    min_dim = min(img_w, img_h) * 0.25

    if top_w < min_dim or bot_w < min_dim:
        return False
    if left_h < min_dim or right_h < min_dim:
        return False

    # Aspect ratio
    avg_w = (top_w + bot_w) / 2
    avg_h = (left_h + right_h) / 2
    if avg_h < 1:
        return False
    aspect = avg_w / avg_h
    if not (0.50 < aspect < 0.95):  # A4=0.707, telefon perspektivi uchun keng
        return False

    # Parallellik — telefon burchakdan olsa tomonlar farq qiladi
    w_ratio = min(top_w, bot_w) / max(top_w, bot_w)
    h_ratio = min(left_h, right_h) / max(left_h, right_h)
    if w_ratio < 0.70 or h_ratio < 0.70:
        return False

    # Diagonal tekshiruv — ikkala diagonal ham ±30% farq qilmasligi kerak
    diag1 = np.linalg.norm(br - tl)
    diag2 = np.linalg.norm(bl - tr)
    diag_ratio = min(diag1, diag2) / max(diag1, diag2)
    if diag_ratio < 0.70:
        return False

    # Y-alignment: tepa ikki burchak TAXMINAN bir balandlikda bo'lishi kerak
    # Aks holda bu A4 emas — noto'g'ri kontur topilgan
    # max 20% img height farq (perspektiv bilan ham bunday katta bo'lmaydi)
    max_y_diff = max(img_h, img_w) * 0.20
    if abs(float(tl[1]) - float(tr[1])) > max_y_diff:
        return False
    if abs(float(bl[1]) - float(br[1])) > max_y_diff:
        return False

    # X-alignment: chap ikki burchak taxminan bir X da
    max_x_diff = max(img_h, img_w) * 0.20
    if abs(float(tl[0]) - float(bl[0])) > max_x_diff:
        return False
    if abs(float(tr[0]) - float(br[0])) > max_x_diff:
        return False

    return True


def deduplicate_candidates(
    candidates: list[tuple], min_dist: float
) -> list[tuple]:
    """
    Yaqin kandidatlarni birlashtirish — eng yaxshisini saqlash.
    Har bir kandidat: (cx, cy, area, fill, solidity)
    """
    if not candidates:
        return []

    # Score bo'yicha saralash (area * fill * solidity) — eng yaxshi birinchi
    scored = sorted(candidates, key=lambda c: c[2] * c[3] * c[4], reverse=True)
    result = []
    used = [False] * len(scored)

    for i in range(len(scored)):
        if used[i]:
            continue
        result.append(scored[i])
        # Yaqinlarini o'chirish
        for j in range(i + 1, len(scored)):
            if used[j]:
                continue
            dx = scored[i][0] - scored[j][0]
            dy = scored[i][1] - scored[j][1]
            dist = (dx * dx + dy * dy) ** 0.5
            if dist < min_dist:
                used[j] = True

    return result


# ─── Multi-threshold (expanded) ──────────────────────────────────────────────


def multi_threshold(gray: np.ndarray, thresholds: list = None) -> list[np.ndarray]:
    """
    Bir nechta threshold bilan binary rasmlar yaratish.
    GaussianBlur har biriga qo'llaniladi + Canny + Otsu + Adaptive.
    """
    thresholds = thresholds or SCANNER["corner_thresholds"]
    blurred = gaussian_blur(gray)
    results = []

    for t in thresholds:
        _, binary = cv2.threshold(blurred, t, 255, cv2.THRESH_BINARY_INV)
        results.append(binary)

    # Otsu
    _, otsu = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    results.append(otsu)

    # Adaptive threshold — soya tushgan rasmlarda eng ishonchli
    adaptive = cv2.adaptiveThreshold(
        blurred, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=51, C=10
    )
    results.append(adaptive)

    # Canny-based binary
    results.append(canny_binary(gray))

    # CLAHE(3.0) + Otsu — qorong'u rasmlarda
    clahe_strong = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4))
    enhanced = clahe_strong.apply(gray)
    _, clahe_otsu = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    results.append(clahe_otsu)

    return results


# ─── Sort corners ────────────────────────────────────────────────────────────


def sort_corners(pts: np.ndarray) -> np.ndarray:
    """4 ta nuqtani [top-left, top-right, bottom-right, bottom-left] tartibida saralash."""
    pts = pts.reshape(4, 2).astype(np.float32)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1)
    return np.array([
        pts[np.argmin(s)],   # top-left
        pts[np.argmin(d)],   # top-right
        pts[np.argmax(s)],   # bottom-right
        pts[np.argmax(d)],   # bottom-left
    ], dtype=np.float32)


# ─── Debug ────────────────────────────────────────────────────────────────────


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
