"""
OMR Scanner v2 — EvalBee-level bosh orkestrator.

Pipeline (gibrid contour + layout):
1. QR: original → warped → ROI retry
2. Corners: normal CLAHE → aggressive CLAHE → bilateral filter
3. Layout grid (expected pozitsiyalar) + timing mark calibration
4. Contour detection (bubble'larning HAQIQIY pozitsiyalari)
5. Layout mapping (har contour → Q-N-LETTER assignment)
6. Fill detection (haqiqiy contour pozitsiyalarida)
7. Warning system: past confidence / past mapping sifati → ogohlantirish

Nima uchun gibrid:
─────────────────
Layout-first kamchiligi: perspektiv warp 3-5 px xato bersa, hisoblangan pozitsiya
bo'sh joyga to'g'ri keladi → fill = 0 → detection 0%.
Contour detection bubble'ni qayerda bo'lsa shu yerda topadi → matematik xato
ahamiyatsiz → har qanday telefonda ishlaydi.
"""
import cv2
import numpy as np
import sys
import json
import traceback as _traceback  # M-13 FIX: top-level import — xato traceback har doim mavjud

from utils import load_and_preprocess
from corners import find_corners, warp_perspective
from qr import read_qr
from grid import build_grid, calibrate_grid, apply_offset
from fill import detect_fills, detect_fills_from_mapped
from contour import find_bubble_contours
from mapper import map_contours_to_cells, is_mapping_high_quality
from config import SCANNER


