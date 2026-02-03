#!/usr/bin/env python3
"""
Robust OMR Scanner - Finds ALL circles regardless of lighting
Uses adaptive preprocessing and template matching
"""

import cv2
import numpy as np
import json
import sys
from pathlib import Path


def preprocess_image(image_path):
    """Load and preprocess image with lighting normalization"""
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Cannot load image: {image_path}")
    
    h, w = img.shape[:2]
    
    # Resize if too large
    if w > 2000:
        scale = 2000 / w
        img = cv2.resize(img, (int(w * scale), int(h * scale)))
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # CLAHE - Contrast Limited Adaptive Histogram Equalization
    # This normalizes lighting across the entire image
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray_normalized = clahe.apply(gray)
    
    print(f"DEBUG: Image size: {img.shape[1]}x{img.shape[0]}", file=sys.stderr)
    
    return img, gray, gray_normalized


def validate_circle_quality(gray_normalized, x, y, r):
    """
    Validate if detected circle is actually a bubble
    Returns True if it's a valid bubble circle
    """
    # Extract region
    margin = int(r * 1.5)
    y1, y2 = max(0, y - margin), min(gray_normalized.shape[0], y + margin)
    x1, x2 = max(0, x - margin), min(gray_normalized.shape[1], x + margin)
    
    roi = gray_normalized[y1:y2, x1:x2]
    
    if roi.size == 0:
        return False
    
    # Create circular mask
    mask = np.zeros(roi.shape, dtype="uint8")
    center_x, center_y = x - x1, y - y1
    cv2.circle(mask, (center_x, center_y), r, 255, -1)
    
    circle_pixels = roi[mask == 255]
    
    if len(circle_pixels) < 20:
        return False
    
    # Check 1: Reasonable brightness range (not pure white or pure black)
    mean_brightness = np.mean(circle_pixels)
    if mean_brightness < 30 or mean_brightness > 220:
        return False
    
    # Check 2: Not too much variance (text has high variance)
    variance = np.var(circle_pixels)
    if variance > 2000:
        return False
    
    # Check 3: Check edge strength - bubbles have clear circular edges
    # Create ring mask (outer edge of circle)
    ring_mask = np.zeros(roi.shape, dtype="uint8")
    cv2.circle(ring_mask, (center_x, center_y), r, 255, 2)
    
    # Apply edge detection
    edges = cv2.Canny(roi, 30, 100)
    edge_on_ring = edges[ring_mask == 255]
    
    if len(edge_on_ring) > 0:
        edge_ratio = np.sum(edge_on_ring > 0) / len(edge_on_ring)
        # Bubbles should have at least 20% edge pixels on the ring
        if edge_ratio < 0.15:
            return False
    
    return True


