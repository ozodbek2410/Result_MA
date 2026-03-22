"""
OMR Scanner v2 — bosh orkestrator.

Flow:
1. Rasm yuklash + CLAHE preprocessing
2. QR kod o'qish (original rasmdan, transform OLDIN)
3. Burchak markerlarni topish (multi-threshold)
4. Perspektiv tuzatish
5. Grid qurish (layout-first — QR dan q soni ma'lum)
6. Grid calibration (detection bilan ±2px offset)
7. Adaptive fill detection
8. Natija qaytarish
"""
import cv2
import numpy as np
import sys
import json

from utils import load_and_preprocess, multi_threshold
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
        Asosiy skanerlash metodi.

        Args:
            image_path: Rasm fayl yo'li
            total_questions: Savol soni (agar QR yo'q bo'lsa kerak)

        Returns: Natija dict
        """
        result = {
            "success": False,
            "version": 2,
            "qr_code": {"found": False},
            "answers": {},
            "detected_answers": {},
            "stats": {}
        }

        try:
            # 1. Rasm yuklash va CLAHE preprocessing
            gray, color, scale = load_and_preprocess(image_path)

            # 2. QR kod o'qish (original rasmdan — transform OLDIN)
            qr = read_qr(color)
            result["qr_code"] = qr

            # Total questions aniqlash
            total_q = total_questions
            if qr["found"] and qr["total_questions"]:
                total_q = qr["total_questions"]

            if not total_q:
                result["error"] = "total_questions aniqlanmadi (QR topilmadi, savol soni berilmadi)"
                return result

            # 3. Burchak markerlarni topish
            corners = find_corners(gray)
            if corners is None:
                result["error"] = "Burchak markerlar topilmadi"
                result["partial"] = True
                return result

            # 4. Perspektiv tuzatish
            warped_color = warp_perspective(color, corners)
            warped_gray = cv2.cvtColor(warped_color, cv2.COLOR_BGR2GRAY)

            # Warped uchun ham CLAHE
            import cv2 as _cv2
            clahe = _cv2.createCLAHE(
                clipLimit=SCANNER["clahe_clip_limit"],
                tileGridSize=(SCANNER["clahe_tile_grid"], SCANNER["clahe_tile_grid"])
            )
            warped_gray = clahe.apply(warped_gray)

            # Warped binary (fill detection uchun)
            _, warped_binary = cv2.threshold(
                warped_gray, 0, 255,
                cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
            )

            # 5. Grid qurish (layout-first — PRIMARY)
            cells = build_grid(warped_gray, total_q)

            # 6. Grid calibration (±2px offset)
            dx, dy = calibrate_grid(cells, warped_binary)
            cells = apply_offset(cells, dx, dy)

            # 7. Fill detection (adaptive per-row)
            fills = detect_fills(cells, warped_binary)

            # 8. Natija format
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
                    answers[q_str] = {"letter": None, "status": "empty", "confidence": 0.0, "candidates": []}
                    empty += 1

            avg_conf = total_conf / answered if answered > 0 else 0.0
            detection_rate = answered / total_q * 100 if total_q > 0 else 0

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
