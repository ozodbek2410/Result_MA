"""
Layout Mapper — contour'larni layout cell'larga assignment.

Vazifa:
────────
`contour.find_bubble_contours()` warped binary'da BARCHA bubble shaped pikselni
topadi (qaysi savol/harf ekanligini bilmaydi).
`grid.build_grid()` esa layout formula bilan EXPECTED pozitsiyalarni hisoblaydi
(qaysi savol/harf ekanini biladi, lekin haqiqiy joyini emas).

Bu fayl ikkalasini birlashtiradi:
  "Q5-B harfi qaysi contour ga to'g'ri keladi?"

Algoritm: Greedy nearest-neighbor with first-come-first-serve assignment.

Tolerance: bubbleR × 1.5 (yarmi diameter)

TS `layoutMapper.ts` bilan IDENTIK mantiq — natijalar bir xil bo'lishi kafolatlanadi.

Hungarian (scipy.optimize.linear_sum_assignment) qarshi greedy:
─────────────────────────────────────────────────────────────────
Hungarian optimal global matching beradi (yig'indi distance min). Lekin O(n³)
va 360 cell × 360 contour uchun ~47M operatsiya = 50-100ms.

Greedy + sort yetarli:
- Cell'lar top-down sort qilingan tartibda 99% holat optimal
- O(n²) lekin small constant, ~130k operatsiya = ~5-10ms
"""
from __future__ import annotations

import math
from typing import Optional


_TOLERANCE_FACTOR = 1.5


def map_contours_to_cells(
    expected_cells: list[dict],
    contours: list[dict],
) -> dict:
    """
    Topilgan contour'larni expected cell'larga assignment qilish.

    Args:
        expected_cells: grid.build_grid() natijasi — cell list:
                        [{"q", "col", "row", "letter", "cx", "cy", "r"}, ...]
        contours: contour.find_bubble_contours() natijasi:
                  [{"cx", "cy", "r", "area", "circularity", "solidity"}, ...]

    Returns:
        {
            "cells": [...]  # MappedCell list — original tartibda
            "matched_count": int,
            "total_count": int,
            "match_rate": float,
            "median_distance": float,
        }

        MappedCell — original cell + qo'shimcha:
            "actual_cx", "actual_cy", "actual_r": haqiqiy markaz (yoki expected agar matched=False)
            "matched": True if contour topildi
            "distance": expected dan distance (matched=False bo'lsa 0)
    """
    if not expected_cells:
        return {
            "cells": [],
            "matched_count": 0,
            "total_count": 0,
            "match_rate": 0.0,
            "median_distance": 0.0,
        }

    # Indexed cell — original tartibni saqlash uchun
    indexed = list(enumerate(expected_cells))

    # Top → bottom, left → right tartibida sort
    # Bir xil row da bo'lmasa Y, bo'lsa X bilan
    def _sort_key(item):
        idx, cell = item
        # Y ni bubble radius granularity bilan round qilish (bir xil row aniqlash)
        r = cell["r"]
        y_bucket = int(cell["cy"] / r) if r > 0 else 0
        return (y_bucket, cell["cx"])

    indexed.sort(key=_sort_key)

    used = [False] * len(contours)
    result: list[Optional[dict]] = [None] * len(expected_cells)
    distances: list[float] = []

    for orig_idx, cell in indexed:
        tolerance = cell["r"] * _TOLERANCE_FACTOR
        tolerance_sq = tolerance * tolerance
        best_dist_sq = tolerance_sq
        best_contour_idx = -1

        cell_cx = cell["cx"]
        cell_cy = cell["cy"]

        for i, c in enumerate(contours):
            if used[i]:
                continue
            dx = c["cx"] - cell_cx
            dy = c["cy"] - cell_cy
            dist_sq = dx * dx + dy * dy
            if dist_sq < best_dist_sq:
                best_dist_sq = dist_sq
                best_contour_idx = i

        if best_contour_idx >= 0:
            used[best_contour_idx] = True
            c = contours[best_contour_idx]
            distance = math.sqrt(best_dist_sq)
            distances.append(distance)
            mapped = dict(cell)
            mapped["actual_cx"] = c["cx"]
            mapped["actual_cy"] = c["cy"]
            mapped["actual_r"] = c["r"]
            mapped["matched"] = True
            mapped["distance"] = distance
            result[orig_idx] = mapped
        else:
            # Layout fallback — cell o'z pozitsiyasini saqlaydi
            mapped = dict(cell)
            mapped["actual_cx"] = cell["cx"]
            mapped["actual_cy"] = cell["cy"]
            mapped["actual_r"] = cell["r"]
            mapped["matched"] = False
            mapped["distance"] = 0.0
            result[orig_idx] = mapped

    # Median distance
    median_distance = 0.0
    if distances:
        sorted_d = sorted(distances)
        n = len(sorted_d)
        if n % 2 == 0:
            median_distance = (sorted_d[n // 2 - 1] + sorted_d[n // 2]) / 2.0
        else:
            median_distance = sorted_d[n // 2]

    matched_count = len(distances)
    total_count = len(expected_cells)
    match_rate = matched_count / total_count if total_count > 0 else 0.0

    return {
        "cells": result,
        "matched_count": matched_count,
        "total_count": total_count,
        "match_rate": match_rate,
        "median_distance": median_distance,
    }


def is_mapping_high_quality(result: dict, expected_radius: float) -> bool:
    """
    Mapping sifatini tekshirish.

    Mezonlar:
    - match_rate ≥ 0.85 (kamida 85% cell topilgan)
    - median_distance ≤ bubble_radius (median offset bir bubble radiusdan kam)

    Past matchRate sabablari:
    - Perspective xato katta → contour'lar expected pozitsiyadan uzoq
    - Binary threshold xato (CLAHE / Otsu yomon ishlagan)
    - Sheet sifati past (tutilgan, bukilgan)

    Returns:
        True — sifat yaxshi, False — sifat past, ogohlantirish kerak
    """
    if result["total_count"] == 0:
        return False
    if result["match_rate"] < 0.85:
        return False
    if result["median_distance"] > expected_radius:
        return False
    return True
