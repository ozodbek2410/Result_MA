"""
Bubble to'ldirilganlik aniqlash — EvalBee-level aniqlik.

False positive yo'qotish uchun 3 ta yondashuv:
1. Inner sampling (r * 0.78) — bubble chizig'ini o'tkazib yuborish
2. Per-row baseline subtraction — soya/yoritish farqi avtomatik yo'qoladi
3. Adaptive threshold — qora va ko'k qalam ikkalasini ham qo'llab-quvvatlaydi

M-15 FIX: Ko'k qalam uchun fill_ratio_threshold 0.30 ga tushirildi (omr_config.json).
M-14 FIX: ratio_mode trigger 0.50→0.30 — o'rtacha kontrast marklar ham topiladi.
M-16 FIX: Multi-select threshold 0.85→0.75 — ikki aniq belgi multi sifatida topiladi.
M-18 FIX: Ikki marta tekshiruv birlashtirildi — mantiq soddalashtrildi.
"""
import cv2
import numpy as np
from config import SCANNER


def detect_fills(cells: list[dict], warped_binary: np.ndarray) -> dict:
    """
    Har bir savol uchun javobni aniqlash (eski API — layout cell pozitsiyalari).

    Yangi pipeline uchun `detect_fills_from_mapped()` ni ishlating.

    Returns:
        {q_num: {"letter": "A"|"B"|"C"|"D"|None,
                 "status": "ok"|"empty"|"multi",
                 "confidence": float,
                 "candidates": list}}
    """
    inner_ratio = SCANNER.get("fill_inner_ratio", 0.78)

    # 1. Har bir cell uchun fill ratio hisoblash
    for cell in cells:
        cell["fill"] = _sample_fill(cell, warped_binary, inner_ratio)

    # 2. Savollar bo'yicha guruhlash
    questions: dict[int, list[dict]] = {}
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


def detect_fills_from_mapped(mapped_cells: list[dict], warped_binary: np.ndarray) -> dict:
    """
    Yangi API — MappedCell (contour'dan haqiqiy pozitsiya bilan) ishlaydi.

    Bu funksiya contour-based pipeline'ning eng oxirgi bosqichi:
        build_grid → find_bubble_contours → map_contours_to_cells → detect_fills_from_mapped

    Layout fall qilgan bo'lsa (matched=False), cell o'z layout pozitsiyasini ishlatadi
    (degraded mode). Aks holda contour'dan kelgan actual_cx/actual_cy/actual_r.

    Algoritm bir xil — fill ratio + per-row baseline + ratio_mode/normal_mode.
    Faqat sampling pozitsiyasi farq qiladi.

    Args:
        mapped_cells: mapper.map_contours_to_cells() natijasi:
                      [{"q", "col", "row", "letter",
                        "actual_cx", "actual_cy", "actual_r", "matched", ...}, ...]
        warped_binary: Otsu THRESH_BINARY_INV natijasi (255 = ink/dark)

    Returns:
        Bir xil format detect_fills() bilan
    """
    inner_ratio = SCANNER.get("fill_inner_ratio", 0.78)

    # 1. Sampling cell adapter — actual_cx/cy/r ni cx/cy/r sifatida ishlatish
    # Original mapped_cells ni o'zgartirmaslik uchun yangi list
    sampled_cells = []
    for mc in mapped_cells:
        sc = {
            "q": mc["q"],
            "col": mc["col"],
            "row": mc["row"],
            "letter": mc["letter"],
            "cx": mc["actual_cx"],
            "cy": mc["actual_cy"],
            "r": mc["actual_r"],
        }
        sc["fill"] = _sample_fill(sc, warped_binary, inner_ratio)
        sampled_cells.append(sc)

    # 2. Savollar bo'yicha guruhlash
    questions: dict[int, list[dict]] = {}
    for cell in sampled_cells:
        q = cell["q"]
        if q not in questions:
            questions[q] = []
        questions[q].append(cell)

    # 3. Per-question javob aniqlash — eski _pick_answer qayta ishlatiladi
    results = {}
    for q, q_cells in questions.items():
        results[q] = _pick_answer(q_cells)

    return results