def find_all_circles_robust(gray, gray_normalized):
    """
    Find ALL circles using multiple methods combined
    Returns circles as list of [x, y, r]
    """
    h, w = gray.shape
    all_circles = []
    
    # Define exclusion zones
    qr_zone = {'x_min': int(w * 0.82), 'y_max': int(h * 0.15)}
    header_y_max = int(h * 0.06)
    
    print(f"DEBUG: Searching for circles in {w}x{h} image", file=sys.stderr)
    
    # METHOD 1: Hough Circles on normalized image - BALANCED parameters
    blurred = cv2.GaussianBlur(gray_normalized, (5, 5), 0)
    
    # More conservative parameter sets to reduce false positives
    param_sets = [
        # (param1, param2, minR, maxR)
        (50, 30, 8, 15),
        (45, 28, 8, 15),
        (40, 26, 8, 15),
        (35, 24, 8, 15),
        (30, 22, 8, 15),
        (50, 32, 7, 16),
        (40, 28, 7, 16),
        (30, 24, 7, 16),
    ]
    
    hough_candidates = 0
    hough_valid = 0
    
    for param1, param2, minR, maxR in param_sets:
        circles = cv2.HoughCircles(
            blurred,
            cv2.HOUGH_GRADIENT,
            dp=1,
            minDist=12,  # Increased from 8 to reduce duplicates
            param1=param1,
            param2=param2,
            minRadius=minR,
            maxRadius=maxR
        )
        
        if circles is not None:
            for circle in circles[0]:
                x, y, r = int(circle[0]), int(circle[1]), int(circle[2])
                hough_candidates += 1
                
                # Skip exclusion zones
                if x > qr_zone['x_min'] and y < qr_zone['y_max']:
                    continue
                if y < header_y_max:
                    continue
                
                # Validate circle quality
                if validate_circle_quality(gray_normalized, x, y, r):
                    all_circles.append([x, y, r])
                    hough_valid += 1
    
    print(f"DEBUG: Hough found {hough_valid} valid circles (from {hough_candidates} candidates)", file=sys.stderr)
    
    # METHOD 2: Contour detection with adaptive thresholding
    contour_candidates = 0
    contour_valid = 0
    
    # Use fewer block sizes but more effective ones
    for block_size in [11, 15, 19]:
        adaptive = cv2.adaptiveThreshold(
            gray_normalized, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            block_size, 2
        )
        
        contours, _ = cv2.findContours(adaptive, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for cnt in contours:
            area = cv2.contourArea(cnt)
            contour_candidates += 1
            
            # Circle area: π*r² where r is 8-15, so area is ~200-700
            if 150 < area < 900:
                (x, y), radius = cv2.minEnclosingCircle(cnt)
                x, y, radius = int(x), int(y), int(radius)
                
                # Skip exclusion zones
                if x > qr_zone['x_min'] and y < qr_zone['y_max']:
                    continue
                if y < header_y_max:
                    continue
                
                # Check circularity
                perimeter = cv2.arcLength(cnt, True)
                if perimeter == 0:
                    continue
                
                circularity = (4 * np.pi * area) / (perimeter ** 2)
                
                # Check aspect ratio
                x_box, y_box, w_box, h_box = cv2.boundingRect(cnt)
                aspect_ratio = float(w_box) / h_box if h_box > 0 else 0
                
                # Stricter circularity requirements
                if circularity > 0.65 and 0.75 < aspect_ratio < 1.25 and 7 < radius < 16:
                    # Validate quality
                    if validate_circle_quality(gray_normalized, x, y, int(radius)):
                        all_circles.append([x, y, radius])
                        contour_valid += 1
    
    print(f"DEBUG: Contours found {contour_valid} valid circles (from {contour_candidates} candidates)", file=sys.stderr)
    
    # METHOD 3: Blob detection using SimpleBlobDetector
    # Set up blob detector parameters
    params = cv2.SimpleBlobDetector_Params()
    
    # Filter by Area
    params.filterByArea = True
    params.minArea = 150
    params.maxArea = 900
    
    # Filter by Circularity
    params.filterByCircularity = True
    params.minCircularity = 0.65
    
    # Filter by Convexity
    params.filterByConvexity = True
    params.minConvexity = 0.70
    
    # Filter by Inertia
    params.filterByInertia = True
    params.minInertiaRatio = 0.50
    
    detector = cv2.SimpleBlobDetector_create(params)
    
    # Detect blobs on inverted image
    inverted = cv2.bitwise_not(gray_normalized)
    keypoints = detector.detect(inverted)
    
    blob_valid = 0
    for kp in keypoints:
        x, y = int(kp.pt[0]), int(kp.pt[1])
        r = int(kp.size / 2)
        
        # Skip exclusion zones
        if x > qr_zone['x_min'] and y < qr_zone['y_max']:
            continue
        if y < header_y_max:
            continue
        
        if 7 < r < 16:
            if validate_circle_quality(gray_normalized, x, y, r):
                all_circles.append([x, y, r])
                blob_valid += 1
    
    print(f"DEBUG: Blob detector found {blob_valid} valid circles (from {len(keypoints)} blobs)", file=sys.stderr)
    
    # Remove duplicates - merge circles within 10 pixels
    unique_circles = []
    sorted_circles = sorted(all_circles, key=lambda c: (c[1], c[0]))
    
    for circle in sorted_circles:
        is_duplicate = False
        for existing in unique_circles:
            dist = np.sqrt((circle[0] - existing[0])**2 + (circle[1] - existing[1])**2)
            if dist < 10:
                is_duplicate = True
                # Keep the one with better radius (closer to 11)
                if abs(circle[2] - 11) < abs(existing[2] - 11):
                    existing[0] = circle[0]
                    existing[1] = circle[1]
                    existing[2] = circle[2]
                break
        
        if not is_duplicate:
            unique_circles.append(circle)
    
    circles_array = np.array(unique_circles, dtype=np.uint16)
    print(f"DEBUG: Total unique circles: {len(circles_array)} (from {len(all_circles)} detections)", file=sys.stderr)
    
    return circles_array


def detect_columns_smart(circles):
    """
    Detect columns using histogram analysis
    """
    if len(circles) == 0:
        return []
    
    x_coords = [c[0] for c in circles]
    x_min, x_max = min(x_coords), max(x_coords)
    
    # Create histogram of X positions
    hist, bin_edges = np.histogram(x_coords, bins=60, range=(x_min, x_max))
    
    # Smooth histogram using simple moving average
    window_size = 3
    hist_smooth = np.convolve(hist, np.ones(window_size)/window_size, mode='same')
    
    # Find peaks (columns) and valleys (gaps)
    peaks = []
    valleys = []
    
    for i in range(1, len(hist_smooth) - 1):
        # Peak: higher than neighbors
        if hist_smooth[i] > hist_smooth[i-1] and hist_smooth[i] > hist_smooth[i+1] and hist_smooth[i] > 5:
            peak_x = (bin_edges[i] + bin_edges[i+1]) / 2
            peaks.append(peak_x)
        
        # Valley: lower than neighbors and low count
        if hist_smooth[i] < hist_smooth[i-1] and hist_smooth[i] < hist_smooth[i+1] and hist_smooth[i] < 3:
            valley_x = (bin_edges[i] + bin_edges[i+1]) / 2
            valleys.append(valley_x)
    
    # If we have clear valleys, use them as boundaries
    if len(valleys) >= 2:
        valleys = sorted(valleys)
        # Take the 2 most significant valleys
        boundaries = [
            (x_min - 10, valleys[0]),
            (valleys[0], valleys[1]),
            (valleys[1], x_max + 10)
        ]
    elif len(valleys) == 1:
        boundaries = [
            (x_min - 10, valleys[0]),
            (valleys[0], x_max + 10)
        ]
    else:
        # Fallback: simple gap detection
        x_sorted = sorted(x_coords)
        gaps = []
        for i in range(len(x_sorted) - 1):
            gap = x_sorted[i+1] - x_sorted[i]
            if gap > 50:
                gaps.append((x_sorted[i] + x_sorted[i+1]) / 2)
        
        if len(gaps) >= 2:
            gaps = sorted(gaps)[:2]
            boundaries = [
                (x_min - 10, gaps[0]),
                (gaps[0], gaps[1]),
                (gaps[1], x_max + 10)
            ]
        elif len(gaps) == 1:
            boundaries = [
                (x_min - 10, gaps[0]),
                (gaps[0], x_max + 10)
            ]
        else:
            boundaries = [(x_min - 10, x_max + 10)]
    
    print(f"DEBUG: Detected {len(boundaries)} columns", file=sys.stderr)
    for i, (x1, x2) in enumerate(boundaries):
        count = sum(1 for c in circles if x1 <= c[0] <= x2)
        print(f"DEBUG: Column {i+1}: X={int(x1)}-{int(x2)}, circles={count}", file=sys.stderr)
    
    return boundaries


def sort_into_questions(circles, boundaries):
    """
    Sort circles into questions (4 bubbles per row)
    """
    # Separate by column
    columns = [[] for _ in range(len(boundaries))]
    
    for circle in circles:
        x = circle[0]
        for col_idx, (x_min, x_max) in enumerate(boundaries):
            if x_min <= x <= x_max:
                columns[col_idx].append(circle)
                break
    
    all_questions = []
    
    for col_idx, col_circles in enumerate(columns):
        if len(col_circles) == 0:
            continue
        
        # Sort by Y
        sorted_circles = sorted(col_circles, key=lambda c: c[1])
        
        # Group into rows using adaptive clustering
        rows = []
        current_row = [sorted_circles[0]]
        
        for circle in sorted_circles[1:]:
            y_diff = abs(circle[1] - current_row[0][1])
            
            # Adaptive tolerance
            tolerance = 20 if len(current_row) < 4 else 18
            
            if y_diff < tolerance:
                current_row.append(circle)
            else:
                # Save current row if it has 3-5 circles
                if 3 <= len(current_row) <= 5:
                    current_row.sort(key=lambda c: c[0])
                    rows.append(current_row[:4])
                elif len(current_row) > 5:
                    # Split into groups of 4
                    current_row.sort(key=lambda c: c[0])
                    for i in range(0, len(current_row), 4):
                        if i + 3 < len(current_row):
                            rows.append(current_row[i:i+4])
                
                current_row = [circle]
        
        # Last row
        if 3 <= len(current_row) <= 5:
            current_row.sort(key=lambda c: c[0])
            rows.append(current_row[:4])
        elif len(current_row) > 5:
            current_row.sort(key=lambda c: c[0])
            for i in range(0, len(current_row), 4):
                if i + 3 < len(current_row):
                    rows.append(current_row[i:i+4])
        
        all_questions.extend(rows)
        print(f"DEBUG: Column {col_idx+1}: {len(col_circles)} circles -> {len(rows)} questions", file=sys.stderr)
    
    # Sort all questions by Y coordinate
    all_questions.sort(key=lambda row: row[0][1])
    
    print(f"DEBUG: Total questions organized: {len(all_questions)}", file=sys.stderr)
    
    return all_questions


def analyze_bubble_fill(gray_original, gray_normalized, x, y, r):
    """
    Analyze if a bubble is filled using BOTH original and normalized images
    Distinguishes between pre-printed gray circles and actually filled bubbles
    Returns: (fill_percentage, avg_brightness_orig, avg_brightness_norm, min_brightness, std_dev, is_uniform)
    """
    # Create mask for inner circle (70% of radius)
    mask = np.zeros(gray_original.shape, dtype="uint8")
    inner_r = max(int(r * 0.70), 5)
    cv2.circle(mask, (x, y), inner_r, 255, -1)
    
    # Extract pixels from ORIGINAL image
    pixels_orig = gray_original[mask == 255]
    pixels_norm = gray_normalized[mask == 255]
    
    if len(pixels_orig) == 0:
        return 0.0, 255, 255, 255, 0, True
    
    # Analyze ORIGINAL image
    avg_brightness_orig = float(np.mean(pixels_orig))
    min_brightness_orig = float(np.min(pixels_orig))
    max_brightness_orig = float(np.max(pixels_orig))
    std_dev_orig = float(np.std(pixels_orig))
    
    # Analyze NORMALIZED image
    avg_brightness_norm = float(np.mean(pixels_norm))
    
    # Check uniformity - pre-printed gray circles are VERY uniform
    # Hand-filled bubbles have more variation
    brightness_range = max_brightness_orig - min_brightness_orig
    is_uniform = (std_dev_orig < 15 and brightness_range < 40)
    
    # Count VERY dark pixels in ORIGINAL image
    # Pre-printed gray circles are around 150-200 brightness
    # Filled bubbles with pen/pencil are < 120
    very_dark_threshold = 110
    dark_threshold = 130
    
    very_dark_pixels = np.sum(pixels_orig < very_dark_threshold)
    dark_pixels = np.sum(pixels_orig < dark_threshold)
    
    very_dark_pct = (very_dark_pixels / len(pixels_orig)) * 100
    dark_pct = (dark_pixels / len(pixels_orig)) * 100
    
    # Fill percentage emphasizes VERY dark pixels
    fill_percentage = very_dark_pct * 1.5 + dark_pct * 0.3
    
    return fill_percentage, avg_brightness_orig, avg_brightness_norm, min_brightness_orig, std_dev_orig, is_uniform


def grade_exam(image_path):
    """Main grading function"""
    try:
        img, gray, gray_normalized = preprocess_image(image_path)
        
        circles = find_all_circles_robust(gray, gray_normalized)
        
        if len(circles) == 0:
            return {
                'success': False,
                'error': 'No circles detected',
                'detected_answers': {},
                'total_questions': 0
            }
        
        boundaries = detect_columns_smart(circles)
        questions = sort_into_questions(circles, boundaries)
        
        if len(questions) == 0:
            return {
                'success': False,
                'error': f'Found {len(circles)} circles but could not organize into questions',
                'detected_answers': {},
                'total_questions': 0
            }
        
        # Global calibration: find baseline from brightest bubbles
        # Use ORIGINAL image for more accurate baseline
        all_brightness_orig = []
        all_brightness_norm = []
        
        for row in questions:
            for circle in row:
                x, y, r = int(circle[0]), int(circle[1]), int(circle[2])
                _, brightness_orig, brightness_norm, _, _, _ = analyze_bubble_fill(gray, gray_normalized, x, y, r)
                all_brightness_orig.append(brightness_orig)
                all_brightness_norm.append(brightness_norm)
        
        all_brightness_orig.sort(reverse=True)
        all_brightness_norm.sort(reverse=True)
        
        # Baseline from top 20% brightest bubbles
        global_baseline_orig = np.mean(all_brightness_orig[:max(int(len(all_brightness_orig) * 0.20), 10)])
        global_baseline_norm = np.mean(all_brightness_norm[:max(int(len(all_brightness_norm) * 0.20), 10)])
        
        print(f"DEBUG: Global baseline - Original: {global_baseline_orig:.1f}, Normalized: {global_baseline_norm:.1f}", file=sys.stderr)
        
        detected_answers = {}
        invalid_answers = {}
        options = ['A', 'B', 'C', 'D']
        
        annotated = img.copy()
        
        for question_num, row_circles in enumerate(questions, start=1):
            # Analyze all bubbles in this question
            bubble_data = []
            
            for idx, circle in enumerate(row_circles):
                x, y, r = int(circle[0]), int(circle[1]), int(circle[2])
                fill_pct, brightness_orig, brightness_norm, min_bright, std_dev, is_uniform = analyze_bubble_fill(gray, gray_normalized, x, y, r)
                
                bubble_data.append({
                    'idx': idx,
                    'option': options[idx],
                    'x': x, 'y': y, 'r': r,
                    'fill_pct': fill_pct,
                    'brightness_orig': brightness_orig,
                    'brightness_norm': brightness_norm,
                    'min_brightness': min_bright,
                    'std_dev': std_dev,
                    'is_uniform': is_uniform
                })
            
            if len(bubble_data) == 0:
                continue
            
            # Find lightest and darkest (use ORIGINAL brightness)
            lightest = max(bubble_data, key=lambda b: b['brightness_orig'])
            darkest = min(bubble_data, key=lambda b: b['brightness_orig'])
            
            local_range = lightest['brightness_orig'] - darkest['brightness_orig']
            
            # Debug output for first/last questions
            if question_num <= 5 or question_num > len(questions) - 5:
                print(f"DEBUG Q{question_num}: local_range={local_range:.1f}, baseline_orig={global_baseline_orig:.1f}", file=sys.stderr)
                for b in bubble_data:
                    global_diff = global_baseline_orig - b['brightness_orig']
                    uniform_str = "UNIFORM" if b['is_uniform'] else "varied"
                    print(f"  {b['option']}: orig={b['brightness_orig']:.1f}, fill={b['fill_pct']:.1f}%, min={b['min_brightness']:.1f}, std={b['std_dev']:.1f}, {uniform_str}, diff={global_diff:.1f}", file=sys.stderr)
            
            # Determine filled bubbles - USE RELATIVE COMPARISON WITHIN QUESTION
            filled_bubbles = []
            
            # First, identify if ALL bubbles are uniform (all pre-printed empty)
            all_uniform = all(b['is_uniform'] for b in bubble_data)
            all_bright = all(b['brightness_orig'] > 140 for b in bubble_data)
            
            if all_uniform and all_bright:
                # All bubbles are pre-printed empty - no answer marked
                if question_num <= 5 or question_num > len(questions) - 5:
                    print(f"DEBUG Q{question_num}: All uniform and bright - no answer", file=sys.stderr)
                filled_bubbles = []
            else:
                # At least one bubble is different - find the filled one(s)
                
                for b in bubble_data:
                    local_diff = lightest['brightness_orig'] - b['brightness_orig']
                    global_diff = global_baseline_orig - b['brightness_orig']
                    
                    is_filled = False
                    
                    # CRITICAL: Skip if uniform AND bright (pre-printed)
                    if b['is_uniform'] and b['brightness_orig'] > 135:
                        continue
                    
                    # Strategy 1: Very dark (definitely filled)
                    if b['brightness_orig'] < 90:
                        is_filled = True
                    
                    # Strategy 2: Significantly darker than others in same question
                    elif local_range > 25 and local_diff > local_range * 0.50:
                        is_filled = True
                    
                    # Strategy 3: High fill percentage + not uniform
                    elif b['fill_pct'] > 45 and not b['is_uniform']:
                        is_filled = True
                    
                    # Strategy 4: Moderate darkness + high variation (pen marks)
                    elif b['brightness_orig'] < 110 and b['std_dev'] > 18:
                        is_filled = True
                    
                    # Strategy 5: Darker than global baseline + has variation
                    elif global_diff > 35 and b['std_dev'] > 12:
                        is_filled = True
                    
                    # Strategy 6: Very dark minimum + variation
                    elif b['min_brightness'] < 60 and b['std_dev'] > 10:
                        is_filled = True
                    
                    # Strategy 7: Moderate fill + darkness + variation
                    elif b['fill_pct'] > 35 and b['brightness_orig'] < 115 and b['std_dev'] > 12:
                        is_filled = True
                    
                    if is_filled:
                        filled_bubbles.append(b)
            
            # If multiple, keep only darkest if others are significantly lighter
            if len(filled_bubbles) > 1:
                filled_bubbles.sort(key=lambda b: b['brightness_orig'])
                darkest_b = filled_bubbles[0]
                second_darkest = filled_bubbles[1] if len(filled_bubbles) > 1 else None
                
                # Check if others are much lighter
                # Use stricter criteria to avoid false positives
                if second_darkest:
                    brightness_gap = second_darkest['brightness_orig'] - darkest_b['brightness_orig']
                    fill_gap = darkest_b['fill_pct'] - second_darkest['fill_pct']
                    
                    # Keep only darkest if there's a clear gap
                    if brightness_gap > 20 or fill_gap > 20:
                        if question_num <= 5 or question_num > len(questions) - 5:
                            print(f"DEBUG Q{question_num}: Multiple detected, keeping darkest (gap={brightness_gap:.1f})", file=sys.stderr)
                        filled_bubbles = [darkest_b]
                    else:
                        # Gap is small - might be actual multiple answers
                        if question_num <= 5 or question_num > len(questions) - 5:
                            print(f"DEBUG Q{question_num}: Small gap ({brightness_gap:.1f}), keeping multiple", file=sys.stderr)
            
            # Record answer
            if len(filled_bubbles) == 1:
                b = filled_bubbles[0]
                detected_answers[question_num] = b['option']
                cv2.circle(annotated, (b['x'], b['y']), b['r'], (0, 0, 255), 3)
                cv2.putText(annotated, "X", (b['x']-5, b['y']+5),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
            elif len(filled_bubbles) > 1:
                answers = [b['option'] for b in filled_bubbles]
                invalid_answers[question_num] = answers
                print(f"DEBUG Q{question_num}: Multiple answers: {answers}", file=sys.stderr)
                for b in filled_bubbles:
                    cv2.circle(annotated, (b['x'], b['y']), b['r'], (0, 255, 255), 3)
                    cv2.putText(annotated, "!", (b['x']-5, b['y']+5),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)
            
            # Draw green for empty
            for b in bubble_data:
                is_filled = any(b['x'] == fb['x'] and b['y'] == fb['y'] for fb in filled_bubbles)
                if not is_filled:
                    cv2.circle(annotated, (b['x'], b['y']), b['r'], (0, 255, 0), 2)
        
        # Save annotated image
        input_path = Path(image_path)
        output_filename = f"checked_{input_path.name}"
        output_path = input_path.parent / output_filename
        cv2.imwrite(str(output_path), annotated)
        
        print(f"DEBUG: Detected {len(detected_answers)} valid answers from {len(questions)} questions", file=sys.stderr)
        if invalid_answers:
            print(f"DEBUG: {len(invalid_answers)} questions with multiple answers", file=sys.stderr)
        
        result = {
            'success': True,
            'detected_answers': detected_answers,
            'total_questions': len(questions),
            'annotated_image': output_filename,
            'circles_found': len(circles)
        }
        
        if invalid_answers:
            result['invalid_answers'] = invalid_answers
            result['warning'] = f'{len(invalid_answers)} questions have multiple answers'
        
        return result
        
    except Exception as e:
        print(f"ERROR: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {
            'success': False,
            'error': str(e),
            'detected_answers': {},
            'total_questions': 0
        }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python omr_robust.py <image_path>'
        }))
        sys.exit(1)
    
    image_path = sys.argv[1]
    result = grade_exam(image_path)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