class OMRScanner:
    def __init__(self, debug: bool = False):
        self.debug = debug

    def scan(self, image_path: str, total_questions: int = None,
             client_corners: list = None) -> dict:
        """
        Asosiy skanerlash metodi — EvalBee-level.

        client_corners: [{x,y}, {x,y}, {x,y}, {x,y}] — TL, TR, BL, BR
            Client (LiveScannerModal) topgan corner mark koordinatalari.
            Agar berilsa — server qayta izlamaydi (EvalBee yondashruvi).
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

            # 3. Burchak markerlarni topish
            is_doc_boundary = False
            if client_corners and len(client_corners) == 4:
                # Client (LiveScannerModal) topgan corners — qayta izlash SHART EMAS
                # Bu EvalBee yondashruvi: client 4/4 topganda capture qiladi
                corners = np.array([
                    [client_corners[0]["x"] * scale, client_corners[0]["y"] * scale],  # TL
                    [client_corners[1]["x"] * scale, client_corners[1]["y"] * scale],  # TR
                    [client_corners[3]["x"] * scale, client_corners[3]["y"] * scale],  # BR
                    [client_corners[2]["x"] * scale, client_corners[2]["y"] * scale],  # BL
                ], dtype=np.float32)
                from utils import sort_corners
                corners = sort_corners(corners)
            else:
                # Fallback: server o'zi izlaydi (rasm yuklash rejimi)
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
                # QR topilmadi — timing marklardan savol sonini aniqlash
                total_q = self._infer_total_questions(warped_gray, is_doc_boundary)
                if total_q:
                    result["warnings"].append(
                        f"QR topilmadi — timing marklardan {total_q} savol aniqlandi"
                    )
                    # M-11 FIX: QR topilmasa partial=True — variant kodi yo'q
                    result["partial"] = True
                else:
                    # Fallback: eng keng tarqalgan 90
                    total_q = 90
                    result["warnings"].append(
                        "QR topilmadi — 90 savol deb taxmin qilindi"
                    )
                    # M-11 FIX: taxmin qilingan holat — partial
                    result["partial"] = True

            # Warped binary (fill detection uchun)
            _, warped_binary = cv2.threshold(
                warped_gray, 0, 255,
                cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
            )

            # 6. Grid qurish — EXPECTED bubble pozitsiyalari (layout formula)
            expected_cells = build_grid(warped_gray, total_q, is_doc_boundary)

            # 7. Grid calibration (timing mark refinement, ±offset)
            dx, dy = calibrate_grid(expected_cells, warped_binary)
            max_offset = SCANNER.get("calibration_max_offset_px", 15)
            if abs(dx) > max_offset or abs(dy) > max_offset:
                result["warnings"].append(
                    f"Katta calibration offset: dx={dx:.1f}, dy={dy:.1f} — perspektiv noto'g'ri bo'lishi mumkin"
                )
            expected_cells = apply_offset(expected_cells, dx, dy)

            # 8. CONTOUR DETECTION — bubble'larning HAQIQIY pozitsiyalari
            # EvalBee yondashuvi: rasmda bubble qayerda bo'lsa shu yerda topiladi
            expected_r = expected_cells[0]["r"] if expected_cells else 12.0
            all_contours = find_bubble_contours(warped_binary, expected_r)

            # 9. LAYOUT MAPPING — har contour ni Q-N-LETTER ga biriktirish
            mapping = map_contours_to_cells(expected_cells, all_contours)

            if not is_mapping_high_quality(mapping, expected_r):
                result["warnings"].append(
                    f"Past mapping sifati: {mapping['matched_count']}/{mapping['total_count']} cell topildi "
                    f"(median offset: {mapping['median_distance']:.1f}px)"
                )

            # 10. FILL DETECTION — haqiqiy contour pozitsiyalarida
            # Layout fall qilgan cell'lar uchun degraded fallback
            fills = detect_fills_from_mapped(mapping["cells"], warped_binary)

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
                    elif f["status"] == "multi" and f.get("candidates"):
                        # Multi: "C,D" formatda ko'rsatish
                        detected_answers[q_str] = ",".join(f["candidates"])
                        multi_sel += 1
                        answered += 1
                else:
                    answers[q_str] = {"letter": None, "status": "empty",
                                      "confidence": 0.0, "candidates": []}
                    empty += 1

            avg_conf = total_conf / answered if answered > 0 else 0.0
            detection_rate = answered / total_q * 100 if total_q > 0 else 0

            if avg_conf < 0.4 and answered > 0:
                result["warnings"].append("Past ishonchlilik — varaqni qayta skanerlang")
                # M-12 FIX: past ishonchlilik ham partial sifatida belgilanadi
                result["partial"] = True

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
                # Contour mapping diagnostikasi
                "contour_count": len(all_contours),
                "matched_count": mapping["matched_count"],
                "match_rate": round(mapping["match_rate"], 3),
                "median_distance_px": round(mapping["median_distance"], 2),
            }

        except Exception as e:
            result["error"] = str(e)
            # M-13 FIX: traceback har doim saqlanadi (debug flag dan mustaqil).
            # Production'da server log'da ko'rinadi, debug=True da JSON'ga ham qo'shiladi.
            tb = _traceback.format_exc()
            print(f"[OMRScanner] Xato: {e}\n{tb}", file=sys.stderr)
            if self.debug:
                result["traceback"] = tb

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

    def _infer_total_questions(
        self, warped_gray: np.ndarray, is_doc_boundary: bool
    ) -> int | None:
        """
        Timing marklardan savol sonini aniqlash.
        Har bir common size uchun grid qurib, timing mark count tekshirish.
        """
        from grid import build_grid, _find_timing_marks
        from config import compute_layout

        _, warped_binary = cv2.threshold(
            warped_gray, 0, 255,
            cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
        )

        best_count = None
        best_marks = 0

        # M-09 FIX: [90, 30] → [90, 75, 60, 45, 30]
        #   Eski: 45/60/75 savol bo'lsa 90 deb xato taxmin qilinar edi.
        #   Eng ko'p timing mark topilgan size = haqiqiy savol soni.
        for total_q in [90, 75, 60, 45, 30]:
            cells = build_grid(warped_gray, total_q, is_doc_boundary)
            layout = compute_layout(total_q)
            rows_per_col = layout["rows_per_col"]
            bubble_r = cells[0]["r"] if cells else 15

            # Col 0 dan timing marklarni izlash
            col0_cells = [c for c in cells if c["col"] == 0 and c["letter"] == "A"]
            if not col0_cells:
                continue

            col_x = col0_cells[0]["cx"]
            first_y = col0_cells[0]["cy"]
            tm_x_right = col_x - bubble_r
            tm_x_left = tm_x_right - 80

            marks = _find_timing_marks(
                warped_binary,
                x1=max(0, int(tm_x_left)),
                x2=int(tm_x_right),
                y1=max(0, int(first_y - bubble_r * 8)),
                y2=min(warped_binary.shape[0],
                       int(first_y + rows_per_col * bubble_r * 2.5 * 1.5)),
                expected_count=rows_per_col,
                bubble_r=bubble_r,
            )

            # Eng ko'p timing mark topilgan size = to'g'ri
            if len(marks) > best_marks:
                best_marks = len(marks)
                best_count = total_q

        # Kamida 5 ta timing mark topilishi kerak
        if best_marks >= 5:
            return best_count
        return None


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="OMR Scanner v2")
    parser.add_argument("image", help="Rasm fayl yo'li")
    parser.add_argument("--questions", "-q", type=int, help="Savol soni")
    parser.add_argument("--corners", type=str, help="Client corners JSON: [{x,y},{x,y},{x,y},{x,y}]")
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    cc = None
    if args.corners:
        cc = json.loads(args.corners)

    scanner = OMRScanner(debug=args.debug)
    res = scanner.scan(args.image, total_questions=args.questions, client_corners=cc)
    print(json.dumps(res, ensure_ascii=False, indent=2))
