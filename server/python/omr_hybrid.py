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
        self.FILL_THRESHOLD_WITH_CORNERS = 38.0  # Empty circles: baseline ~16-23%, filled ~38%+
        self.FILL_THRESHOLD_WITHOUT_CORNERS = 38.0  # Marker-free
        self.current_threshold = 38.0  # Default
    
    def log(self, message):
        if self.debug:
            try:
                print(message, file=sys.stderr)
            except UnicodeEncodeError:
                # Windows konsoli uchun emoji siz versiya
                print(message.encode('ascii', errors='ignore').decode('ascii'), file=sys.stderr)
    
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
            
            # Corner mark filtri (5mm marks ~ 15-50px at typical scan resolution):
            if (10 <= w <= 100 and 10 <= h <= 100 and
                0.6 <= ar <= 1.6 and
                100 <= area <= 10000):
                
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
        corners = [c for c in corners if c['w'] < 80 and c['h'] < 80]

        if len(corners) < 4:
            self.log(f"QR kod filtrlangandan keyin faqat {len(corners)} ta corner mark qoldi")
            return None

        # 4 ta eng chekkadagi corner marklarni tanlash (geometric approach)
        # TL: min(x+y), TR: max(x-y), BL: max(y-x), BR: max(x+y)
        tl = min(corners, key=lambda c: c['x'] + c['y'])
        tr = max(corners, key=lambda c: c['x'] - c['y'])
        bl = max(corners, key=lambda c: c['y'] - c['x'])
        br = max(corners, key=lambda c: c['x'] + c['y'])

        # Validatsiya: to'rtburchak shaklini tekshirish
        # TL va TR bir xil Y da, BL va BR bir xil Y da bo'lishi kerak
        # TL va BL bir xil X da, TR va BR bir xil X da bo'lishi kerak
        img_h, img_w = image.shape[:2]
        min_side = min(img_w, img_h) * 0.3  # Minimal to'rtburchak tomoni

        width_top = abs(tr['x'] - tl['x'])
        width_bot = abs(br['x'] - bl['x'])
        height_left = abs(bl['y'] - tl['y'])
        height_right = abs(br['y'] - tr['y'])

        if width_top < min_side or width_bot < min_side or height_left < min_side or height_right < min_side:
            self.log(f"Corner marks to'rtburchak hosil qilmayapti (w_top={width_top}, w_bot={width_bot}, h_left={height_left}, h_right={height_right})")
            return None

        corner_marks = {
            'top_left': tl,
            'top_right': tr,
            'bottom_left': bl,
            'bottom_right': br
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
    
    def find_timing_marks(self, image):
        """Timing marklarni topish - kichik qora kvadratlar (3mm ~ 8-20px).
        Column header marks: har ustun boshida (X reference)
        Row marks: chap ustunda har 5-qatorda (Y reference)
        After perspective transform, answer grid starts at ~20% Y."""
        self.log("Timing marks topish...")
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        h_img, w_img = gray.shape[:2]

        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
        cnts, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # Timing mark = 3mm, bubble = 5.5mm. Strict size filter to separate them.
        # A4 width = 210mm → w_img pixels, so 1mm ≈ w_img/210
        mm_px = w_img / 210.0
        mark_size = 3 * mm_px  # Expected timing mark size
        bubble_size = 5.5 * mm_px  # Expected bubble size (must exclude!)
        # Range: 50%-160% of expected mark, but BELOW bubble size
        min_tm = max(4, int(mark_size * 0.5))
        max_tm = min(int(mark_size * 1.8), int(bubble_size * 0.7))  # Stay well below bubble
        if max_tm <= min_tm:
            max_tm = min_tm + 5
        min_area_tm = min_tm * min_tm
        max_area_tm = max_tm * max_tm

        # Only look in answer grid area (Y > 18% to skip header, Y < 97% to skip footer)
        y_grid_start = int(h_img * 0.18)
        y_grid_end = int(h_img * 0.97)
        # Corner exclusion zone
        corner_margin = int(min(w_img, h_img) * 0.04)

        self.log(f"  mm_px={mm_px:.1f}, mark={mark_size:.0f}px, bubble={bubble_size:.0f}px, range={min_tm}-{max_tm}")
        self.log(f"  Grid Y zone: {y_grid_start}-{y_grid_end}")

        marks = []
        for c in cnts:
            (x, y, w, h) = cv2.boundingRect(c)
            area = cv2.contourArea(c)
            ar = w / float(h) if h > 0 else 0
            cx = x + w // 2
            cy = y + h // 2

            # Skip outside answer grid area
            if cy < y_grid_start or cy > y_grid_end:
                continue
            # Skip corner marks
            if ((cx < corner_margin or cx > w_img - corner_margin) and
                (cy < corner_margin or cy > h_img - corner_margin)):
                continue

            # Square-ish, small, SOLID filled (timing marks are solid squares,
            # empty circle borders have low fill_ratio ~0.3)
            fill_ratio = area / (w * h) if w * h > 0 else 0
            if (min_tm <= w <= max_tm and min_tm <= h <= max_tm and
                0.7 <= ar <= 1.4 and min_area_tm <= area <= max_area_tm and
                fill_ratio > 0.75):
                marks.append({'x': cx, 'y': cy, 'w': w, 'h': h, 'area': area})

        self.log(f"  Timing mark candidates (in grid area): {len(marks)}")

        if len(marks) < 4:
            return None

        # Find header marks: topmost tight Y cluster (within 2% of image height)
        sorted_by_y = sorted(marks, key=lambda m: m['y'])
        header_y_tol = int(h_img * 0.025)  # Tight: ~2.5% of height
        header_marks = [sorted_by_y[0]]
        for m in sorted_by_y[1:]:
            if m['y'] - header_marks[0]['y'] < header_y_tol:
                header_marks.append(m)
            else:
                break

        # Sort by X and deduplicate (one mark per column)
        header_marks.sort(key=lambda m: m['x'])
        min_col_gap = max(20, int(w_img * 0.08))
        deduped = [header_marks[0]]
        for m in header_marks[1:]:
            if m['x'] - deduped[-1]['x'] > min_col_gap:
                deduped.append(m)
        header_marks = deduped

        self.log(f"  Column header marks: {len(header_marks)} at Y~{header_marks[0]['y']}")
        for i, m in enumerate(header_marks):
            self.log(f"    Col {i}: X={m['x']}, Y={m['y']}, size={m['w']}x{m['h']}")

        # Validate: header marks count should match expected columns
        total = self.TOTAL_QUESTIONS or 45
        if total <= 44:
            expected_cols = 2
        elif total <= 75:
            expected_cols = 3
        elif total <= 100:
            expected_cols = 4
        else:
            expected_cols = 5

        if len(header_marks) > expected_cols + 1:
            # Too many — probably noise. Keep only the ones with spacing closest to expected
            self.log(f"  Too many header marks ({len(header_marks)}), expected {expected_cols}. Filtering...")
            # Sort by X and try to pick evenly spaced ones
            expected_col_width = w_img * 0.85 / expected_cols
            filtered = [header_marks[0]]
            for m in header_marks[1:]:
                if m['x'] - filtered[-1]['x'] > expected_col_width * 0.5:
                    filtered.append(m)
            header_marks = filtered[:expected_cols]
            self.log(f"  Filtered to {len(header_marks)} header marks")

        if len(header_marks) < 2:
            return None

        # Row marks: below header, X close to leftmost header mark
        remaining = [m for m in marks if m not in header_marks and m['y'] > header_marks[0]['y'] + header_y_tol]
        left_x = header_marks[0]['x']
        x_tolerance = max(15, int(w_img * 0.04))
        row_marks = [m for m in remaining if abs(m['x'] - left_x) < x_tolerance]
        row_marks.sort(key=lambda m: m['y'])

        self.log(f"  Row timing marks: {len(row_marks)} at X~{left_x}")
        for i, m in enumerate(row_marks):
            self.log(f"    Row {i}: X={m['x']}, Y={m['y']}, size={m['w']}x{m['h']}")

        return {
            'header_marks': header_marks,
            'row_marks': row_marks
        }

    def build_grid_from_timing_marks(self, image, timing_marks):
        """Timing marks dan aniq grid pozitsiyalar hisoblash.
        Header marks → X pozitsiyalar (ustun boshlanishi)
        Row marks → Y pozitsiyalar (interpolatsiya bilan)"""
        h_img, w_img = image.shape[:2]
        header_marks = timing_marks['header_marks']
        row_marks = timing_marks['row_marks']

        total = self.TOTAL_QUESTIONS or 45
        n_cols = len(header_marks)
        if n_cols < 2:
            self.log("  Kam column marks, layout-based grid ga o'tilmoqda")
            return {}

        rows_per_col = (total + n_cols - 1) // n_cols
        self.log(f"  Timing grid: {n_cols} cols, {rows_per_col} rows/col, {total} questions")

        # X positions for each column from header marks
        col_x_starts = [m['x'] for m in header_marks]

        # Y positions: interpolate from row marks
        # Row marks are at known intervals (0, 5, 10, 15, 20, last)
        # We need to map these to actual row indices and interpolate
        if len(row_marks) >= 2:
            # Known row indices for timing marks: 0, 5, 10, 15, 20, (last)
            mark_indices = [0]
            for i in range(5, rows_per_col, 5):
                mark_indices.append(i)
            mark_indices.append(rows_per_col - 1)
            # Remove duplicates and sort
            mark_indices = sorted(set(mark_indices))

            # Match mark_indices to actual row_marks (they should be same count)
            if len(row_marks) > len(mark_indices):
                row_marks = row_marks[:len(mark_indices)]
            elif len(row_marks) < len(mark_indices):
                mark_indices = mark_indices[:len(row_marks)]

            # Build Y position lookup via interpolation
            mark_ys = [m['y'] for m in row_marks]
            all_row_ys = []
            for row in range(rows_per_col):
                # Find surrounding mark indices for interpolation
                if row <= mark_indices[0]:
                    all_row_ys.append(mark_ys[0])
                elif row >= mark_indices[-1]:
                    all_row_ys.append(mark_ys[-1])
                else:
                    # Linear interpolation between surrounding marks
                    for j in range(len(mark_indices) - 1):
                        if mark_indices[j] <= row <= mark_indices[j + 1]:
                            t = (row - mark_indices[j]) / (mark_indices[j + 1] - mark_indices[j])
                            y = mark_ys[j] + t * (mark_ys[j + 1] - mark_ys[j])
                            all_row_ys.append(int(y))
                            break
        else:
            # Not enough row marks, estimate from header marks and image height
            self.log("  Row marks insufficient, estimating Y positions")
            header_y = header_marks[0]['y']
            y_start = header_y + int(h_img * 0.02)
            y_end = int(h_img * 0.96)
            row_height = (y_end - y_start) / rows_per_col
            all_row_ys = [int(y_start + i * row_height + row_height * 0.5) for i in range(rows_per_col)]

        self.log(f"  Y positions ({len(all_row_ys)}): {all_row_ys[:5]}...{all_row_ys[-2:]}")

        # Estimate bubble size and spacing from header marks
        if n_cols >= 2:
            col_width = (col_x_starts[-1] - col_x_starts[0]) / (n_cols - 1)
        else:
            col_width = w_img * 0.8 / n_cols

        # Each column: timing_mark_area(~4mm) + number_area(~7mm) + 4 bubbles + gaps
        # Bubbles start after ~30% of column width
        # Number area takes ~20% of column width, bubbles take ~55%
        num_offset = col_width * 0.20
        bubble_zone_width = col_width * 0.55
        bubble_spacing = bubble_zone_width / 4
        bubble_size = max(8, int(bubble_spacing * 0.6))

        self.log(f"  Col width: {col_width:.0f}, bubble spacing: {bubble_spacing:.0f}, bubble size: {bubble_size}")

        # Build grid
        grid = {}
        letters = ['A', 'B', 'C', 'D']

        for col in range(n_cols):
            col_base_x = col_x_starts[col] + num_offset

            for row in range(rows_per_col):
                q_num = col * rows_per_col + row + 1
                if q_num > total:
                    break

                cy = all_row_ys[row]
                grid[q_num] = {}

                for bi, letter in enumerate(letters):
                    cx = int(col_base_x + bi * bubble_spacing + bubble_spacing * 0.5)
                    grid[q_num][letter] = {
                        'x': cx, 'y': cy,
                        'w': bubble_size, 'h': bubble_size,
                        'bbox': (cx - bubble_size // 2, cy - bubble_size // 2, bubble_size, bubble_size)
                    }

        self.log(f"  Timing marks grid: {len(grid)} questions")
        return grid

    def find_all_circles(self, image):
        """Barcha doirachalarni topish - contour-based multi-threshold"""
        self.log("Doirachalarni topish...")

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        h_img, w_img = gray.shape[:2]

        # Filter to bubble area only (skip header ~28%, skip footer ~3%)
        y_min = int(h_img * 0.28)
        y_max = int(h_img * 0.97)
        self.log(f"  Image: {w_img}x{h_img}, bubble area Y: {y_min}-{y_max}")

        # Adaptive size range
        estimated_bubble = w_img / 45
        min_size = max(8, int(estimated_bubble * 0.5))
        max_size = max(60, int(estimated_bubble * 2.0))
        min_area = max(50, int(estimated_bubble * estimated_bubble * 0.2))
        max_area = max(5000, int(estimated_bubble * estimated_bubble * 3.5))

        self.log(f"  Bubble est: {estimated_bubble:.0f}px, size: {min_size}-{max_size}, area: {min_area}-{max_area}")

        all_circles = {}

        def add_circle(cx, cy, w, h, source):
            if cy < y_min or cy > y_max:
                return  # Skip header/footer
            key = (round(cx / 6) * 6, round(cy / 6) * 6)
            if key not in all_circles:
                all_circles[key] = {
                    'x': cx, 'y': cy, 'w': w, 'h': h,
                    'bbox': (cx - w // 2, cy - h // 2, w, h),
                    'source': source
                }

        blurred = cv2.GaussianBlur(gray, (5, 5), 0)

        # Multiple threshold methods for robustness
        threshold_configs = [
            ('adaptive_11', cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)),
            ('adaptive_21', cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 4)),
            ('otsu', cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]),
        ]

        for method_name, thresh in threshold_configs:
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            cleaned = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
            cnts, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            count = 0
            for c in cnts:
                (x, y, w, h) = cv2.boundingRect(c)
                area = cv2.contourArea(c)
                ar = w / float(h) if h > 0 else 0

                if (min_size <= w <= max_size and min_size <= h <= max_size and
                    0.5 <= ar <= 2.0 and min_area <= area <= max_area):
                    perimeter = cv2.arcLength(c, True)
                    if perimeter > 0:
                        circularity = 4 * np.pi * area / (perimeter * perimeter)
                        if circularity > 0.35:
                            cx = x + w // 2
                            cy = y + h // 2
                            add_circle(cx, cy, w, h, method_name)
                            count += 1

            self.log(f"  {method_name}: {count} circles")

        circles = list(all_circles.values())
        self.log(f"  Total unique: {len(circles)} circles (in bubble area)")

        # If too few circles, also try CLAHE enhancement
        if len(circles) < 50:
            self.log("  Too few circles, trying CLAHE...")
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(gray)
            blurred2 = cv2.GaussianBlur(enhanced, (5, 5), 0)
            thresh2 = cv2.adaptiveThreshold(blurred2, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 3)
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            cleaned2 = cv2.morphologyEx(thresh2, cv2.MORPH_CLOSE, kernel)
            cnts2, _ = cv2.findContours(cleaned2, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            count = 0
            for c in cnts2:
                (x, y, w, h) = cv2.boundingRect(c)
                area = cv2.contourArea(c)
                ar = w / float(h) if h > 0 else 0
                if (min_size <= w <= max_size and min_size <= h <= max_size and
                    0.5 <= ar <= 2.0 and min_area <= area <= max_area):
                    perimeter = cv2.arcLength(c, True)
                    if perimeter > 0:
                        circularity = 4 * np.pi * area / (perimeter * perimeter)
                        if circularity > 0.35:
                            cx = x + w // 2
                            cy = y + h // 2
                            add_circle(cx, cy, w, h, 'clahe')
                            count += 1
            self.log(f"  clahe: {count} circles")
            circles = list(all_circles.values())
            self.log(f"  Total after CLAHE: {len(circles)} circles")

        return circles

    def build_template_grid(self, image, circles):
        """Template-based grid - aniqlangan doirachalardan grid pozitsiyalarini hisoblash.
        To'ldirilgan doirachalar kontur deteksiyada birlashib ketganda ishlatiladi."""
        self.log("Template-based grid yaratish...")

        if len(circles) < 4:
            return {}

        h_img, w_img = image.shape[:2]
        median_size = int(np.median([c['w'] for c in circles]))
        cluster_threshold = max(10, median_size // 2)
        self.log(f"  Median bubble: {median_size}px, cluster threshold: {cluster_threshold}px")

        # 1. X pozitsiyalarini klasterlash
        all_x = sorted([c['x'] for c in circles])
        x_clusters = []
        current_cluster = [all_x[0]]
        for i in range(1, len(all_x)):
            if all_x[i] - all_x[i-1] < cluster_threshold:
                current_cluster.append(all_x[i])
            else:
                x_clusters.append(int(np.mean(current_cluster)))
                current_cluster = [all_x[i]]
        x_clusters.append(int(np.mean(current_cluster)))

        self.log(f"  X klasterlar: {x_clusters}")

        # Dynamically detect number of question columns from X clusters
        # Each question column has 4 X positions (A, B, C, D)
        # Detect column groups by finding large gaps between X clusters
        if len(x_clusters) < 4:
            self.log("  X pozitsiyalar yetarli emas")
            return {}

        # Split X clusters into column groups by finding gaps
        # Sort clusters and find large gaps (> avg spacing * 2)
        sorted_xs = sorted(x_clusters)
        diffs = [sorted_xs[i+1] - sorted_xs[i] for i in range(len(sorted_xs) - 1)]
        avg_diff = np.mean(diffs) if diffs else 30

        # Group by large gaps (gaps > 1.8x average = column separator)
        column_groups = [[sorted_xs[0]]]
        for i in range(1, len(sorted_xs)):
            gap = sorted_xs[i] - sorted_xs[i-1]
            if gap > avg_diff * 1.8:
                column_groups.append([sorted_xs[i]])
            else:
                column_groups[-1].append(sorted_xs[i])

        self.log(f"  Detected {len(column_groups)} question column(s)")

        # Each column group should have 4 X positions (A, B, C, D)
        x_positions = []
        for group in column_groups:
            interpolated = self._interpolate_positions(group, 4)
            x_positions.extend(interpolated)

        self.log(f"  X pozitsiyalar: {x_positions}")

        # 2. Y pozitsiyalarini aniqlash
        all_y = sorted([c['y'] for c in circles])
        y_clusters = []
        current_cluster = [all_y[0]]
        for i in range(1, len(all_y)):
            if all_y[i] - all_y[i-1] < cluster_threshold:
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

    def build_grid_from_layout(self, image):
        """Layout-based grid - EXACT mm calculations matching answer sheet CSS.
        After perspective transform, warped image maps corner-to-corner.
        Corner marks at 2mm from page edge."""
        h_img, w_img = image.shape[:2]
        self.log(f"Layout-based grid: {w_img}x{h_img}")

        total = self.TOTAL_QUESTIONS or 45

        # Answer sheet layout parameters (must match AnswerSheet.tsx / pdfGeneratorService.ts)
        if total <= 44:
            n_cols, bubble_mm, gap_mm, row_margin_mm, col_gap_mm, num_w_mm = 2, 7.5, 2.5, 1.2, 8, 8
        elif total <= 60:
            n_cols, bubble_mm, gap_mm, row_margin_mm, col_gap_mm, num_w_mm = 3, 7.5, 2.5, 1.2, 6, 8
        elif total <= 75:
            n_cols, bubble_mm, gap_mm, row_margin_mm, col_gap_mm, num_w_mm = 3, 7, 2, 0.8, 5, 8
        elif total <= 100:
            n_cols, bubble_mm, gap_mm, row_margin_mm, col_gap_mm, num_w_mm = 4, 5.5, 2.5, 1.0, 4, 7
        else:
            n_cols, bubble_mm, gap_mm, row_margin_mm, col_gap_mm, num_w_mm = 5, 5.5, 1.2, 0.4, 3, 6

        timing_mark_area_mm = 4.0  # 3mm mark + 1mm gap
        rows_per_col = (total + n_cols - 1) // n_cols

        # Page: A4 210x297mm
        page_w_mm = 210.0
        page_h_mm = 297.0
        page_left_pad_mm = 12.0
        page_right_pad_mm = 12.0
        grid_pad_mm = 5.0     # Grid internal padding (padding: 0 5mm)
        header_row_mm = 4.0   # Column header row (A B C D)

        # Physical grid dimensions (from page layout, independent of image)
        grid_left_page_mm = page_left_pad_mm + grid_pad_mm  # 17mm from page left
        grid_right_page_mm = page_w_mm - page_right_pad_mm - grid_pad_mm  # 193mm
        grid_width_mm = grid_right_page_mm - grid_left_page_mm  # 176mm

        # Column layout in mm
        total_gaps_mm = (n_cols - 1) * col_gap_mm
        col_width_mm = (grid_width_mm - total_gaps_mm) / n_cols
        col_spacing_mm = col_width_mm + col_gap_mm  # Distance between column starts

        # Row height in mm
        row_height_mm = bubble_mm + 2 * row_margin_mm

        # Default px_per_mm from warped image (may be inaccurate if corners are wrong)
        corner_offset_mm = 2.0
        warped_w_mm = page_w_mm - 2 * corner_offset_mm  # 206mm
        warped_h_mm = page_h_mm - 2 * corner_offset_mm  # 293mm
        px_per_mm_x = w_img / warped_w_mm
        px_per_mm_y = h_img / warped_h_mm

        # CALIBRATE px_per_mm from timing marks (much more reliable than corner marks)
        has_timing_cols = hasattr(self, '_timing_header_marks') and self._timing_header_marks and len(self._timing_header_marks) >= 2
        has_timing_rows = hasattr(self, '_timing_row_marks') and self._timing_row_marks and len(self._timing_row_marks) >= 2

        if has_timing_cols:
            header_xs = [m['x'] for m in self._timing_header_marks]
            col_spacing_px = np.mean([header_xs[i+1] - header_xs[i] for i in range(len(header_xs) - 1)])
            px_per_mm_x = col_spacing_px / col_spacing_mm
            self.log(f"  px_per_mm_x calibrated from columns: {col_spacing_px:.0f}px / {col_spacing_mm:.1f}mm = {px_per_mm_x:.2f}")

        if has_timing_rows:
            row_marks = self._timing_row_marks
            mark_ys = [m['y'] for m in row_marks]
            spacings = [mark_ys[i+1] - mark_ys[i] for i in range(len(mark_ys) - 1)]
            median_spacing_px = float(np.median(spacings))
            row_height_px = median_spacing_px / 5.0  # Timing marks every 5 rows
            px_per_mm_y = row_height_px / row_height_mm
            self.log(f"  px_per_mm_y calibrated from rows: {median_spacing_px:.0f}px/5rows, row_h={row_height_px:.1f}px = {px_per_mm_y:.2f}")

        self.log(f"  px/mm: x={px_per_mm_x:.2f}, y={px_per_mm_y:.2f}")

        # Grid position: use timing marks for anchor points
        grid_top_mm = None
        grid_left_mm = None

        if has_timing_rows:
            mark_ys = [m['y'] for m in self._timing_row_marks]
            row_height_px = median_spacing_px / 5.0
            # First detected row mark is at row 5 (row 0 mark absorbed into header)
            first_mark_y = mark_ys[0]
            first_mark_row = 5
            row0_y_px = first_mark_y - first_mark_row * row_height_px
            # grid_top = row0_center_y - header_row - margin - bubble/2
            grid_top_mm = row0_y_px / px_per_mm_y - header_row_mm - row_margin_mm - bubble_mm / 2
            # Calibrate grid_left from timing mark X positions
            mark_x_px = np.mean([m['x'] for m in self._timing_row_marks])
            grid_left_mm = mark_x_px / px_per_mm_x - 1.5  # mark center = grid_left + 1.5mm
            self.log(f"  Grid anchor: row0_Y={row0_y_px:.0f}px, grid_top={grid_top_mm:.1f}mm, grid_left={grid_left_mm:.1f}mm")

        # Method 2: Circle density detection
        if grid_top_mm is None:
            grid_top_mm = self._detect_grid_top(image, px_per_mm_y, bubble_mm, header_row_mm=header_row_mm, row_margin_mm=row_margin_mm)

        if grid_top_mm is None:
            grid_top_mm = 62.0
            self.log(f"  Grid top fallback: {grid_top_mm:.0f}mm")

        if grid_left_mm is None:
            grid_left_mm = grid_left_page_mm - corner_offset_mm  # From corner mark

        # Bubble positions within a column (from column left edge)
        # [timing_area][number_area][A gap B gap C gap D]
        bubble_offset_mm = timing_mark_area_mm + num_w_mm
        # Bubble centers from column start
        bubble_centers_mm = []
        for bi in range(4):
            cx_mm = bubble_offset_mm + bi * (bubble_mm + gap_mm) + bubble_mm / 2
            bubble_centers_mm.append(cx_mm)

        self.log(f"  Layout: {n_cols} cols, {rows_per_col} rows, bubble={bubble_mm}mm, gap={gap_mm}mm")
        self.log(f"  Grid area: ({grid_left_mm:.0f},{grid_top_mm:.0f})mm, col_w={col_width_mm:.0f}mm")
        self.log(f"  px/mm: x={px_per_mm_x:.1f}, y={px_per_mm_y:.1f}")
        self.log(f"  Bubble X offsets in col: {[f'{b:.1f}' for b in bubble_centers_mm]}mm")

        grid = {}
        letters = ['A', 'B', 'C', 'D']
        bubble_size_px = max(8, int(bubble_mm * (px_per_mm_x + px_per_mm_y) / 2))

        for col in range(n_cols):
            col_left_mm = grid_left_mm + col * (col_width_mm + col_gap_mm)

            for row in range(rows_per_col):
                q_num = col * rows_per_col + row + 1
                if q_num > total:
                    break

                # Y center: grid_top + header_row + row*(row_height) + row_margin + bubble/2
                cy_mm = grid_top_mm + header_row_mm + row * row_height_mm + row_margin_mm + bubble_mm / 2
                cy = int(cy_mm * px_per_mm_y)

                grid[q_num] = {}
                for bi, letter in enumerate(letters):
                    cx_mm = col_left_mm + bubble_centers_mm[bi]
                    cx = int(cx_mm * px_per_mm_x)
                    grid[q_num][letter] = {
                        'x': cx, 'y': cy,
                        'w': bubble_size_px, 'h': bubble_size_px,
                        'bbox': (cx - bubble_size_px // 2, cy - bubble_size_px // 2, bubble_size_px, bubble_size_px)
                    }

        self.log(f"  Layout grid: {len(grid)} questions")
        if 1 in grid and total in grid:
            q1a = grid[1]['A']
            qlast = grid[total][letters[-1]]
            self.log(f"  Q1-A: ({q1a['x']},{q1a['y']}), Q{total}-D: ({qlast['x']},{qlast['y']})")

        return grid

    def _detect_grid_top(self, image, px_per_mm_y, bubble_mm, header_row_mm, row_margin_mm):
        """Detect where the answer grid starts using multi-threshold circle detection."""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        h_img, w_img = gray.shape[:2]

        bubble_px = bubble_mm * px_per_mm_y
        min_b = max(4, int(bubble_px * 0.4))
        max_b = int(bubble_px * 3.0)
        y_min_detect = int(h_img * 0.20)
        y_max_detect = int(h_img * 0.97)

        # Multi-threshold for robust circle detection
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        thresh_list = [
            cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2),
            cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 4),
            cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1],
        ]

        all_ys = {}
        for thresh in thresh_list:
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            cleaned = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
            cnts, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in cnts:
                (x, y, w, h) = cv2.boundingRect(c)
                cy = y + h // 2
                cx = x + w // 2
                if cy < y_min_detect or cy > y_max_detect:
                    continue
                if min_b <= w <= max_b and min_b <= h <= max_b:
                    ar = w / float(h) if h > 0 else 0
                    if 0.5 <= ar <= 2.0:
                        area = cv2.contourArea(c)
                        perimeter = cv2.arcLength(c, True)
                        if perimeter > 0 and 4 * np.pi * area / (perimeter * perimeter) > 0.3:
                            key = (round(cx / 8) * 8, round(cy / 8) * 8)
                            if key not in all_ys:
                                all_ys[key] = cy

        circles_y = sorted(all_ys.values())
        self.log(f"  Grid top detect: {len(circles_y)} unique circles")

        if len(circles_y) < 16:
            return None

        # Cluster by Y with generous threshold
        cluster_thr = max(12, int(bubble_px * 2.0))
        rows = []
        cluster = [circles_y[0]]
        for i in range(1, len(circles_y)):
            if circles_y[i] - circles_y[i - 1] < cluster_thr:
                cluster.append(circles_y[i])
            else:
                if len(cluster) >= 4:
                    rows.append(int(np.median(cluster)))
                cluster = [circles_y[i]]
        if len(cluster) >= 4:
            rows.append(int(np.median(cluster)))

        self.log(f"  Grid top detect: {len(rows)} rows with 4+ circles")

        if len(rows) >= 3:
            # Find densest consecutive row group
            best_start = 0
            best_count = 1
            for i in range(len(rows)):
                count = 1
                for j in range(i + 1, len(rows)):
                    avg_gap = (rows[j] - rows[i]) / (j - i)
                    actual_gap = rows[j] - rows[j - 1]
                    if 0.4 * avg_gap < actual_gap < 2.0 * avg_gap:
                        count += 1
                    else:
                        break
                if count > best_count:
                    best_count = count
                    best_start = i
            first_bubble_y_px = rows[best_start]
            self.log(f"  Grid top detect: best group row[{best_start}]={first_bubble_y_px}px, {best_count} rows")
        else:
            # Fallback: use Y density histogram to find grid start
            # The grid area has the highest density of circles
            bin_size = max(10, int(bubble_px * 2))
            y_min = circles_y[0]
            y_max = circles_y[-1]
            best_y = y_min
            best_density = 0
            # Sliding window: size of expected grid height (~60% of image)
            window = int(h_img * 0.55)
            for start_y in range(y_min, y_max - window // 2, bin_size):
                count = sum(1 for y in circles_y if start_y <= y <= start_y + window)
                if count > best_density:
                    best_density = count
                    best_y = start_y
            # First bubble is near the top of this dense region
            # Use the 5th percentile of circles within this window
            window_circles = sorted([y for y in circles_y if best_y <= y <= best_y + window])
            # Find first dense Y bin (>=8 circles) — skip sparse header elements
            row_h_px = max(8, int((bubble_mm + 2 * row_margin_mm) * px_per_mm_y))
            first_bubble_y_px = window_circles[0]
            for bin_y in range(int(window_circles[0]), int(window_circles[-1]), row_h_px):
                bin_count = sum(1 for y in window_circles if bin_y <= y < bin_y + row_h_px)
                if bin_count >= 8:  # Full question row: 4 cols × 4 options, ≥8 detected
                    first_bubble_y_px = bin_y + row_h_px // 2
                    break
            self.log(f"  Grid top detect (density): window start={best_y}, first question row Y={first_bubble_y_px}px")
        # grid_top_mm = first_bubble_center_mm - header_row - row_margin - bubble/2
        first_bubble_mm = first_bubble_y_px / px_per_mm_y
        grid_top_mm = first_bubble_mm - header_row_mm - row_margin_mm - bubble_mm / 2
        self.log(f"  Grid top detect: first row Y={first_bubble_y_px}px = {first_bubble_mm:.1f}mm, grid_top={grid_top_mm:.1f}mm ({len(rows)} rows found)")
        return grid_top_mm

    def _calibrate_grid(self, image, grid, bubble_px, px_mm_x, px_mm_y):
        """Detect actual circle positions and shift grid to match them."""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        h_img, w_img = gray.shape[:2]

        # Find circle-like contours in answer grid area only
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
        cnts, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        min_b = max(6, int(bubble_px * 0.5))
        max_b = int(bubble_px * 2.5)
        # Only look in grid area (Y: 15%-97%, X: 3%-97%)
        y_min_cal = int(h_img * 0.15)
        y_max_cal = int(h_img * 0.97)
        x_min_cal = int(w_img * 0.03)
        x_max_cal = int(w_img * 0.97)

        circles = []
        for c in cnts:
            (x, y, w, h) = cv2.boundingRect(c)
            cx, cy = x + w // 2, y + h // 2
            if cy < y_min_cal or cy > y_max_cal or cx < x_min_cal or cx > x_max_cal:
                continue
            area = cv2.contourArea(c)
            if min_b <= w <= max_b and min_b <= h <= max_b:
                ar = w / float(h) if h > 0 else 0
                if 0.6 <= ar <= 1.5:
                    perimeter = cv2.arcLength(c, True)
                    if perimeter > 0:
                        circ = 4 * np.pi * area / (perimeter * perimeter)
                        if circ > 0.3:
                            circles.append({'x': cx, 'y': cy, 'w': w, 'h': h})

        if len(circles) < 20:
            self.log(f"  Calibration: only {len(circles)} circles found, skipping")
            return grid

        self.log(f"  Calibration: {len(circles)} circles detected")

        # Find the Y of the topmost cluster of circles (first bubble row)
        ys = sorted([c['y'] for c in circles])
        # Cluster by Y
        y_clusters = []
        cluster = [ys[0]]
        for i in range(1, len(ys)):
            if ys[i] - ys[i - 1] < bubble_px:
                cluster.append(ys[i])
            else:
                if len(cluster) >= 4:  # At least 4 bubbles per row
                    y_clusters.append(int(np.median(cluster)))
                cluster = [ys[i]]
        if len(cluster) >= 4:
            y_clusters.append(int(np.median(cluster)))

        if not y_clusters:
            self.log("  Calibration: no valid Y clusters")
            return grid

        detected_first_row_y = y_clusters[0]
        # Grid's first row Y
        q1 = grid.get(1)
        if not q1:
            return grid
        grid_first_row_y = q1['A']['y']

        dy = detected_first_row_y - grid_first_row_y
        self.log(f"  Calibration: detected first row Y={detected_first_row_y}, grid Y={grid_first_row_y}, dy={dy}")

        # Also calibrate X using leftmost circles cluster
        xs = sorted([c['x'] for c in circles if c['y'] < detected_first_row_y + bubble_px * 2])
        if len(xs) >= 4:
            detected_first_x = int(np.median(xs[:4]))  # First 4 X values = A column of first column
            grid_first_x = q1['A']['x']
            dx = detected_first_x - grid_first_x
        else:
            dx = 0

        if abs(dy) < 3 and abs(dx) < 3:
            self.log("  Calibration: grid already aligned")
            return grid

        self.log(f"  Calibration: shifting grid by dx={dx}, dy={dy}")

        # Apply offset to all grid positions
        for q_num in grid:
            for letter in grid[q_num]:
                pos = grid[q_num][letter]
                pos['x'] += dx
                pos['y'] += dy
                pos['bbox'] = (pos['x'] - pos['w'] // 2, pos['y'] - pos['h'] // 2, pos['w'], pos['h'])

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

        # Adaptive Y threshold based on median bubble size
        median_h = int(np.median([c['h'] for c in circles]))
        y_threshold = max(10, median_h // 2)
        self.log(f"  Median bubble: {median_h}px, Y threshold: {y_threshold}px")

        # Y bo'yicha saralash
        circles_sorted = sorted(circles, key=lambda c: c['y'])

        # Qatorlarni aniqlash - clustering
        rows = []
        current_row = [circles_sorted[0]]
        prev_y = circles_sorted[0]['y']

        for i in range(1, len(circles_sorted)):
            curr_y = circles_sorted[i]['y']
            y_diff = curr_y - prev_y

            # Adaptive threshold
            if y_diff < y_threshold:
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
        """Doiracha to'ldirilganligini tekshirish - 3 ta method.
        Uses inner 60% of bubble to avoid border/adjacent noise."""
        x, y, w, h = circle['bbox']
        # Shrink ROI to inner 80% — avoids circle border and adjacent elements
        shrink = int(w * 0.10)
        x, y, w, h = x + shrink, y + shrink, w - 2 * shrink, h - 2 * shrink
        if w < 4 or h < 4:
            w, h = max(w, 4), max(h, 4)

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

            # Determine expected columns
            expected_questions = self.TOTAL_QUESTIONS or 30
            if expected_questions <= 44:
                expected_cols = 2
            elif expected_questions <= 75:
                expected_cols = 3
            elif expected_questions <= 100:
                expected_cols = 4
            else:
                expected_cols = 5

            # Try timing marks first (most precise)
            timing_marks = self.find_timing_marks(warped)
            # Save timing data for layout grid
            self._timing_header_y = None
            self._timing_row_marks = None
            self._timing_header_marks = None
            if timing_marks:
                if timing_marks.get('header_marks'):
                    self._timing_header_y = timing_marks['header_marks'][0]['y']
                    self._timing_header_marks = timing_marks['header_marks']
                if timing_marks.get('row_marks') and len(timing_marks['row_marks']) >= 2:
                    self._timing_row_marks = timing_marks['row_marks']

            grid = {}
            # Skip timing marks grid — row mark indices are misaligned (start at row 5, not 0)
            # Layout grid with _timing_row_marks calibration is more accurate
            if len(grid) < expected_questions * 0.6:
                self.log("Timing marks insufficient, trying layout grid...")
                grid = self.build_grid_from_layout(warped)

            if len(grid) < expected_questions * 0.6:
                # Fallback to circle detection
                self.log("Layout grid insufficient, trying circle detection...")
                circles = self.find_all_circles(warped)
                if circles:
                    grid = self.group_circles_into_grid(circles)
                    if len(grid) < expected_questions * 0.6:
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
        DELTA_THRESHOLD = 12.0  # Max va ikkinchi o'rtasida min farq (%)

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
            elif max_fill < self.current_threshold or delta < DELTA_THRESHOLD:
                # Javob yo'q: fill YOKI delta yetarli emas
                self.log(f"  Q{question_num}: Javob yo'q (max={max_fill:.1f}%, delta={delta:.1f}%)")
            else:
                # Bitta aniq javob: fill >= threshold VA delta >= DELTA_THRESHOLD
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
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Usage: python omr_hybrid.py <image_path> [correct_answers_json] [options_json]"}))
        sys.exit(1)

    image_path = sys.argv[1]
    correct_answers_json = sys.argv[2] if len(sys.argv) > 2 else '{}'
    options_json = sys.argv[3] if len(sys.argv) > 3 else '{}'

    try:
        correct_answers = json.loads(correct_answers_json)
    except json.JSONDecodeError:
        correct_answers = {}

    # Read totalQuestions from options
    total_questions = None
    try:
        options = json.loads(options_json)
        if 'totalQuestions' in options:
            total_questions = int(options['totalQuestions'])
    except (json.JSONDecodeError, ValueError):
        pass

    omr = HybridOMR(debug=True, total_questions=total_questions)
    result = omr.scan(image_path, correct_answers)

    # Only JSON to stdout (debug goes to stderr)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
