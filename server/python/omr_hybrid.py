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
        self.FILL_THRESHOLD_WITH_CORNERS = 30.0  # Phone photos: baseline ~18-25%, filled ~30%+
        self.FILL_THRESHOLD_WITHOUT_CORNERS = 30.0  # Marker-free
        self.current_threshold = 30.0  # Default
    
    def log(self, message):
        if self.debug:
            try:
                print(message, file=sys.stderr)
            except UnicodeEncodeError:
                # Windows konsoli uchun emoji siz versiya
                print(message.encode('ascii', errors='ignore').decode('ascii'), file=sys.stderr)
    
    def find_corner_marks(self, image):
        """4 ta burchak kvadratlarini topish — resolution-adaptive, multi-threshold"""
        self.log("Corner marks topish...")

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        img_h, img_w = gray.shape[:2]

        # Resolution-adaptive sizing: corner mark = 5mm square
        mm_px = img_w / 210.0
        expected_mark_px = 5.0 * mm_px
        min_mark = max(8, int(expected_mark_px * 0.4))
        max_mark = int(expected_mark_px * 2.5)
        min_area = min_mark * min_mark
        max_area = max_mark * max_mark
        self.log(f"  Image: {img_w}x{img_h}, mm_px={mm_px:.1f}, mark={expected_mark_px:.0f}px, range=[{min_mark}-{max_mark}]")

        edge_x = int(img_w * 0.25)
        edge_y = int(img_h * 0.25)

        # Multi-threshold: Otsu + adaptive (for shadowed corners)
        _, thresh_otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
        thresh_adapt = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                              cv2.THRESH_BINARY_INV, 51, 10)
        # CLAHE for shadow-heavy images
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        _, thresh_clahe = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)

        all_corners = {}  # key=(cx,cy) -> corner dict, deduplicate across thresholds
        for t_name, thresh in [('otsu', thresh_otsu), ('adapt', thresh_adapt), ('clahe', thresh_clahe)]:
            cnts, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            count = 0
            for c in cnts:
                (x, y, w, h) = cv2.boundingRect(c)
                area = cv2.contourArea(c)
                ar = w / float(h) if h > 0 else 0

                if not (min_mark <= w <= max_mark and min_mark <= h <= max_mark):
                    continue
                if not (min_area <= area <= max_area):
                    continue
                if not (0.6 <= ar <= 1.7):
                    continue

                cx = x + w // 2
                cy = y + h // 2

                near_left = cx < edge_x
                near_right = cx > (img_w - edge_x)
                near_top = cy < edge_y
                near_bottom = cy > (img_h - edge_y)
                if not ((near_left or near_right) and (near_top or near_bottom)):
                    continue

                rect_area = w * h
                fill_ratio = area / rect_area if rect_area > 0 else 0
                if fill_ratio < 0.5:
                    continue

                hull = cv2.convexHull(c)
                hull_area = cv2.contourArea(hull)
                solidity = area / hull_area if hull_area > 0 else 0
                if solidity < 0.65:
                    continue

                # Deduplicate: merge if within expected_mark_px distance
                key = None
                for (kx, ky) in all_corners:
                    if abs(kx - cx) < expected_mark_px and abs(ky - cy) < expected_mark_px:
                        key = (kx, ky)
                        break
                if key is None:
                    key = (cx, cy)

                quadrant = ('T' if near_top else 'B') + ('L' if near_left else 'R')
                entry = {
                    'x': cx, 'y': cy, 'w': w, 'h': h,
                    'bbox': (x, y, w, h), 'area': area,
                    'fill': fill_ratio, 'solidity': solidity,
                    'quadrant': quadrant
                }
                # Keep the one with better fill
                if key not in all_corners or fill_ratio > all_corners[key]['fill']:
                    all_corners[key] = entry
                count += 1
            self.log(f"  {t_name}: {count} candidates")

        corners = list(all_corners.values())
        self.log(f"  Total unique candidates: {len(corners)}")
        if self.debug:
            for i, c in enumerate(corners[:16]):
                self.log(f"    #{i+1}: ({c['x']},{c['y']}) {c['w']}x{c['h']} fill={c['fill']:.2f} q={c['quadrant']}")

        if len(corners) < 3:
            self.log(f"Faqat {len(corners)} ta corner mark topildi (min 3 kerak)")
            return None

        # Group by quadrant
        quadrants = {'TL': [], 'TR': [], 'BL': [], 'BR': []}
        for c in corners:
            q = c['quadrant']
            if q in quadrants:
                quadrants[q].append(c)

        missing = [q for q, lst in quadrants.items() if len(lst) == 0]

        if len(missing) == 0:
            # All 4 quadrants found — pick best per quadrant
            return self._pick_best_corners(quadrants, img_w, img_h)
        elif len(missing) == 1:
            # 1 corner missing — estimate from other 3
            self.log(f"  Missing {missing[0]}, estimating from other 3")
            return self._estimate_missing_corner(quadrants, missing[0], img_w, img_h)
        else:
            self.log(f"Missing corners: {missing}, trying geometric fallback")
            return self._select_corners_geometric(corners, img_w, img_h)

    def _pick_best_corners(self, quadrants, img_w, img_h):
        """Pick best candidate per quadrant, with parallelism validation"""
        result = {}
        for q_name, q_corners in quadrants.items():
            if q_name == 'TL':
                q_corners.sort(key=lambda c: c['x'] + c['y'])
            elif q_name == 'TR':
                q_corners.sort(key=lambda c: (img_w - c['x']) + c['y'])
            elif q_name == 'BL':
                q_corners.sort(key=lambda c: c['x'] + (img_h - c['y']))
            elif q_name == 'BR':
                q_corners.sort(key=lambda c: (img_w - c['x']) + (img_h - c['y']))
            result[q_name] = q_corners[0]

        corner_marks = {
            'top_left': result['TL'], 'top_right': result['TR'],
            'bottom_left': result['BL'], 'bottom_right': result['BR']
        }

        if not self._validate_rectangle(corner_marks, img_w, img_h):
            return None

        # Parallelism check: top/bottom widths and left/right heights should be close
        tl, tr = result['TL'], result['TR']
        bl, br = result['BL'], result['BR']
        w_top = abs(tr['x'] - tl['x'])
        w_bot = abs(br['x'] - bl['x'])
        h_left = abs(bl['y'] - tl['y'])
        h_right = abs(br['y'] - tr['y'])

        w_ratio = min(w_top, w_bot) / max(w_top, w_bot) if max(w_top, w_bot) > 0 else 0
        h_ratio = min(h_left, h_right) / max(h_left, h_right) if max(h_left, h_right) > 0 else 0

        self.log(f"  Parallelism: w_ratio={w_ratio:.3f}, h_ratio={h_ratio:.3f}")

        if w_ratio < 0.95 or h_ratio < 0.95:
            # Bad parallelism — find worst corner by distance to image edge
            # Good corners are close to their image corners
            import math
            img_corners = {'TL': (0, 0), 'TR': (img_w, 0), 'BL': (0, img_h), 'BR': (img_w, img_h)}
            diag = math.sqrt(img_w**2 + img_h**2)

            # Score each detected corner: lower distance = better
            corner_dists = {}
            for q_name in ['TL', 'TR', 'BL', 'BR']:
                c = result[q_name]
                ix, iy = img_corners[q_name]
                dist = math.sqrt((c['x'] - ix)**2 + (c['y'] - iy)**2) / diag
                corner_dists[q_name] = dist

            # The worst corner (farthest from image corner) should be estimated
            worst_q = max(corner_dists, key=corner_dists.get)
            self.log(f"  Corner distances: {', '.join(f'{k}={v:.3f}' for k,v in corner_dists.items())}")
            self.log(f"  Worst corner: {worst_q} (dist={corner_dists[worst_q]:.3f}), estimating from other 3")

            sub_quads = {k: v for k, v in quadrants.items() if k != worst_q}
            if all(len(v) > 0 for v in sub_quads.values()):
                marks = self._estimate_missing_corner(sub_quads, worst_q, img_w, img_h)
                if marks:
                    return marks

        self.log(f"4 ta corner mark topildi:")
        for name, c in corner_marks.items():
            self.log(f"  {name}: ({c['x']},{c['y']}) {c['w']}x{c['h']}")
        return corner_marks

    def _estimate_missing_corner(self, quadrants, missing_q, img_w, img_h):
        """Estimate missing corner from 3 known corners: BR = TR + BL - TL etc."""
        known = {}
        for q_name, q_corners in quadrants.items():
            if len(q_corners) > 0:
                # Pick best: closest to image corner
                if q_name == 'TL':
                    q_corners.sort(key=lambda c: c['x'] + c['y'])
                elif q_name == 'TR':
                    q_corners.sort(key=lambda c: (img_w - c['x']) + c['y'])
                elif q_name == 'BL':
                    q_corners.sort(key=lambda c: c['x'] + (img_h - c['y']))
                elif q_name == 'BR':
                    q_corners.sort(key=lambda c: (img_w - c['x']) + (img_h - c['y']))
                known[q_name] = q_corners[0]

        if len(known) < 3:
            self.log(f"Cannot estimate: only {len(known)} corners known")
            return None

        # Parallelogram estimation: missing = opposite_diagonal + adjacent - other_adjacent
        # TL + BR = TR + BL (parallelogram property)
        if missing_q == 'BR':
            est_x = known['TR']['x'] + known['BL']['x'] - known['TL']['x']
            est_y = known['TR']['y'] + known['BL']['y'] - known['TL']['y']
        elif missing_q == 'BL':
            est_x = known['TL']['x'] + known['BR']['x'] - known['TR']['x']
            est_y = known['TL']['y'] + known['BR']['y'] - known['TR']['y']
        elif missing_q == 'TR':
            est_x = known['TL']['x'] + known['BR']['x'] - known['BL']['x']
            est_y = known['TL']['y'] + known['BR']['y'] - known['BL']['y']
        elif missing_q == 'TL':
            est_x = known['TR']['x'] + known['BL']['x'] - known['BR']['x']
            est_y = known['TR']['y'] + known['BL']['y'] - known['BR']['y']
        else:
            return None

        # Use average mark size from known corners
        avg_w = int(np.mean([c['w'] for c in known.values()]))
        avg_h = int(np.mean([c['h'] for c in known.values()]))

        estimated = {
            'x': int(est_x), 'y': int(est_y),
            'w': avg_w, 'h': avg_h,
            'bbox': (int(est_x) - avg_w // 2, int(est_y) - avg_h // 2, avg_w, avg_h),
            'area': avg_w * avg_h,
            'fill': 0.8, 'solidity': 0.9,
            'quadrant': missing_q, 'estimated': True
        }

        self.log(f"  Estimated {missing_q}: ({estimated['x']},{estimated['y']})")

        q_map = {'TL': 'top_left', 'TR': 'top_right', 'BL': 'bottom_left', 'BR': 'bottom_right'}
        corner_marks = {}
        for q_name, full_name in q_map.items():
            corner_marks[full_name] = known[q_name] if q_name in known else estimated

        if not self._validate_rectangle(corner_marks, img_w, img_h):
            return None

        self.log(f"3+1 corner marks (estimated {missing_q}):")
        for name, c in corner_marks.items():
            est_tag = " [EST]" if c.get('estimated') else ""
            self.log(f"  {name}: ({c['x']},{c['y']}) {c['w']}x{c['h']}{est_tag}")
        return corner_marks

    def _validate_rectangle(self, corner_marks, img_w, img_h):
        """Validate that corners form a reasonable rectangle"""
        tl, tr = corner_marks['top_left'], corner_marks['top_right']
        bl, br = corner_marks['bottom_left'], corner_marks['bottom_right']
        min_side = min(img_w, img_h) * 0.3

        width_top = abs(tr['x'] - tl['x'])
        width_bot = abs(br['x'] - bl['x'])
        height_left = abs(bl['y'] - tl['y'])
        height_right = abs(br['y'] - tr['y'])

        if width_top < min_side or width_bot < min_side or height_left < min_side or height_right < min_side:
            self.log(f"Rectangle invalid (w_top={width_top}, w_bot={width_bot}, h_left={height_left}, h_right={height_right})")
            return False
        return True

    def _select_corners_geometric(self, corners, img_w, img_h):
        """Fallback: select 4 corners geometrically when quadrant grouping fails"""
        tl = min(corners, key=lambda c: c['x'] + c['y'])
        tr = max(corners, key=lambda c: c['x'] - c['y'])
        bl = max(corners, key=lambda c: c['y'] - c['x'])
        br = max(corners, key=lambda c: c['x'] + c['y'])

        corner_marks = {
            'top_left': tl, 'top_right': tr,
            'bottom_left': bl, 'bottom_right': br
        }

        if not self._validate_rectangle(corner_marks, img_w, img_h):
            self.log(f"Geometric fallback ham ishlamadi")
            return None

        self.log(f"Geometric fallback bilan 4 ta corner topildi")
        for name, c in corner_marks.items():
            self.log(f"  {name}: ({c['x']},{c['y']}) {c['w']}x{c['h']}")
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

        # Force A4 aspect ratio: corner marks span 201mm x 288mm
        # (5mm marks at 2mm from edge, centers at 4.5mm from edge)
        SPAN_W_MM = 201.0
        SPAN_H_MM = 288.0
        target_aspect = SPAN_W_MM / SPAN_H_MM
        current_aspect = maxWidth / maxHeight if maxHeight > 0 else 1.0

        if current_aspect > target_aspect:
            maxHeight = int(maxWidth / target_aspect)
        else:
            maxWidth = int(maxHeight * target_aspect)

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
    
    # ===== Detection-first approach (v2) =====

    def _preprocess(self, image):
        """Resize to ~1000px width + CLAHE contrast enhancement"""
        h, w = image.shape[:2]
        TARGET_W = 1000
        scale = TARGET_W / w
        new_h = int(h * scale)
        interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
        resized = cv2.resize(image, (TARGET_W, new_h), interpolation=interp)
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY) if len(resized.shape) == 3 else resized
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        self.log(f"Preprocess: {w}x{h} -> {TARGET_W}x{new_h}, scale={scale:.3f}")
        return resized, enhanced, scale

    def _detect_bubbles(self, gray):
        """Detect all circle-like contours in preprocessed grayscale image"""
        h_img, w_img = gray.shape[:2]
        px_mm = w_img / 201.0
        expected = 5.5 * px_mm
        min_s = max(10, int(expected * 0.65))
        max_s = int(expected * 2.0)
        y_min = int(h_img * 0.28)
        y_max = int(h_img * 0.97)

        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        threshs = [
            ('otsu', cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]),
            ('adapt11', cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)),
            ('adapt21', cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 4)),
        ]

        dedup_d = max(4, int(expected * 0.3))
        all_b = {}

        for t_name, thresh in threshs:
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            cleaned = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
            cnts, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            count = 0
            for c in cnts:
                x, y, w, h = cv2.boundingRect(c)
                cx, cy = x + w // 2, y + h // 2
                if cy < y_min or cy > y_max:
                    continue
                if not (min_s <= w <= max_s and min_s <= h <= max_s):
                    continue
                ar = w / float(h)
                if not (0.6 <= ar <= 1.7):
                    continue
                area = cv2.contourArea(c)
                peri = cv2.arcLength(c, True)
                if peri <= 0:
                    continue
                circ = 4 * np.pi * area / (peri * peri)
                if circ < 0.4:
                    continue
                key = (round(cx / dedup_d) * dedup_d, round(cy / dedup_d) * dedup_d)
                if key not in all_b:
                    all_b[key] = {'x': cx, 'y': cy, 'w': w, 'h': h}
                    count += 1
            self.log(f"  {t_name}: {count} new bubbles")

        result = list(all_b.values())
        self.log(f"Total bubbles: {len(result)} (y={y_min}-{y_max}, size={min_s}-{max_s})")
        return result

    def _build_grid(self, bubbles, w_img, h_img):
        """Build question grid by clustering detected bubble positions"""
        if len(bubbles) < 16:
            self.log(f"Too few bubbles ({len(bubbles)})")
            return {}

        total = self.TOTAL_QUESTIONS or 45
        if total <= 44: n_cols = 2
        elif total <= 75: n_cols = 3
        elif total <= 100: n_cols = 4
        else: n_cols = 5
        rows_per_col = (total + n_cols - 1) // n_cols

        median_w = int(np.median([b['w'] for b in bubbles]))
        self.log(f"Grid: {total}q, expect {n_cols}cols x {rows_per_col}rows, bubble={median_w}px")

        # 1. Cluster Y -> rows
        y_thr = max(6, int(median_w * 0.5))
        sorted_y = sorted(bubbles, key=lambda b: b['y'])
        y_rows_raw = []
        cl = [sorted_y[0]]
        for i in range(1, len(sorted_y)):
            if sorted_y[i]['y'] - cl[-1]['y'] < y_thr:
                cl.append(sorted_y[i])
            else:
                y_rows_raw.append(cl)
                cl = [sorted_y[i]]
        y_rows_raw.append(cl)

        min_per_row = max(4, n_cols * 2)
        y_rows = [r for r in y_rows_raw if len(r) >= min_per_row]
        self.log(f"  Y rows: {len(y_rows)} with {min_per_row}+ bubbles")

        if len(y_rows) < 3:
            return {}

        # 2. X histogram: find stable column positions
        all_x = [b['x'] for row in y_rows for b in row]
        x_sorted = sorted(all_x)
        x_cl_thr = max(4, int(median_w * 0.4))
        min_hits = max(3, len(y_rows) // 4)

        x_clusters = []
        cl_x = [x_sorted[0]]
        for xi in x_sorted[1:]:
            if xi - cl_x[-1] < x_cl_thr:
                cl_x.append(xi)
            else:
                if len(cl_x) >= min_hits:
                    x_clusters.append(int(np.median(cl_x)))
                cl_x = [xi]
        if len(cl_x) >= min_hits:
            x_clusters.append(int(np.median(cl_x)))

        self.log(f"  X clusters: {len(x_clusters)} positions: {x_clusters}")

        if len(x_clusters) < 4:
            # Retry with lower threshold
            x_clusters = []
            cl_x = [x_sorted[0]]
            for xi in x_sorted[1:]:
                if xi - cl_x[-1] < x_cl_thr:
                    cl_x.append(xi)
                else:
                    if len(cl_x) >= 2:
                        x_clusters.append(int(np.median(cl_x)))
                    cl_x = [xi]
            if len(cl_x) >= 2:
                x_clusters.append(int(np.median(cl_x)))
            self.log(f"  X clusters (loose): {len(x_clusters)}")

        if len(x_clusters) < 4:
            return {}

        # 3. Group X into column groups using natural gap detection
        diffs = [x_clusters[i+1] - x_clusters[i] for i in range(len(x_clusters) - 1)]
        self.log(f"  X diffs: {[f'{d:.0f}' for d in diffs]}")

        # Find natural break: sort diffs, find largest jump between consecutive
        sorted_diffs = sorted(diffs)
        best_jump, best_pos = 0, 0
        for i in range(len(sorted_diffs) - 1):
            jump = sorted_diffs[i+1] - sorted_diffs[i]
            if jump > best_jump:
                best_jump = jump
                best_pos = i
        gap_threshold = (sorted_diffs[best_pos] + sorted_diffs[best_pos + 1]) / 2
        self.log(f"  Gap threshold: {gap_threshold:.0f}px (jump={best_jump:.0f})")

        col_groups = [[x_clusters[0]]]
        for i in range(1, len(x_clusters)):
            if x_clusters[i] - x_clusters[i-1] > gap_threshold:
                col_groups.append([x_clusters[i]])
            else:
                col_groups[-1].append(x_clusters[i])

        self.log(f"  Col groups: {len(col_groups)}, sizes={[len(g) for g in col_groups]}")

        # 4. Normalize each group to 4 positions (A,B,C,D)
        # Compute expected spacing from groups that already have 4
        ref_spacings = []
        for g in col_groups:
            if len(g) == 4:
                ref_spacings.extend([g[i+1]-g[i] for i in range(3)])
        within_diffs = [d for d in diffs if d <= gap_threshold]
        expected_spacing = float(np.median(ref_spacings)) if ref_spacings else (float(np.median(within_diffs)) if within_diffs else 40)
        self.log(f"  Expected within-col spacing: {expected_spacing:.0f}px")

        final_cols = []
        for gi, group in enumerate(col_groups):
            if len(group) == 4:
                final_cols.append(group)
            elif len(group) > 4:
                # Find best 4-consecutive subset with spacing closest to expected
                best_sub, best_score = group[:4], float('inf')
                for si in range(len(group) - 3):
                    sub = group[si:si+4]
                    sub_diffs = [sub[i+1]-sub[i] for i in range(3)]
                    score = sum((d - expected_spacing)**2 for d in sub_diffs)
                    if score < best_score:
                        best_score = score
                        best_sub = sub
                self.log(f"  Col {gi}: {len(group)} -> picked {best_sub}")
                final_cols.append(best_sub)
            elif len(group) >= 2:
                # Interpolate to 4 using expected spacing, centered on group
                center = (group[0] + group[-1]) / 2.0
                final_cols.append([int(center + (i - 1.5) * expected_spacing) for i in range(4)])

        if not final_cols:
            return {}

        if len(final_cols) != n_cols:
            self.log(f"  Adjusted: {n_cols} -> {len(final_cols)} cols")
            n_cols = len(final_cols)
            rows_per_col = (total + n_cols - 1) // n_cols

        # 5. Row Y positions (select best rows_per_col rows)
        row_ys = sorted([int(np.median([b['y'] for b in row])) for row in y_rows])

        if len(row_ys) > rows_per_col + 3:
            best_start, best_var = 0, float('inf')
            for i in range(len(row_ys) - rows_per_col + 1):
                subset = row_ys[i:i + rows_per_col]
                spacings = [subset[j+1] - subset[j] for j in range(len(subset)-1)]
                var = float(np.std(spacings))
                if var < best_var:
                    best_var = var
                    best_start = i
            row_ys = row_ys[best_start:best_start + rows_per_col]

        actual_rows = min(len(row_ys), rows_per_col)

        # 6. Build grid
        grid = {}
        letters = ['A', 'B', 'C', 'D']
        for col_idx in range(n_cols):
            col_x = final_cols[col_idx]
            for row_idx in range(actual_rows):
                q = col_idx * rows_per_col + row_idx + 1
                if q > total:
                    break
                cy = row_ys[row_idx]
                grid[q] = {}
                for bi, letter in enumerate(letters):
                    cx = col_x[bi]
                    grid[q][letter] = {
                        'x': cx, 'y': cy, 'w': median_w, 'h': median_w,
                        'bbox': (cx - median_w // 2, cy - median_w // 2, median_w, median_w)
                    }

        self.log(f"  Grid built: {len(grid)} questions ({n_cols}x{actual_rows})")
        if 1 in grid:
            self.log(f"  Q1: A=({grid[1]['A']['x']},{grid[1]['A']['y']}), D=({grid[1]['D']['x']},{grid[1]['D']['y']})")
        return grid

    # ===== Legacy methods (fallback) =====

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
        grid_pad_mm = 2.0     # Grid internal padding (answer-grid: padding: 0 2mm)
        header_row_mm = 4.0   # Column header row (A B C D)

        # Physical grid dimensions (from page layout, independent of image)
        grid_left_page_mm = page_left_pad_mm + grid_pad_mm  # 17mm from page left
        grid_right_page_mm = page_w_mm - page_right_pad_mm - grid_pad_mm  # 193mm
        grid_width_mm = grid_right_page_mm - grid_left_page_mm  # 176mm

        # Column layout in mm
        total_gaps_mm = (n_cols - 1) * col_gap_mm
        col_width_mm = (grid_width_mm - total_gaps_mm) / n_cols
        # Row height in mm
        row_height_mm = bubble_mm + 2 * row_margin_mm

        # Corner marks: 5mm squares at 2mm from edge, center at 4.5mm
        corner_offset_mm = 4.5
        warped_w_mm = page_w_mm - 2 * corner_offset_mm  # 201mm
        warped_h_mm = page_h_mm - 2 * corner_offset_mm  # 288mm
        px_per_mm_x = w_img / warped_w_mm
        px_per_mm_y = h_img / warped_h_mm
        self.log(f"  px/mm: x={px_per_mm_x:.2f}, y={px_per_mm_y:.2f}")

        # Detect grid top from circle positions
        grid_top_mm = self._detect_grid_top(image, px_per_mm_y, bubble_mm, header_row_mm=header_row_mm, row_margin_mm=row_margin_mm)

        if grid_top_mm is None:
            grid_top_mm = 95.0
            self.log(f"  Grid top fallback: {grid_top_mm:.0f}mm")

        grid_left_mm = grid_left_page_mm - corner_offset_mm

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

        # X calibration: detect actual circles and compare with grid
        x_shift = self._calibrate_grid_x(image, grid, bubble_size_px, rows_per_col, n_cols)
        if x_shift != 0:
            self.log(f"  X-calibration shift: {x_shift}px ({x_shift/px_per_mm_x:.1f}mm)")
            for q_num in grid:
                for letter in grid[q_num]:
                    b = grid[q_num][letter]
                    b['x'] += x_shift
                    bx, by, bw, bh = b['bbox']
                    b['bbox'] = (bx + x_shift, by, bw, bh)

        return grid

    def _calibrate_grid_x(self, image, grid, bubble_size_px, rows_per_col, n_cols):
        """Auto-calibrate grid X using 1D cross-correlation with circle pattern.
        A row of 4 circles creates a distinctive pattern: alternating dark (border)
        and bright (interior) bands. Cross-correlate this pattern with the actual
        horizontal profile to find the correct X position."""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        h_img, w_img = gray.shape[:2]

        px_mm = w_img / 201.0
        bubble_px = int(bubble_size_px)
        gap_px = int(2.5 * px_mm)
        spacing_px = bubble_px + gap_px

        # Build 1D template: 4 circles (dark-bright-dark pattern per circle)
        # Each circle: border(dark) - interior(bright) - border(dark)
        template_len = 4 * bubble_px + 3 * gap_px
        template = np.ones(template_len) * 0.5  # neutral
        for bi in range(4):
            center = bi * spacing_px + bubble_px // 2
            r = bubble_px // 2
            border_w = max(2, r // 4)
            for x in range(max(0, center - r), min(template_len, center + r + 1)):
                dist_from_center = abs(x - center)
                if dist_from_center > r - border_w:
                    template[x] = 0.0  # dark border
                else:
                    template[x] = 1.0  # bright interior

        # Normalize template
        template = template - np.mean(template)
        template_norm = np.sqrt(np.sum(template ** 2))
        if template_norm < 1e-6:
            return 0

        # Sample rows 8-18 from column 1 (mostly empty)
        shifts_all = []
        for col in range(min(2, n_cols)):  # only check first 2 columns for speed
            q_base = col * rows_per_col + 1
            sample_qs = [q_base + r for r in range(8, min(19, rows_per_col)) if q_base + r in grid]
            if len(sample_qs) < 4:
                continue

            expected_A_x = grid[sample_qs[0]]['A']['x']
            sample_ys = [grid[q]['A']['y'] for q in sample_qs]

            # Average horizontal profile across sample rows
            profiles = []
            for y in sample_ys:
                if 0 <= y < h_img:
                    profiles.append(gray[y, :].astype(float))
            if not profiles:
                continue
            avg_profile = np.mean(profiles, axis=0)

            # Search range: from expected_A - 3*spacing to expected_A + 3*spacing
            x_start = max(0, expected_A_x - 3 * spacing_px)
            x_end = min(w_img - template_len, expected_A_x + 3 * spacing_px)

            # Normalized cross-correlation
            best_shift = 0
            best_corr = -1
            for x0 in range(x_start, x_end + 1):
                segment = avg_profile[x0:x0 + template_len]
                segment = segment - np.mean(segment)
                seg_norm = np.sqrt(np.sum(segment ** 2))
                if seg_norm < 1e-6:
                    continue
                corr = np.sum(template * segment) / (template_norm * seg_norm)
                if corr > best_corr:
                    best_corr = corr
                    # Shift = difference between found A position and expected A position
                    # Found A center = x0 + bubble_px//2
                    best_shift = (x0 + bubble_px // 2) - expected_A_x

            shifts_all.append(best_shift)
            self.log(f"  X-cal col{col}: shift={best_shift}px, corr={best_corr:.3f}")

        if len(shifts_all) >= 1:
            median_shift = int(np.median(shifts_all))
            self.log(f"  X-calibration: {len(shifts_all)} cols, median={median_shift}")
            return median_shift

        return 0

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
                    # Find densest sub-region within this bin (avoid header noise)
                    bin_circles = sorted([y for y in window_circles if bin_y <= y < bin_y + row_h_px])
                    sub_size = max(4, row_h_px // 3)
                    best_sub_y = bin_y
                    best_sub_count = 0
                    for sub_y in range(int(bin_circles[0]), int(bin_circles[-1]) - sub_size + 2):
                        sc = sum(1 for y in bin_circles if sub_y <= y < sub_y + sub_size)
                        if sc > best_sub_count:
                            best_sub_count = sc
                            best_sub_y = sub_y
                    sub_circles = [y for y in bin_circles if best_sub_y <= y < best_sub_y + sub_size]
                    first_bubble_y_px = int(np.median(sub_circles)) if sub_circles else bin_y + row_h_px // 2
                    break
            self.log(f"  Grid top detect (density): window start={best_y}, first question row Y={first_bubble_y_px}px")
        # grid_top_mm = first_bubble_center_mm - header_row - row_margin - bubble/2
        first_bubble_mm = first_bubble_y_px / px_per_mm_y
        grid_top_mm = first_bubble_mm - header_row_mm - row_margin_mm - bubble_mm / 2
        self.log(f"  Grid top detect: first row Y={first_bubble_y_px}px = {first_bubble_mm:.1f}mm, grid_top={grid_top_mm:.1f}mm ({len(rows)} rows found)")
        return grid_top_mm

    def _find_band_center(self, smooth, expected_y, h_img, search_radius=25):
        """Find bubble band center near expected_y using horizontal projection."""
        s_start = max(0, expected_y - search_radius)
        s_end = min(h_img, expected_y + search_radius)
        if s_end <= s_start:
            return None
        region = smooth[s_start:s_end]
        peak_val = float(np.max(region))
        if peak_val < 3:
            return None
        threshold = peak_val * 0.4
        dense_ys = [s_start + i for i in range(len(region)) if region[i] > threshold]
        if not dense_ys:
            return None
        return int(np.median(dense_ys))

    def _refine_grid_y(self, image, grid):
        """Refine grid Y by finding the LAST row of circles (more reliable than first,
        since last rows are usually empty) and computing first row from spacing."""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        h_img, w_img = gray.shape[:2]
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)

        total = max(grid.keys())
        n_cols = 4 if total > 75 else (3 if total > 44 else 2)
        rows_per_col = (total + n_cols - 1) // n_cols

        # Use layout spacing — it comes from the physical answer sheet dimensions
        expected_spacing = grid[2]['A']['y'] - grid[1]['A']['y'] if 2 in grid else 19

        # Build horizontal projection per column
        col_projs = {}
        for col in range(n_cols):
            q_first = col * rows_per_col + 1
            if q_first not in grid:
                continue
            q = grid[q_first]
            x1 = max(0, q['A']['x'] - 3)
            x2 = min(w_img, q['D']['x'] + q['D']['w'] // 2 + 3)
            h_proj = np.sum(binary[:, x1:x2] > 0, axis=1).astype(float)
            k = np.ones(5 if expected_spacing > 40 else 3) / (5.0 if expected_spacing > 40 else 3.0)
            col_projs[col] = np.convolve(h_proj, k, mode='same')

        if not col_projs:
            return grid

        # Strategy: find LAST row center (usually empty = reliable), then compute first row
        # Also try first row center directly
        last_row_centers = {}
        first_row_centers = {}
        bubble_radius = expected_spacing * 0.4  # approximate search radius

        for col, smooth in col_projs.items():
            # Last row of this column
            q_last = min(col * rows_per_col + rows_per_col, total)
            if q_last in grid:
                expected_y = grid[q_last]['A']['y']
                center = self._find_band_center(smooth, expected_y, h_img,
                                                 search_radius=int(bubble_radius))
                if center is not None:
                    last_row_centers[col] = (center, q_last)

            # First row
            q_first = col * rows_per_col + 1
            if q_first in grid:
                expected_y = grid[q_first]['A']['y']
                center = self._find_band_center(smooth, expected_y, h_img,
                                                 search_radius=int(bubble_radius))
                if center is not None:
                    first_row_centers[col] = center

        # Compute first row Y from last row if available (more reliable)
        computed_first_ys = []
        for col, (last_center, q_last) in last_row_centers.items():
            q_first = col * rows_per_col + 1
            row_count = q_last - q_first  # number of rows between first and last
            computed_first_y = last_center - row_count * expected_spacing
            computed_first_ys.append(computed_first_y)

        if computed_first_ys:
            # Use last-row-based estimate
            base_first_y = float(np.median(computed_first_ys))
            method = "last_row"
        elif first_row_centers:
            # Fallback to direct first row detection
            base_first_y = float(np.median(list(first_row_centers.values())))
            method = "first_row"
        else:
            self.log("  Y-refine: no rows detected, keeping layout positions")
            return grid

        # Compare with layout position
        layout_first_y = grid[1]['A']['y']
        global_dy = int(base_first_y - layout_first_y)

        self.log(f"  Y-refine ({method}): first_row={base_first_y:.0f}px, shift={global_dy}, spacing={expected_spacing}px")

        if abs(global_dy) < 2:
            return grid

        # Apply global shift to all positions (keep layout spacing)
        for q_num in grid:
            for letter in grid[q_num]:
                pos = grid[q_num][letter]
                pos['y'] += global_dy
                pos['bbox'] = (pos['x'] - pos['w'] // 2, pos['y'] - pos['h'] // 2, pos['w'], pos['h'])

        return grid

    def _calibrate_grid_x_only(self, image, grid, bubble_px):
        """Fine-tune X positions using detected circles. Y is kept from _detect_grid_top."""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        h_img, w_img = gray.shape[:2]

        q1 = grid.get(1)
        if not q1:
            return grid

        # Detect circles in first few rows only
        grid_y = q1['A']['y']
        y_min = max(0, grid_y - bubble_px * 2)
        y_max = min(h_img, grid_y + bubble_px * 6)

        min_b = max(6, int(bubble_px * 0.4))
        max_b = int(bubble_px * 2.5)

        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        thresh_list = [
            cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1],
            cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2),
        ]

        all_circles = {}
        for thresh in thresh_list:
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            cleaned = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
            cnts, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in cnts:
                (x, y, w, h) = cv2.boundingRect(c)
                cx, cy = x + w // 2, y + h // 2
                if cy < y_min or cy > y_max:
                    continue
                area = cv2.contourArea(c)
                if min_b <= w <= max_b and min_b <= h <= max_b:
                    ar = w / float(h) if h > 0 else 0
                    if 0.5 <= ar <= 2.0:
                        perimeter = cv2.arcLength(c, True)
                        if perimeter > 0 and 4 * np.pi * area / (perimeter * perimeter) > 0.3:
                            key = (round(cx / 5) * 5, round(cy / 5) * 5)
                            if key not in all_circles:
                                all_circles[key] = {'x': cx, 'y': cy}

        circles = list(all_circles.values())
        self.log(f"  X-Calibration: {len(circles)} circles near grid top")

        if len(circles) < 8:
            return grid

        # Cluster X positions
        first_xs = sorted([c['x'] for c in circles])
        x_clusters = []
        cl = [first_xs[0]]
        for xi in first_xs[1:]:
            if xi - cl[-1] < bubble_px * 0.6:
                cl.append(xi)
            else:
                if len(cl) >= 2:
                    x_clusters.append(int(np.median(cl)))
                cl = [xi]
        if len(cl) >= 2:
            x_clusters.append(int(np.median(cl)))

        if not x_clusters:
            return grid

        # Find cluster closest to Q1-A X
        grid_first_x = q1['A']['x']
        best_x = min(x_clusters, key=lambda x: abs(x - grid_first_x))
        dx = best_x - grid_first_x

        self.log(f"  X-Calibration: {len(x_clusters)} X-clusters, closest={best_x}, expected={grid_first_x}, dx={dx}")

        if abs(dx) > bubble_px or abs(dx) < 2:
            self.log(f"  X-Calibration: dx={dx}, skipping (too large or unnecessary)")
            return grid

        self.log(f"  X-Calibration: shifting grid by dx={dx}")
        for q_num in grid:
            for letter in grid[q_num]:
                pos = grid[q_num][letter]
                pos['x'] += dx
                pos['bbox'] = (pos['x'] - pos['w'] // 2, pos['y'] - pos['h'] // 2, pos['w'], pos['h'])

        return grid

    def _calibrate_grid(self, image, grid, bubble_px, px_mm_x, px_mm_y):
        """Detect actual circle positions and shift grid to match them (legacy)."""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        h_img, w_img = gray.shape[:2]

        min_b = max(6, int(bubble_px * 0.4))
        max_b = int(bubble_px * 2.5)

        # Restrict search to expected grid area (avoid header/footer noise)
        q1 = grid.get(1)
        total = max(grid.keys()) if grid else 1
        q_last = grid.get(total)
        if q1 and q_last:
            margin = bubble_px * 5
            y_min_cal = max(0, q1['A']['y'] - margin)
            y_max_cal = min(h_img, q_last['A']['y'] + margin)
        else:
            y_min_cal = int(h_img * 0.25)
            y_max_cal = int(h_img * 0.97)
        x_min_cal = int(w_img * 0.03)
        x_max_cal = int(w_img * 0.97)

        # Multi-threshold circle detection for robustness
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        thresh_list = [
            cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1],
            cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2),
            cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 4),
        ]

        all_circles = {}
        for thresh in thresh_list:
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            cleaned = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
            cnts, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in cnts:
                (x, y, w, h) = cv2.boundingRect(c)
                cx, cy = x + w // 2, y + h // 2
                if cy < y_min_cal or cy > y_max_cal or cx < x_min_cal or cx > x_max_cal:
                    continue
                area = cv2.contourArea(c)
                if min_b <= w <= max_b and min_b <= h <= max_b:
                    ar = w / float(h) if h > 0 else 0
                    if 0.5 <= ar <= 2.0:
                        perimeter = cv2.arcLength(c, True)
                        if perimeter > 0:
                            circ = 4 * np.pi * area / (perimeter * perimeter)
                            if circ > 0.3:
                                key = (round(cx / 5) * 5, round(cy / 5) * 5)
                                if key not in all_circles:
                                    all_circles[key] = {'x': cx, 'y': cy, 'w': w, 'h': h}

        circles = list(all_circles.values())

        if len(circles) < 20:
            self.log(f"  Calibration: only {len(circles)} circles found, skipping")
            return grid

        self.log(f"  Calibration: {len(circles)} circles detected")

        # Find the Y of bubble row clusters (require 8+ circles per row)
        ys = sorted([c['y'] for c in circles])
        y_clusters = []
        cluster = [ys[0]]
        for i in range(1, len(ys)):
            if ys[i] - ys[i - 1] < bubble_px:
                cluster.append(ys[i])
            else:
                if len(cluster) >= 8:  # Full row: 4 cols × 4 options, need 8+ detected
                    y_clusters.append(int(np.median(cluster)))
                cluster = [ys[i]]
        if len(cluster) >= 8:
            y_clusters.append(int(np.median(cluster)))

        if not y_clusters:
            self.log("  Calibration: no valid Y clusters")
            return grid

        # Find Y cluster closest to expected first row (not topmost — avoid noise)
        q1_data = grid.get(1)
        if not q1_data:
            return grid
        grid_first_row_y = q1_data['A']['y']
        detected_first_row_y = min(y_clusters, key=lambda y: abs(y - grid_first_row_y))

        dy = detected_first_row_y - grid_first_row_y
        self.log(f"  Calibration: detected first row Y={detected_first_row_y}, grid Y={grid_first_row_y}, dy={dy}")

        # X calibration: cluster X positions in first rows, match to expected A column
        first_row_cs = [c for c in circles if abs(c['y'] - detected_first_row_y) < bubble_px * 2]
        dx = 0
        if len(first_row_cs) >= 4:
            first_xs = sorted([c['x'] for c in first_row_cs])
            # Cluster X positions
            x_clusters = []
            cl = [first_xs[0]]
            for xi in first_xs[1:]:
                if xi - cl[-1] < bubble_px * 0.7:
                    cl.append(xi)
                else:
                    x_clusters.append(int(np.median(cl)))
                    cl = [xi]
            x_clusters.append(int(np.median(cl)))

            # Find X cluster closest to expected Q1-A position
            grid_first_x = q1_data['A']['x']
            best_x = min(x_clusters, key=lambda x: abs(x - grid_first_x))
            dx = best_x - grid_first_x
            self.log(f"  Calibration X: {len(x_clusters)} clusters, closest={best_x}, expected={grid_first_x}, dx={dx}")
            # Limit X shift to ±1 bubble (layout X should be accurate)
            if abs(dx) > bubble_px:
                self.log(f"  Calibration: dx={dx} too large, skipping X shift")
                dx = 0

        if abs(dy) < 3 and abs(dx) < 3:
            self.log("  Calibration: grid already aligned")
            return grid

        # Limit Y shift to reasonable range
        if abs(dy) > bubble_px * 4:
            self.log(f"  Calibration: dy={dy} too large, skipping Y shift")
            dy = 0

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
        """Measure bubble darkness using mean intensity of inner 50%.
        Returns (is_filled_placeholder, darkness_pct) where darkness_pct = (255-mean)/255*100.
        Actual fill decision is made in scan() using relative scoring."""
        x, y, w, h = circle['bbox']
        # Shrink ROI to inner 50% — aggressively avoids border and adjacent noise
        shrink = max(1, int(w * 0.25))
        x, y, w, h = x + shrink, y + shrink, w - 2 * shrink, h - 2 * shrink
        if w < 3 or h < 3:
            w, h = max(w, 3), max(h, 3)

        # Bounds checking
        h_img, w_img = image.shape[:2]
        x = max(0, x)
        y = max(0, y)
        x2 = min(w_img, x + w)
        y2 = min(h_img, y + h)
        if x2 - x < 3 or y2 - y < 3:
            return False, 0.0

        roi = image[y:y2, x:x2]
        if roi.size == 0:
            return False, 0.0

        if len(roi.shape) == 3:
            roi_gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        else:
            roi_gray = roi

        mean_intensity = float(np.mean(roi_gray))
        darkness_pct = (255.0 - mean_intensity) / 255.0 * 100.0

        return False, darkness_pct
    
    def scan(self, image_path, correct_answers=None):
        """Detection-first scan: detect bubbles first, build grid from positions"""
        self.log("=" * 60)
        self.log("HYBRID OMR SCANNER v2 (detection-first)")
        self.log("=" * 60)

        image = cv2.imread(image_path)
        if image is None:
            return {"success": False, "error": "Cannot load image"}
        self.log(f"Image: {image.shape[1]}x{image.shape[0]}")

        # 1. Corner marks -> perspective transform
        corners = self.find_corner_marks(image)
        if corners:
            self.log("\nMode: Corner marks")
            warped = self.four_point_transform(image, corners)
            mode = "corner_marks"
        else:
            self.log("\nMode: No corners")
            warped = image
            mode = "marker_free"

        # 2. Preprocess: resize to 1000px + CLAHE
        resized, enhanced, scale = self._preprocess(warped)
        h_proc, w_proc = enhanced.shape[:2]

        # 3. Detect bubbles
        bubbles = self._detect_bubbles(enhanced)
        if len(bubbles) < 16:
            return {"success": False, "error": f"Too few bubbles: {len(bubbles)}"}

        # 4. Build grid from detected positions
        grid = self._build_grid(bubbles, w_proc, h_proc)
        if len(grid) < 4:
            return {"success": False, "error": "Cannot build grid"}

        # 5. Fill detection (relative scoring on CLAHE-enhanced image)
        self.log("\nJavoblarni aniqlash...")
        detected_answers = {}
        SCORE_THRESHOLD = 8.0
        MULTI_THRESHOLD = 6.0
        median_w = int(np.median([b['w'] for b in bubbles]))

        for q_num in sorted(grid.keys()):
            fills = {}
            for letter in ['A', 'B', 'C', 'D']:
                if letter not in grid[q_num]:
                    continue
                b = grid[q_num][letter]
                # Inner 35% ROI
                r = max(2, int(median_w * 0.175))
                y1, y2 = max(0, b['y'] - r), min(h_proc, b['y'] + r)
                x1, x2 = max(0, b['x'] - r), min(w_proc, b['x'] + r)
                if x2 - x1 < 2 or y2 - y1 < 2:
                    fills[letter] = 0.0
                    continue
                mean_val = float(np.mean(enhanced[y1:y2, x1:x2]))
                fills[letter] = (255.0 - mean_val) / 255.0 * 100.0

            if len(fills) < 4:
                continue

            sorted_f = sorted(fills.items(), key=lambda x: x[1], reverse=True)
            darkest_letter, darkest_val = sorted_f[0]
            baseline = float(np.median([v for _, v in sorted_f[1:]]))
            score = darkest_val - baseline

            second_letter, second_val = sorted_f[1]
            if len(sorted_f) >= 3:
                base_multi = float(np.median([v for _, v in sorted_f[2:]]))
                score_1 = darkest_val - base_multi
                score_2 = second_val - base_multi
            else:
                score_1, score_2 = score, 0

            # Adaptive threshold: high baseline = shadow, need more contrast
            min_fill = min(fills.values())
            eff_threshold = SCORE_THRESHOLD if min_fill < 35 else max(SCORE_THRESHOLD, 12.0)

            if score_1 >= eff_threshold and score_2 >= MULTI_THRESHOLD:
                self.log(f"  Q{q_num}: MULTI ({darkest_letter}={darkest_val:.1f}%, {second_letter}={second_val:.1f}%)")
            elif score >= eff_threshold:
                detected_answers[str(q_num)] = darkest_letter
                self.log(f"  Q{q_num}: {darkest_letter} (dark={darkest_val:.1f}%, base={baseline:.1f}%, score={score:.1f})")
            else:
                self.log(f"  Q{q_num}: empty (max={darkest_val:.1f}%, base={baseline:.1f}%, score={score:.1f})")

        self.log(f"\nAniqlangan: {len(detected_answers)} ta javob")

        total = self.TOTAL_QUESTIONS or (max(grid.keys()) if grid else 0)
        result = {
            "success": True,
            "detected_answers": detected_answers,
            "total_questions": total,
            "mode": mode
        }

        if correct_answers and len(correct_answers) > 0:
            correct_count = sum(1 for q, a in detected_answers.items() if correct_answers.get(q) == a)
            incorrect_count = sum(1 for q, a in detected_answers.items() if q in correct_answers and correct_answers.get(q) != a)
            unanswered = total - len(detected_answers)
            pct = (correct_count / total * 100) if total > 0 else 0
            result.update({"correct": correct_count, "incorrect": incorrect_count, "unanswered": unanswered, "score": f"{pct:.1f}%"})
            self.log(f"Natija: {correct_count} correct, {incorrect_count} wrong, {unanswered} empty = {pct:.1f}%")

        return result


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
