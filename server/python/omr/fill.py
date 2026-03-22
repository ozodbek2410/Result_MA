"""
Bubble to'ldirilganlik aniqlash.

EvalBee reliability sirlari:
- Adaptive per-row threshold: har qator uchun alohida threshold
  (bir qatorda soya bo'lsa, boshqa qatorlarga ta'sir qilmaydi)
- Fill ratio emas, relative fill: qatordagi eng to'ldirilgan bubble bilan solishtirish
- Multi-select aniqlash: 2 ta bubble bir xil to'lg'an bo'lsa — multi_select
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
    # 1. Har bir cell uchun fill ratio hisoblash
    for cell in cells:
        cell["fill"] = _sample_fill(cell, warped_binary)

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


def _sample_fill(cell: dict, binary: np.ndarray) -> float:
    """
    Bubble markazidan r radius ichidagi qora piksellar nisbati.
    Dastlabki circle mask, keyin countNonZero.
    """
    h, w = binary.shape
    cx, cy, r = int(cell["cx"]), int(cell["cy"]), int(cell["r"])

    # Chegaradan chiqmaslik
    x1 = max(0, cx - r)
    y1 = max(0, cy - r)
    x2 = min(w, cx + r)
    y2 = min(h, cy + r)

    if x2 <= x1 or y2 <= y1:
        return 0.0

    roi = binary[y1:y2, x1:x2]
    mask = np.zeros(roi.shape, dtype=np.uint8)

    local_cx = cx - x1
    local_cy = cy - y1
    cv2.circle(mask, (local_cx, local_cy), r, 255, -1)

    masked = cv2.bitwise_and(roi, roi, mask=mask)
    total_pixels = cv2.countNonZero(mask)
    filled_pixels = cv2.countNonZero(masked)

    return filled_pixels / total_pixels if total_pixels > 0 else 0.0


def _pick_answer(q_cells: list[dict]) -> dict:
    """
    Bitta savol uchun javobni tanlash — adaptive threshold.

    Yondashuv:
    1. Max fill ni topish (eng to'ldirilgan bubble)
    2. Threshold = max(fill) * 0.6 (nisbiy)
    3. Threshold dan yuqori barcha bubble = candidate
    4. 1 candidate = ok, 0 = empty, 2+ = multi
    """
    fills = [c["fill"] for c in q_cells]
    max_fill = max(fills)

    # Agar eng to'ldirilgan bubble ham juda oz — hech kim belgilamagan
    abs_min = SCANNER["fill_ratio_threshold"]
    if max_fill < abs_min:
        return {
            "letter": None,
            "status": "empty",
            "confidence": 0.0,
            "candidates": []
        }

    # Nisbiy threshold: eng to'ldirilganning 60% dan ortiq = candidate
    relative_threshold = max_fill * 0.60

    candidates = [
        c for c in q_cells
        if c["fill"] >= relative_threshold and c["fill"] >= abs_min
    ]

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

    # Multi-select: ikkinchi eng to'ldirilgan max_fill ning 85% dan yuqori bo'lsa
    sorted_cands = sorted(candidates, key=lambda c: c["fill"], reverse=True)
    if sorted_cands[1]["fill"] >= max_fill * 0.85:
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
