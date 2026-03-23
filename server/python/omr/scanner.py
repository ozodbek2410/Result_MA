"""
OMR Scanner v2 — EvalBee-level bosh orkestrator.

Fallback strategy:
1. QR: original → warped → ROI retry
2. Corners: normal CLAHE → aggressive CLAHE → bilateral filter
3. Fill: inner sampling + baseline subtraction
4. Warning system: past confidence → ogohlantirish
"""
import cv2
import numpy as np
import sys
import json

from utils import load_and_preprocess
from corners import find_corners, warp_perspective
from qr import read_qr
from grid import build_grid, calibrate_grid, apply_offset
from fill import detect_fills
from config import SCANNER


class OMRScanner:
    def __init__(self, debug: bool = False):
        self.debug = debug

    def scan(self, image_path: str, total_questions: int = None) -> dict:
        """
        Asosiy skanerlash metodi — EvalBee-level fallback bilan.
        """
        result = {
            "success": False,
            "version": 2,
            "qr_code": {"found": False},
            "answers": {},
            "detected_answers": {},
            "stats": {},
            "warnings": []
        }

        try:
            # 1. Rasm yuklash va CLAHE preprocessing
            gray, color, scale = load_and_preprocess(image_path)

            # 2. QR kod o'qish (original rasmda — transform OLDIN)
            qr = read_qr(color)
            result["qr_code"] = qr

            # Total questions aniqlash
            total_q = total_questions
            if qr["found"] and qr.get("total_questions"):
                total_q = qr["total_questions"]

            # 3. Burchak markerlarni topish — 3 ta retry strategiya
            corners, is_doc_boundary = self._find_corners_with_retry(gray, color)

            if corners is None:
                result["error"] = "Burchak markerlar topilmadi"
                result["partial"] = True
                result["warnings"].append("4 ta burchak marker topilmadi — varaqni tekisroq ushlang")
                return result

            if is_doc_boundary:
                result["warnings"].append("Hujjat chegarasi ishlatildi (corner marklar topilmadi)")

            # 4. Perspektiv tuzatish
            warped_color = warp_perspective(color, corners, is_doc_boundary)
            warped_gray = cv2.cvtColor(warped_color, cv2.COLOR_BGR2GRAY)

            # Warped uchun ham CLAHE
            clahe = cv2.createCLAHE(
                clipLimit=SCANNER["clahe_clip_limit"],
                tileGridSize=(SCANNER["clahe_tile_grid"], SCANNER["clahe_tile_grid"])
            )
            warped_gray = clahe.apply(warped_gray)

            # 5. QR RETRY — warped rasmda (perspektiv tuzatilgan = tekis QR)
            if not qr["found"]:
                qr = read_qr(warped_color)
                result["qr_code"] = qr
                if qr["found"] and qr.get("total_questions"):
                    total_q = qr["total_questions"]

            if not total_q:
                result["error"] = "total_questions aniqlanmadi (QR topilmadi, savol soni berilmadi)"
                result["warnings"].append("QR topilmadi va savol soni berilmadi")
                return result

            # Warped binary (fill detection uchun)
            _, warped_binary = cv2.threshold(
                warped_gray, 0, 255,
                cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
            )

            # 6. Grid qurish (layout-first — PRIMARY)
            cells = build_grid(warped_gray, total_q, is_doc_boundary)

            # 7. Grid calibration (±offset)
            dx, dy = calibrate_grid(cells, warped_binary)
            max_offset = SCANNER.get("calibration_max_offset_px", 15)
            if abs(dx) > max_offset or abs(dy) > max_offset:
                result["warnings"].append(
                    f"Katta calibration offset: dx={dx:.1f}, dy={dy:.1f} — perspektiv noto'g'ri bo'lishi mumkin"
                )
            cells = apply_offset(cells, dx, dy)

            # 8. Fill detection (adaptive per-row + inner sampling)
            fills = detect_fills(cells, warped_binary)

            # 9. Natija format
            answers = {}
            detected_answers = {}
            answered = 0
            empty = 0
            multi_sel = 0
            total_conf = 0.0

            for q_num in range(1, total_q + 1):
                q_str = str(q_num)
                if q_num in fills:
                    f = fills[q_num]
                    answers[q_str] = f
                    if f["letter"]:
                        detected_answers[q_str] = f["letter"]
                        answered += 1
                        total_conf += f["confidence"]
                    elif f["status"] == "empty":
                        empty += 1
                    elif f["status"] == "multi":
                        multi_sel += 1
                else:
                    answers[q_str] = {"letter": None, "status": "empty",
                                      "confidence": 0.0, "candidates": []}
                    empty += 1

            avg_conf = total_conf / answered if answered > 0 else 0.0
            detection_rate = answered / total_q * 100 if total_q > 0 else 0

            if avg_conf < 0.4 and answered > 0:
                result["warnings"].append("Past ishonchlilik — varaqni qayta skanerlang")

            if not qr["found"]:
                result["warnings"].append("QR topilmadi — variant kodi aniqlanmadi")

            result["success"] = True
            result["answers"] = answers
            result["detected_answers"] = detected_answers
            result["stats"] = {
                "answered": answered,
                "empty": empty,
                "multi_select": multi_sel,
                "total": total_q,
                "detection_rate": round(detection_rate, 1),
                "avg_confidence": round(avg_conf, 3),
                "calibration_dx": round(dx, 2),
                "calibration_dy": round(dy, 2),
            }

        except Exception as e:
            result["error"] = str(e)
            if self.debug:
                import traceback
                result["traceback"] = traceback.format_exc()

        return result

    def _find_corners_with_retry(
        self, gray: np.ndarray, color: np.ndarray
    ) -> tuple[np.ndarray | None, bool]:
        """
        3 ta retry strategiya bilan corner detection.
        Returns: (corners, is_doc_boundary)
        """
        # Attempt 1: Normal (CLAHE allaqachon qo'llanilgan)
        corners, is_doc = find_corners(gray)
        if corners is not None:
            return corners, is_doc

        # Attempt 2: Aggressive CLAHE
        raw_gray = cv2.cvtColor(color, cv2.COLOR_BGR2GRAY)
        clahe_strong = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(4, 4))
        gray2 = clahe_strong.apply(raw_gray)
        corners, is_doc = find_corners(gray2)
        if corners is not None:
            return corners, is_doc

        # Attempt 3: Bilateral filter (edge-preserving)
        filtered = cv2.bilateralFilter(color, 9, 75, 75)
        gray3 = cv2.cvtColor(filtered, cv2.COLOR_BGR2GRAY)
        clahe_normal = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray3 = clahe_normal.apply(gray3)
        corners, is_doc = find_corners(gray3)
        if corners is not None:
            return corners, is_doc

        return None, False


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="OMR Scanner v2")
    parser.add_argument("image", help="Rasm fayl yo'li")
    parser.add_argument("--questions", "-q", type=int, help="Savol soni")
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    scanner = OMRScanner(debug=args.debug)
    res = scanner.scan(args.image, total_questions=args.questions)
    print(json.dumps(res, ensure_ascii=False, indent=2))