def _sample_fill(cell: dict, binary: np.ndarray, inner_ratio: float = 0.78) -> float:
    """
    Bubble markazidan ICHKI radius ichidagi qora piksellar nisbati.

    inner_ratio = 0.78: faqat ichki 78% ni tekshiradi.
    Bu bubble chizig'ini (border) o'tkazib yuboradi —
    bo'sh bubble da fill ≈ 0.05, to'ldirilganda ≈ 0.60+.
    Ko'k qalam: to'ldirilganda ≈ 0.30–0.50.
    """
    h, w = binary.shape
    cx, cy = int(cell["cx"]), int(cell["cy"])
    r = int(cell["r"])

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
    Bitta savol uchun javobni tanlash.

    Algoritm:
    1. Per-row baseline subtraction: min fill = "bo'sh bubble darajasi"
    2. adjusted fill = fill - baseline (ifodalangan farq)
    3. Agar max_adjusted < 0.30 → ratio_mode (past kontrast: ko'k qalam, soya)
    4. ratio_mode da: max_fill >= abs_min (0.30) AND ratio >= 1.5 → haqiqiy belgi
    5. Candidate tanlash → multi-select tekshirish (0.75 threshold)

    Qora qalam:  fill ≈ 0.60–0.90, ajralib turadi, baseline path o'tadi
    Ko'k qalam:  fill ≈ 0.30–0.50, ratio_mode orqali topiladi
    Bo'sh:        fill ≈ 0.03–0.10, barcha tekshiruvlardan o'tmaydi
    """
    fills = [c["fill"] for c in q_cells]

    # Per-row baseline — eng kam to'ldirilgan bubble = "bo'sh" darajasi
    baseline = min(fills)
    adjusted = [f - baseline for f in fills]
    max_adjusted = max(adjusted)

    _EMPTY = {"letter": None, "status": "empty", "confidence": 0.0, "candidates": []}

    # Config dan abs threshold (default 0.30 — ko'k qalam uchun yetarli)
    abs_min = SCANNER.get("fill_ratio_threshold", 0.30)

    # Ko'k qalam va soyali rasmlarda adjusted farq kichik bo'ladi.
    # M-14/M-15 FIX: 0.50 → 0.30 — past kontrast marklar ham topiladi.
    if max_adjusted < 0.30:
        max_fill_val = max(fills)
        max_fill_idx = fills.index(max_fill_val)
        others = [fills[i] for i in range(len(fills)) if i != max_fill_idx]
        avg_others = sum(others) / len(others) if others else 0.0

        # M-15 FIX: abs threshold 0.48→abs_min(0.30), avg_others 0.05→0.03, ratio 1.8→1.5
        # Ko'k qalam: fill ~0.35, others ~0.08, ratio ~4.4 ≥ 1.5 → topiladi
        if (max_fill_val >= abs_min
                and avg_others > 0.03
                and max_fill_val / avg_others >= 1.5):
            # ratio_mode: adjusted thresholdlar pastroq
            rel_min_adj = 0.12
            relative_threshold = max(max_adjusted * 0.60, rel_min_adj)
            candidates = [
                c for i, c in enumerate(q_cells)
                if adjusted[i] >= relative_threshold and adjusted[i] >= rel_min_adj
            ]
            if not candidates:
                return _EMPTY
            return _finalize(candidates, baseline, max_adjusted, fills)
        else:
            return _EMPTY

    # Normal mode: max_adjusted >= 0.30 — ajralib turuvchi belgi
    # M-18 FIX: ikki marta tekshiruv bitta shartga birlashtirildi
    if max(fills) < abs_min:
        return _EMPTY

    rel_min_adj = 0.18
    relative_threshold = max(max_adjusted * 0.60, rel_min_adj)

    candidates = [
        c for i, c in enumerate(q_cells)
        if adjusted[i] >= relative_threshold and adjusted[i] >= rel_min_adj
    ]

    if not candidates:
        return _EMPTY

    return _finalize(candidates, baseline, max_adjusted, fills)


def _finalize(candidates: list[dict], baseline: float,
              max_adjusted: float, all_fills: list[float]) -> dict:
    """
    Candidate ro'yxatidan yakuniy javob tanlash.
    Bitta → ok.
    Ikki yoki ko'p → multi-select tekshirish.
    """
    if len(candidates) == 1:
        letter = candidates[0]["letter"]
        confidence = _confidence(candidates[0]["fill"], all_fills)
        return {
            "letter": letter,
            "status": "ok",
            "confidence": round(confidence, 3),
            "candidates": [letter],
        }

    # Multi-select: ikkinchi kandidat birinchining 75% dan yuqori bo'lsa
    # M-16 FIX: 0.85 → 0.75 — ikkita aniq belgi multi sifatida aniqlanadi
    sorted_cands = sorted(candidates, key=lambda c: c["fill"], reverse=True)
    cand_adjusted = [c["fill"] - baseline for c in sorted_cands]

    if len(cand_adjusted) >= 2 and cand_adjusted[1] >= max_adjusted * 0.75:
        candidate_letters = [c["letter"] for c in sorted_cands]
        return {
            "letter": None,
            "status": "multi",
            "confidence": 0.0,
            "candidates": candidate_letters,
        }

    # Birinchisi aniq to'ldirilgan
    letter = sorted_cands[0]["letter"]
    confidence = _confidence(sorted_cands[0]["fill"], all_fills)
    return {
        "letter": letter,
        "status": "ok",
        "confidence": round(confidence, 3),
        "candidates": [letter],
    }


def _confidence(fill: float, all_fills: list[float]) -> float:
    """
    Javob ishonchlilik darajasi (0.0–1.0).
    fill / (fill + ikkinchi_eng_yuqori) — qanchalik ajralib turishi.
    0.9 vs 0.05 → 0.947 (yuqori ishonch)
    0.6 vs 0.55 → 0.522 (past ishonch)
    """
    sorted_fills = sorted(all_fills, reverse=True)
    best = sorted_fills[0]
    second = sorted_fills[1] if len(sorted_fills) > 1 else 0.0
    if best + second == 0:
        return 0.0
    return best / (best + second)
