#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HYBRID OMR SCANNER - Eng yaxshi yechim
Corner marks bor bo'lsa ishlatadi, yo'q bo'lsa marker-free rejimga o'tadi
"""

import cv2
import numpy as np
import sys
import json


class HybridOMR:
    """Hybrid OMR - corner marks + marker-free"""
    
    def __init__(self, debug=False, total_questions=None):
        self.debug = debug
        self.TOTAL_QUESTIONS = total_questions  # None bo'lsa avtomatik aniqlanadi
        self.FILL_THRESHOLD_WITH_CORNERS = 55.0  # Corner marks bilan
        self.FILL_THRESHOLD_WITHOUT_CORNERS = 55.0  # Marker-free (oshirildi 40% → 55%)
        self.current_threshold = 55.0  # Default
    
    def log(self, message):
        if self.debug:
            try:
                print(message)
            except UnicodeEncodeError:
                # Windows konsoli uchun emoji siz versiya
                print(message.encode('ascii', errors='ignore').decode('ascii'))
    
    def find_corner_marks(self, image):
        """4 ta burchak kvadratlarini topish"""
        self.log("🔍 Corner marks topish...")
        
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Threshold
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
        
        # Konturlarni topish
        cnts, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Katta qora kvadratlarni topish
        corners = []
        
        for c in cnts:
            (x, y, w, h) = cv2.boundingRect(c)
            area = cv2.contourArea(c)
            ar = w / float(h) if h > 0 else 0
            
            # Corner mark filtri - kengaytirilgan:
            # - O'lcham: 30-150 pixel (kattaroq range)
            # - Aspect ratio: 0.7-1.4 (kengroq)
            # - Area: 900-22500 pixel²
            if (30 <= w <= 150 and 30 <= h <= 150 and 
                0.7 <= ar <= 1.4 and 
                900 <= area <= 22500):
                
                cx = x + w // 2
                cy = y + h // 2
                corners.append({
                    'x': cx,
                    'y': cy,
                    'w': w,
                    'h': h,
                    'bbox': (x, y, w, h),
                    'area': area
                })
        
        if len(corners) < 4:
            self.log(f"⚠️ Faqat {len(corners)} ta corner mark topildi (4 ta kerak)")
            return None
        
        # Debug: barcha topilgan corner marklarni ko'rsatish
        if self.debug and len(corners) > 4:
            self.log(f"⚠️ {len(corners)} ta corner mark topildi, eng katta 4 tasini tanlaymiz:")
            for i, c in enumerate(sorted(corners, key=lambda x: x['area'], reverse=True)[:8]):
                self.log(f"   #{i+1}: ({c['x']}, {c['y']}) - {c['w']}x{c['h']} - area={c['area']:.0f}")
        
        # QR kodni filtrash (juda katta kvadratlar)
        # Corner marks: 30-70px, QR kod: 80+ px
        corners = [c for c in corners if c['w'] < 75 and c['h'] < 75]
        
        if len(corners) < 4:
            self.log(f"⚠️ QR kod filtrlangandan keyin faqat {len(corners)} ta corner mark qoldi")
            return None
        
        # 4 ta eng katta corner marklarni olish (QR kodsiz)
        corners = sorted(corners, key=lambda c: c['area'], reverse=True)[:4]
        
        # Burchaklarni to'g'ri saralash
        # 1. Y koordinata bo'yicha 2 guruhga bo'lish (yuqori va pastki)
        y_sorted = sorted(corners, key=lambda c: c['y'])
        top_two = y_sorted[:2]  # Eng yuqoridagi 2 ta
        bottom_two = y_sorted[2:]  # Eng pastdagi 2 ta
        
        # 2. Har bir guruhni X bo'yicha saralash
        top_corners = sorted(top_two, key=lambda c: c['x'])  # Chap, o'ng
        bottom_corners = sorted(bottom_two, key=lambda c: c['x'])  # Chap, o'ng
        
        corner_marks = {
            'top_left': top_corners[0],
            'top_right': top_corners[1],
            'bottom_left': bottom_corners[0],
            'bottom_right': bottom_corners[1]
        }
        
        self.log(f"✅ 4 ta corner mark topildi")
        self.log(f"   Top-left: ({corner_marks['top_left']['x']}, {corner_marks['top_left']['y']})")
        self.log(f"   Top-right: ({corner_marks['top_right']['x']}, {corner_marks['top_right']['y']})")
        self.log(f"   Bottom-left: ({corner_marks['bottom_left']['x']}, {corner_marks['bottom_left']['y']})")
        self.log(f"   Bottom-right: ({corner_marks['bottom_right']['x']}, {corner_marks['bottom_right']['y']})")
        
        return corner_marks
    
    def four_point_transform(self, image, corners):
        """Perspective transform - qog'ozni to'g'rilash"""
        self.log("🔄 Perspective transform...")
        
        # Corner koordinatalarini olish
        tl = (corners['top_left']['x'], corners['top_left']['y'])
        tr = (corners['top_right']['x'], corners['top_right']['y'])
        bl = (corners['bottom_left']['x'], corners['bottom_left']['y'])
        br = (corners['bottom_right']['x'], corners['bottom_right']['y'])
        
        # Manbaa nuqtalari
        pts = np.array([tl, tr, br, bl], dtype=np.float32)
        
        # Kenglik va balandlikni hisoblash
        widthA = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
        widthB = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
        maxWidth = max(int(widthA), int(widthB))
        
        heightA = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
        heightB = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
        maxHeight = max(int(heightA), int(heightB))
        
        # Maqsad nuqtalari
        dst = np.array([
            [0, 0],
            [maxWidth - 1, 0],
            [maxWidth - 1, maxHeight - 1],
            [0, maxHeight - 1]
        ], dtype=np.float32)
        
        # Perspective transform
        M = cv2.getPerspectiveTransform(pts, dst)
        warped = cv2.warpPerspective(image, M, (maxWidth, maxHeight))
        
        self.log(f"✅ Perspective transform: {maxWidth}x{maxHeight}")
        return warped
    
    def find_all_circles(self, image):
        """Barcha doirachalarni topish - yaxshilangan"""
        self.log("Doirachalarni topish...")

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # Gaussian blur
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)

        # Adaptive threshold
        thresh = cv2.adaptiveThreshold(
            blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV, 11, 2
        )

        # Morphological operations
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

        # Konturlarni topish
        cnts, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        circles = []

        for c in cnts:
            (x, y, w, h) = cv2.boundingRect(c)
            area = cv2.contourArea(c)
            ar = w / float(h) if h > 0 else 0

            # Doiracha filtri - kengaytirilgan
            if (12 <= w <= 70 and 12 <= h <= 70 and
                0.65 <= ar <= 1.35 and
                150 <= area <= 4000):

                # Circularity
                perimeter = cv2.arcLength(c, True)
                if perimeter > 0:
                    circularity = 4 * np.pi * area / (perimeter * perimeter)

                    if circularity > 0.45:
                        cx = x + w // 2
                        cy = y + h // 2
                        circles.append({
                            'x': cx,
                            'y': cy,
                            'w': w,
                            'h': h,
                            'bbox': (x, y, w, h),
                            'circularity': circularity
                        })

        self.log(f"{len(circles)} ta doiracha topildi")
        return circles

    def build_template_grid(self, image, circles):
        """Template-based grid - aniqlangan doirachalardan grid pozitsiyalarini hisoblash.
        To'ldirilgan doirachalar kontur deteksiyada birlashib ketganda ishlatiladi."""
        self.log("Template-based grid yaratish...")

        if len(circles) < 4:
            return {}

        h_img, w_img = image.shape[:2]

        # 1. X pozitsiyalarini klasterlash
        all_x = sorted([c['x'] for c in circles])
        x_clusters = []
        current_cluster = [all_x[0]]
        for i in range(1, len(all_x)):
            if all_x[i] - all_x[i-1] < 15:
                current_cluster.append(all_x[i])
            else:
                x_clusters.append(int(np.mean(current_cluster)))
                current_cluster = [all_x[i]]
        x_clusters.append(int(np.mean(current_cluster)))

        self.log(f"  X klasterlar: {x_clusters}")

        # 8 ta X pozitsiya kerak (2 ustun x 4 variant)
        # Agar 8 dan kam bo'lsa, oraliqdan hisoblash
        if len(x_clusters) >= 6:
            # Chap va o'ng ustunlarni ajratish
            mid_x = w_img // 2
            left_xs = [x for x in x_clusters if x < mid_x]
            right_xs = [x for x in x_clusters if x >= mid_x]

            # Har bir ustunda 4 ta pozitsiya bo'lishi kerak
            left_xs = self._interpolate_positions(left_xs, 4)
            right_xs = self._interpolate_positions(right_xs, 4)

            x_positions = left_xs + right_xs
        elif len(x_clusters) >= 4:
            # Faqat bitta ustun aniqlangan - 4 pozitsiya
            x_positions = self._interpolate_positions(x_clusters[:4], 4)
            # Ikkinchi ustunni hisoblash
            if len(x_clusters) > 4:
                right_xs = self._interpolate_positions(x_clusters[4:], 4)
                x_positions = x_positions + right_xs
        else:
            self.log("  X pozitsiyalar yetarli emas")
            return {}

        self.log(f"  X pozitsiyalar: {x_positions}")

        # 2. Y pozitsiyalarini aniqlash
        all_y = sorted([c['y'] for c in circles])
        y_clusters = []
        current_cluster = [all_y[0]]
        for i in range(1, len(all_y)):
            if all_y[i] - all_y[i-1] < 12:
                current_cluster.append(all_y[i])
            else:
                y_clusters.append(int(np.mean(current_cluster)))
                current_cluster = [all_y[i]]
        y_clusters.append(int(np.mean(current_cluster)))

        self.log(f"  Y klasterlar ({len(y_clusters)} ta): {y_clusters}")

        # 15 qator kerak (yoki TOTAL_QUESTIONS / 2)
        rows_needed = 15
        if self.TOTAL_QUESTIONS:
            columns = len(x_positions) // 4
            if columns > 0:
                rows_needed = (self.TOTAL_QUESTIONS + columns - 1) // columns

        y_positions = self._interpolate_positions(y_clusters, rows_needed)
        self.log(f"  Y pozitsiyalar ({len(y_positions)} ta): {y_positions}")

        # 3. Average bubble size
        avg_w = int(np.mean([c['w'] for c in circles]))
        avg_h = int(np.mean([c['h'] for c in circles]))
        self.log(f"  Doiracha o'lchami: {avg_w}x{avg_h}")

        # 4. Grid yaratish
        grid = {}
        columns = len(x_positions) // 4
        letters = ['A', 'B', 'C', 'D']

        for col in range(columns):
            col_x = x_positions[col * 4 : col * 4 + 4]

            for row_idx, y_pos in enumerate(y_positions):
                question_num = row_idx + (col * len(y_positions)) + 1

                if self.TOTAL_QUESTIONS and question_num > self.TOTAL_QUESTIONS:
                    break

                grid[question_num] = {}
                for letter_idx, letter in enumerate(letters):
                    x_pos = col_x[letter_idx]
                    grid[question_num][letter] = {
                        'x': x_pos,
                        'y': y_pos,
                        'w': avg_w,
                        'h': avg_h,
                        'bbox': (x_pos - avg_w // 2, y_pos - avg_h // 2, avg_w, avg_h)
                    }

        self.log(f"  Template grid yaratildi: {len(grid)} ta savol")
        return grid

    def _interpolate_positions(self, positions, target_count):
        """Pozitsiyalar orasini to'ldirish va target_count ga yetkazish"""
        if len(positions) == 0:
            return []
        if len(positions) == 1:
            return positions
        if len(positions) >= target_count:
            # Eng yaqin target_count ta pozitsiyani tanlash
            return sorted(positions[:target_count])

        # Mavjud pozitsiyalardan oraliqni hisoblash
        positions = sorted(positions)
        diffs = [positions[i+1] - positions[i] for i in range(len(positions) - 1)]
        avg_step = np.mean(diffs)

        # Boshlang'ich va oxirgi pozitsiyalardan interpolatsiya
        result = list(positions)

        # Oldin qo'shish kerakmi?
        while len(result) < target_count:
            # Boshiga qo'shish
            new_start = result[0] - avg_step
            if new_start > 0:
                result.insert(0, int(new_start))
                if len(result) >= target_count:
                    break

            # Oxiriga qo'shish
            new_end = result[-1] + avg_step
            result.append(int(new_end))
            if len(result) >= target_count:
                break

        return sorted(result[:target_count])
    
    def group_circles_into_grid(self, circles):
        """Doirachalarni grid ga guruhlash - 2-5 ustun qo'llab-quvvatlanadi"""
        self.log("Grid yaratish...")

        if len(circles) < 8:
            self.log(f"Kam doiracha: {len(circles)}")
            return {}

        # Y bo'yicha saralash
        circles_sorted = sorted(circles, key=lambda c: c['y'])

        # Qatorlarni aniqlash - clustering
        rows = []
        current_row = [circles_sorted[0]]
        prev_y = circles_sorted[0]['y']

        for i in range(1, len(circles_sorted)):
            curr_y = circles_sorted[i]['y']
            y_diff = curr_y - prev_y

            # Agar Y farqi 15 pixeldan kam bo'lsa - bir qatorda
            if y_diff < 15:
                current_row.append(circles_sorted[i])
            else:
                if len(current_row) >= 4:
                    rows.append(current_row)
                    self.log(f"  Qator {len(rows)}: {len(current_row)} ta doiracha, Y={current_row[0]['y']}")
                current_row = [circles_sorted[i]]

            prev_y = curr_y

        if len(current_row) >= 4:
            rows.append(current_row)
            self.log(f"  Qator {len(rows)}: {len(current_row)} ta doiracha, Y={current_row[0]['y']}")

        self.log(f"  {len(rows)} ta qator topildi")

        # X bo'yicha saralash
        for row in rows:
            row.sort(key=lambda c: c['x'])

        # Grid yaratish - dinamik ustun aniqlash
        grid = {}

        if not rows:
            return grid

        # Ustunlar sonini aniqlash: har qatordagi doirachalar soni / 4 (A,B,C,D)
        avg_bubbles_per_row = sum(len(row) for row in rows) / len(rows)
        columns = max(1, round(avg_bubbles_per_row / 4))
        columns = min(columns, 5)  # Maksimal 5 ustun
        questions_per_column = len(rows)

        self.log(f"  Aniqlangan: {columns} ustun, {questions_per_column} savol/ustun")
        self.log(f"  Jami: ~{columns * questions_per_column} ta savol")

        # Dinamik: barcha ustunlarni bir siklda qayta ishlash
        for col in range(columns):
            base_idx = col * 4  # Har bir ustunda 4 ta doiracha (A,B,C,D)
            required_bubbles = base_idx + 4

            for i in range(questions_per_column):
                if i >= len(rows):
                    break

                row = rows[i]
                question_num = i + (col * questions_per_column) + 1

                if len(row) >= required_bubbles:
                    grid[question_num] = {
                        'A': row[base_idx],
                        'B': row[base_idx + 1],
                        'C': row[base_idx + 2],
                        'D': row[base_idx + 3]
                    }

        self.log(f"  Grid yaratildi: {len(grid)} ta savol")
        return grid
    
    def check_bubble_filled(self, image, circle):
        """Doiracha to'ldirilganligini tekshirish - 3 ta method"""
        x, y, w, h = circle['bbox']
        
        roi = image[y:y+h, x:x+w]
        
        if roi.size == 0:
            return False, 0.0
        
        # Grayscale
        if len(roi.shape) == 3:
            roi_gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        else:
            roi_gray = roi
        
        # Method 1: Otsu threshold
        _, thresh_otsu = cv2.threshold(roi_gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
        fill_otsu = (cv2.countNonZero(thresh_otsu) / thresh_otsu.size) * 100
        
        # Method 2: Mean intensity
        mean_intensity = np.mean(roi_gray)
        fill_intensity = (255 - mean_intensity) / 255 * 100
        
        # Method 3: Adaptive threshold
        thresh_adaptive = cv2.adaptiveThreshold(
            roi_gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV, 11, 2
        )
        fill_adaptive = (cv2.countNonZero(thresh_adaptive) / thresh_adaptive.size) * 100
        
        # Weighted average
        fill_percentage = (
            fill_otsu * 0.4 +
            fill_intensity * 0.3 +
            fill_adaptive * 0.3
        )
        
        is_filled = fill_percentage >= self.current_threshold
        
        return is_filled, fill_percentage
    
    def scan(self, image_path, correct_answers=None):
        """Asosiy scan funksiyasi - HYBRID"""
        self.log("=" * 60)
        self.log("🚀 HYBRID OMR SCANNER")
        self.log("=" * 60)
        self.log("")
        
        # 1. Rasmni yuklash
        self.log("📸 Rasmni yuklash...")
        image = cv2.imread(image_path)
        
        if image is None:
            return {"success": False, "error": "Rasmni yuklab bo'lmadi"}
        
        self.log(f"✅ Rasm yuklandi: {image.shape[1]}x{image.shape[0]}")
        self.log("")
        
        # 2. Corner marks topish
        corners = self.find_corner_marks(image)
        
        if corners:
            # REJIM 1: Corner marks bilan
            self.log("")
            self.log("REJIM: Corner marks bilan")
            self.current_threshold = self.FILL_THRESHOLD_WITH_CORNERS
            self.log(f"   Fill threshold: {self.current_threshold}%")
            self.log("")

            # Perspective transform
            warped = self.four_point_transform(image, corners)
            self.log("")

            # Doirachalarni topish
            circles = self.find_all_circles(warped)
            if not circles:
                return {"success": False, "error": "Doirachalar topilmadi"}

            self.log("")

            # Grid yaratish - avval oddiy usul
            grid = self.group_circles_into_grid(circles)

            # Agar grid kam savol topsa, template-based usulga o'tish
            expected_questions = self.TOTAL_QUESTIONS or 30
            if len(grid) < expected_questions * 0.6:
                self.log(f"  Oddiy grid kam topdi ({len(grid)}/{expected_questions}), template-based usulga o'tilmoqda...")
                grid = self.build_template_grid(warped, circles)

            if not grid:
                return {"success": False, "error": "Grid yaratib bo'lmadi"}

            working_image = warped
            mode = "corner_marks"
        else:
            # REJIM 2: Marker-free
            self.log("")
            self.log("REJIM: Marker-free")
            self.current_threshold = self.FILL_THRESHOLD_WITHOUT_CORNERS
            self.log(f"   Fill threshold: {self.current_threshold}%")
            self.log("")

            # Doirachalarni topish
            circles = self.find_all_circles(image)
            if not circles:
                return {"success": False, "error": "Doirachalar topilmadi"}

            self.log("")

            # Grid yaratish - avval oddiy usul
            grid = self.group_circles_into_grid(circles)

            # Agar grid kam savol topsa, template-based usulga o'tish
            expected_questions = self.TOTAL_QUESTIONS or 30
            if len(grid) < expected_questions * 0.6:
                self.log(f"  Oddiy grid kam topdi ({len(grid)}/{expected_questions}), template-based usulga o'tilmoqda...")
                grid = self.build_template_grid(image, circles)

            if not grid:
                return {"success": False, "error": "Grid yaratib bo'lmadi"}

            working_image = image
            mode = "marker_free"
        
        self.log("")
        
        # 3. Javoblarni aniqlash
        self.log("Javoblarni aniqlash...")
        self.log("")

        detected_answers = {}
        DELTA_THRESHOLD = 15.0  # Max va ikkinchi o'rtasida min farq (%)

        for question_num in sorted(grid.keys()):
            max_fill = 0.0
            selected_answer = None
            fill_data = {}

            for letter in ['A', 'B', 'C', 'D']:
                if letter not in grid[question_num]:
                    continue

                circle = grid[question_num][letter]
                is_filled, fill_pct = self.check_bubble_filled(working_image, circle)

                fill_data[letter] = fill_pct

                if fill_pct > max_fill:
                    max_fill = fill_pct
                    selected_answer = letter

            # DELTA-BASED VALIDATION
            # Max fill va ikkinchi eng katta fill orasidagi farqni tekshirish
            sorted_fills = sorted(fill_data.values(), reverse=True)
            delta = sorted_fills[0] - sorted_fills[1] if len(sorted_fills) >= 2 else sorted_fills[0]

            # Threshold dan yuqori nechta javob bor
            filled_count = sum(1 for pct in fill_data.values() if pct >= self.current_threshold)

            if filled_count >= 2 and delta < DELTA_THRESHOLD:
                # Haqiqiy ko'p javob: 2+ ta threshold dan yuqori VA ular yaqin
                filled_letters = [letter for letter, pct in fill_data.items() if pct >= self.current_threshold]
                self.log(f"  Q{question_num}: XATO - {len(filled_letters)} ta javob ({', '.join(filled_letters)}, delta={delta:.1f}%)")
            elif max_fill < self.current_threshold and delta < DELTA_THRESHOLD:
                # Hech qaysi javob aniq to'ldirilmagan
                self.log(f"  Q{question_num}: Javob yo'q (max={max_fill:.1f}%, delta={delta:.1f}%)")
            else:
                # Bitta aniq javob: max fill yetarlicha yuqori YOKI delta yetarli katta
                detected_answers[str(question_num)] = selected_answer

                if correct_answers and str(question_num) in correct_answers:
                    correct_ans = correct_answers[str(question_num)]
                    status = "+" if selected_answer == correct_ans else "-"
                    self.log(f"  Q{question_num}: {selected_answer} {status} (fill: {max_fill:.1f}%, delta: {delta:.1f}%)")
                else:
                    self.log(f"  Q{question_num}: {selected_answer} (fill: {max_fill:.1f}%, delta: {delta:.1f}%)")
        
        self.log("")
        self.log(f"📊 Aniqlangan javoblar: {len(detected_answers)} ta")
        
        # TOTAL_QUESTIONS ni dinamik aniqlash
        if self.TOTAL_QUESTIONS is None:
            self.TOTAL_QUESTIONS = max(grid.keys()) if grid else 30
        
        # 4. Natija
        if correct_answers and len(correct_answers) > 0:
            correct = 0
            incorrect = 0
            unanswered = 0
            
            for q_num in range(1, self.TOTAL_QUESTIONS + 1):
                q_str = str(q_num)
                detected = detected_answers.get(q_str)
                correct_ans = correct_answers.get(q_str)
                
                if not detected:
                    unanswered += 1
                elif correct_ans and detected == correct_ans:
                    correct += 1
                else:
                    incorrect += 1
            
            score = (correct / self.TOTAL_QUESTIONS) * 100
            
            self.log("")
            self.log("📊 NATIJA:")
            self.log(f"  ✅ To'g'ri: {correct}")
            self.log(f"  ❌ Noto'g'ri: {incorrect}")
            self.log(f"  ⚪ Javob yo'q: {unanswered}")
            self.log(f"  📊 Ball: {score:.1f}%")
            self.log(f"  🔧 Rejim: {mode}")
            
            return {
                "success": True,
                "detected_answers": detected_answers,
                "total_questions": self.TOTAL_QUESTIONS,
                "correct": correct,
                "incorrect": incorrect,
                "unanswered": unanswered,
                "score": f"{score:.1f}%",
                "mode": mode
            }
        else:
            return {
                "success": True,
                "detected_answers": detected_answers,
                "total_questions": self.TOTAL_QUESTIONS,
                "mode": mode
            }


def main():
    if len(sys.argv) < 3:
        print("Usage: python omr_hybrid.py <image_path> <correct_answers_json>")
        sys.exit(1)
    
    image_path = sys.argv[1]
    correct_answers_json = sys.argv[2]
    
    try:
        correct_answers = json.loads(correct_answers_json)
    except json.JSONDecodeError as e:
        print(f"❌ JSON parse error: {e}")
        sys.exit(1)
    
    omr = HybridOMR(debug=True)
    result = omr.scan(image_path, correct_answers)
    
    print("")
    print("=" * 60)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
