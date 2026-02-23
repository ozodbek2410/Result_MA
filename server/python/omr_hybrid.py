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
        self.log("🔍 Doirachalarni topish...")
        
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
        
        self.log(f"✅ {len(circles)} ta doiracha topildi")
        return circles
    
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
            # REJIM 1: Corner marks bilan (95-98% aniqlik)
            self.log("")
            self.log("✅ REJIM: Corner marks bilan (95-98% aniqlik)")
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
            
            # Grid yaratish
            grid = self.group_circles_into_grid(circles)
            if not grid:
                return {"success": False, "error": "Grid yaratib bo'lmadi"}
            
            working_image = warped
            mode = "corner_marks"
        else:
            # REJIM 2: Marker-free (80-90% aniqlik)
            self.log("")
            self.log("⚠️ REJIM: Marker-free (80-90% aniqlik)")
            self.current_threshold = self.FILL_THRESHOLD_WITHOUT_CORNERS
            self.log(f"   Fill threshold: {self.current_threshold}%")
            self.log("")
            
            # Doirachalarni topish
            circles = self.find_all_circles(image)
            if not circles:
                return {"success": False, "error": "Doirachalar topilmadi"}
            
            self.log("")
            
            # Grid yaratish
            grid = self.group_circles_into_grid(circles)
            if not grid:
                return {"success": False, "error": "Grid yaratib bo'lmadi"}
            
            working_image = image
            mode = "marker_free"
        
        self.log("")
        
        # 3. Javoblarni aniqlash
        self.log("🔍 Javoblarni aniqlash...")
        self.log("")
        
        detected_answers = {}
        
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
            
            # DEBUG: Q2 uchun batafsil ma'lumot
            if question_num == 2:
                self.log(f"\n🔍 DEBUG Q2 - Batafsil tahlil:")
                for letter in ['A', 'B', 'C', 'D']:
                    if letter in fill_data:
                        status_icon = "✅" if fill_data[letter] >= self.current_threshold else "⚠️" if fill_data[letter] >= 40.0 else "❌"
                        self.log(f"    {letter}: {fill_data[letter]:.1f}% {status_icon}")
                self.log(f"  Threshold: {self.current_threshold}%")
                self.log(f"  Max fill: {max_fill:.1f}% ({selected_answer})")
                self.log("")
            
            # VALIDATION: Bir nechta javob to'ldirilganligini tekshirish
            # Threshold dan yuqori
            filled_count = sum(1 for pct in fill_data.values() if pct >= self.current_threshold)
            
            # Threshold dan pastda ham to'ldirilgan bo'lishi mumkin (chala)
            # Agar bitta javob 55% dan yuqori, ikkinchisi 40-55% orasida bo'lsa - bu ham XATO
            partially_filled = sum(1 for pct in fill_data.values() if 40.0 <= pct < self.current_threshold)
            
            # Agar threshold dan yuqori 1 ta, pastda ham 1+ ta bo'lsa - XATO
            if filled_count >= 1 and partially_filled >= 1:
                filled_letters = [letter for letter, pct in fill_data.items() if pct >= 40.0]
                self.log(f"  Q{question_num}: ❌ XATO - {len(filled_letters)} ta javob to'ldirilgan ({', '.join(filled_letters)})")
                # Bu savolni hisoblamaymiz
            elif filled_count == 0:
                # Hech qaysi javob to'ldirilmagan
                self.log(f"  Q{question_num}: Javob yo'q (max fill: {max_fill:.1f}%)")
            elif filled_count == 1:
                # Faqat bitta javob to'ldirilgan - TO'G'RI
                detected_answers[str(question_num)] = selected_answer
                
                if correct_answers and str(question_num) in correct_answers:
                    correct_ans = correct_answers[str(question_num)]
                    status = "✅" if selected_answer == correct_ans else "❌"
                    self.log(f"  Q{question_num}: {selected_answer} {status} (fill: {max_fill:.1f}%)")
                else:
                    self.log(f"  Q{question_num}: {selected_answer} (fill: {max_fill:.1f}%)")
            else:
                # Bir nechta javob to'ldirilgan - XATO
                filled_letters = [letter for letter, pct in fill_data.items() if pct >= self.current_threshold]
                self.log(f"  Q{question_num}: ❌ XATO - {filled_count} ta javob to'ldirilgan ({', '.join(filled_letters)})")
                # Bu savolni hisoblamaymiz
        
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
