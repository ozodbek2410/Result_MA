"""
Bubble to'ldirilganlik aniqlash — EvalBee-level aniqlik.

False positive yo'qotish uchun 3 ta yondashuv:
1. Inner sampling (r * 0.7) — bubble chizig'ini o'tkazib yuborish
2. Per-row baseline subtraction — soya/yoritish farqi avtomatik yo'qoladi
3. Yuqori threshold (0.50) — bo'sh bubble hech qachon "to'ldirilgan" bo'lmaydi
"""
import cv2
import numpy as np
from config import SCANNER


def detect_fills(cells: list[dict], warped_binary: np.ndarray) -> dict:
    """
    Har bir savol uchun javobni aniqlash.

    Returns:
        {q_num: {"letter": "A"|"B"|"C"|"D"|None,
                 "status": "ok"|"empty"|"multi",
                 "confidence": float,
                 "candidates": list}}
    """
    inner_ratio = SCANNER.get("fill_inner_ratio", 0.7)

    # 1. Har bir cell uchun fill ratio hisoblash
    for cell in cells:
        cell["fill"] = _sample_fill(cell, warped_binary, inner_ratio)

    # 2. Savollar bo'yicha guruhlash
    questions = {}
    for cell in cells:
        q = cell["q"]
        if q not in questions:
            questions[q] = []
        questions[q].append(cell)

    # 3. Per-question adaptive threshold bilan javob aniqlash
    results = {}
    for q, q_cells in questions.items():
        results[q] = _pick_answer(q_cells)

    return results


def _sample_fill(cell: dict, binary: np.ndarray, inner_ratio: float = 0.7) -> float:
    """
    Bubble markazidan ICHKI radius ichidagi qora piksellar nisbati.

    inner_ratio = 0.7: faqat ichki 70% ni tekshiradi.
    Bu bubble chizig'ini (border) o'tkazib yuboradi —
    bo'sh bubble da fill ≈ 0.05, to'ldirilganda ≈ 0.60+.
    """
    h, w = binary.shape
    cx, cy = int(cell["cx"]), int(cell["cy"])
    r = int(cell["r"])

    # INNER sampling — bubble borderini skip qilish
    inner_r = max(2, int(r * inner_ratio))

    x1 = max(0, cx - inner_r)
    y1 = max(0, cy - inner_r)
    x2 = min(w, cx + inner_r)
    y2 = min(h, cy + inner_r)

    if x2 <= x1 or y2 <= y1:
        return 0.0

    roi = binary[y1:y2, x1:x2]
    mask = np.zeros(roi.shape, dtype=np.uint8)

    local_cx = cx - x1
    local_cy = cy - y1
    cv2.circle(mask, (local_cx, local_cy), inner_r, 255, -1)

    masked = cv2.bitwise_and(roi, roi, mask=mask)
    total_pixels = cv2.countNonZero(mask)
    filled_pixels = cv2.countNonZero(masked)

    return filled_pixels / total_pixels if total_pixels > 0 else 0.0


def _pick_answer(q_cells: list[dict]) -> dict:
    """
    Bitta savol uchun javobni tanlash — EvalBee-level adaptive threshold.

    1. Per-row baseline subtraction: min fill = "bo'sh bubble darajasi"
    2. Adjusted fill = fill - baseline
    3. Agar hech biri baseline dan 15%+ farq qilmasa → empty
    4. Qolgan logika adjusted fills bilan ishlaydi
    """
    fills = [c["fill"] for c in q_cells]

    # Per-row baseline — eng kam to'ldirilgan bubble = "bo'sh" darajasi
    baseline = min(fills)

    # Adjusted fills — baseline ni ayirish
    adjusted = [f - baseline for f in fills]
    max_adjusted = max(adjusted)

    # Hech biri baseline dan sezilarli farq qilmasa → empty
    # 0.35 = qog'oz teksturasi/soya 0.30 gacha, qalam belgi 0.45+ → 0.35 xavfsiz
    if max_adjusted < 0.35:
        return {
            "letter": None,
            "status": "empty",
            "confidence": 0.0,
            "candidates": []
        }

    # Absolute threshold ham tekshirish
    abs_min = SCANNER.get("fill_ratio_threshold", 0.50)
    max_fill = max(fills)
    if max_fill < abs_min and max_adjusted < 0.40:
        return {
            "letter": None,
            "status": "empty",
            "confidence": 0.0,
            "candidates": []
        }

    # Nisbiy threshold: eng to'ldirilganning 60% dan ortiq = candidate
    relative_threshold = max_adjusted * 0.60

    candidates = []
    for i, c in enumerate(q_cells):
        if adjusted[i] >= relative_threshold and adjusted[i] >= 0.20:
            candidates.append(c)

    if len(candidates) == 0:
        return {"letter": None, "status": "empty", "confidence": 0.0, "candidates": []}

    if len(candidates) == 1:
        letter = candidates[0]["letter"]
        confidence = _confidence(candidates[0]["fill"], fills)
        return {
            "letter": letter,
            "status": "ok",
            "confidence": round(confidence, 3),
            "candidates": [letter]
        }

    # Multi-select: ikkinchi eng to'ldirilgan max_adjusted ning 85% dan yuqori bo'lsa
    sorted_cands = sorted(candidates, key=lambda c: c["fill"], reverse=True)
    cand_adjusted = [c["fill"] - baseline for c in sorted_cands]

    if len(cand_adjusted) >= 2 and cand_adjusted[1] >= max_adjusted * 0.85:
        candidate_letters = [c["letter"] for c in sorted_cands]
        return {
            "letter": None,
            "status": "multi",
            "confidence": 0.0,
            "candidates": candidate_letters
        }

    # Birinchisi aniq to'ldirilgan
    letter = sorted_cands[0]["letter"]
    confidence = _confidence(sorted_cands[0]["fill"], fills)
    return {
        "letter": letter,
        "status": "ok",
        "confidence": round(confidence, 3),
        "candidates": [letter]
    }


def _confidence(fill: float, all_fills: list[float]) -> float:
    """
    Javob ishonchlilik darajasi (0.0-1.0).
    fill / (fill + ikkinchi_eng_yuqori) — qanchalik ajralib turishi.
    """
    sorted_fills = sorted(all_fills, reverse=True)
    best = sorted_fills[0]
    second = sorted_fills[1] if len(sorted_fills) > 1 else 0
    if best + second == 0:
        return 0.0
    return best / (best + second)
