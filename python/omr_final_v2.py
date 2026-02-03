#!/usr/bin/env python3
"""
OMR Scanner V2 - Accurate detection of filled bubbles
Distinguishes pre-printed gray circles from hand-filled marks
"""

import cv2
import numpy as np
import json
import sys
from pathlib import Path


def preprocess_image(image_path):
    """Load and preprocess image"""
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Cannot load image: {image_path}")
    
    h, w = img.shape[:2]
    if w > 2000:
        scale = 2000 / w
        img = cv2.resize(img, (int(w * scale), int(h * scale)))
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # CLAHE for lighting normalization
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray_normalized = clahe.apply(gray)
    
    print(f"DEBUG: Image size: {img.shape[1]}x{img.shape[0]}", file=sys.stderr)
    
    return img, gray, gray_normalized


def validate_circle_quality(gray_normalized, x, y, r):
    """Validate if detected circle is actually a bubble"""
    margin = int(r * 1.5)
    y1, y2 = max(0, y - margin), min(gray_normalized.shape[0], y + margin)
    x1, x2 = max(0, x - margin), min(gray_normalized.shape[1], x + margin)
    
    roi = gray_normalized[y1:y2, x1:x2]
    if roi.size == 0:
        return False
    
    mask = np.zeros(roi.shape, dtype="uint8")
    center_x, center_y = x - x1, y - y1
    cv2.circle(mask, (center_x, center_y), r, 255, -1)
    
    circle_pixels = roi[mask == 255]
    if len(circle_pixels) < 20:
        return False
    
    mean_brightness = np.mean(circle_pixels)
    if mean_brightness < 30 or mean_brightness > 220:
        return False
    
    variance = np.var(circle_pixels)
    if variance > 2000:
        return False
    
    ring_mask = np.zeros(roi.shape, dtype="uint8")
    cv2.circle(ring_mask, (center_x, center_y), r, 255, 2)
    
    edges = cv2.Canny(roi, 30, 100)
    edge_on_ring = edges[ring_mask == 255]
    
    if len(edge_on_ring) > 0:
        edge_ratio = np.sum(edge_on_ring > 0) / len(edge_on_ring)
        if edge_ratio < 0.15:
            return False
    
    return True


def find_all_circles(gray, gray_normalized):
    """Find all bubble circles"""
    h, w = gray.shape
    all_circles = []
    
    qr_zone = {'x_min': int(w * 0.82), 'y_max': int(h * 0.15)}
    header_y_max = int(h * 0.06)
    
    blurred = cv2.GaussianBlur(gray_normalized, (5, 5), 0)
    
    param_sets = [
        (50, 30, 8, 15),
        (45, 28, 8, 15),
        (40, 26, 8, 15),
        (35, 24, 8, 15),
        (30, 22, 8, 15),
    ]
    
    for param1, param2, minR, maxR in param_sets:
        circles = cv2.HoughCircles(
            blurred, cv2.HOUGH_GRADIENT, dp=1, minDist=12,
            param1=param1, param2=param2,
            minRadius=minR, maxRadius=maxR
        )
        
        if circles is not None:
            for circle in circles[0]:
                x, y, r = int(circle[0]), int(circle[1]), int(circle[2])
                
                if x > qr_zone['x_min'] and y < qr_zone['y_max']:
                    continue
                if y < header_y_max:
                    continue
                
                if validate_circle_quality(gray_normalized, x, y, r):
                    all_circles.append([x, y, r])
    
    # Blob detector
    params = cv2.SimpleBlobDetector_Params()
    params.filterByArea = True
    params.minArea = 150
    params.maxArea = 900
    params.filterByCircularity = True
    params.minCircularity = 0.65
    params.filterByConvexity = True
    params.minConvexity = 0.70
    params.filterByInertia = True
    params.minInertiaRatio = 0.50
    
    detector = cv2.SimpleBlobDetector_create(params)
    inverted = cv2.bitwise_not(gray_normalized)
    keypoints = detector.detect(inverted)
    
    for kp in keypoints:
        x, y = int(kp.pt[0]), int(kp.pt[1])
        r = int(kp.size / 2)
        
        if x > qr_zone['x_min'] and y < qr_zone['y_max']:
            continue
        if y < header_y_max:
            continue
        
        if 7 < r < 16:
            if validate_circle_quality(gray_normalized, x, y, r):
                all_circles.append([x, y, r])
    
    # Remove duplicates
    unique_circles = []
    sorted_circles = sorted(all_circles, key=lambda c: (c[1], c[0]))
    
    for circle in sorted_circles:
        is_duplicate = False
        for existing in unique_circles:
            dist = np.sqrt((circle[0] - existing[0])**2 + (circle[1] - existing[1])**2)
            if dist < 10:
                is_duplicate = True
                if abs(circle[2] - 11) < abs(existing[2] - 11):
                    existing[0] = circle[0]
                    existing[1] = circle[1]
                    existing[2] = circle[2]
                break
        
        if not is_duplicate:
            unique_circles.append(circle)
    
    circles_array = np.array(unique_circles, dtype=np.uint16)
    print(f"DEBUG: Found {len(circles_array)} circles", file=sys.stderr)
    
    return circles_array


def detect_columns(circles):
    """Detect 3 columns"""
    if len(circles) == 0:
        return []
    
    x_coords = [c[0] for c in circles]
    x_min, x_max = min(x_coords), max(x_coords)
    
    hist, bin_edges = np.histogram(x_coords, bins=60, range=(x_min, x_max))
    hist_smooth = np.convolve(hist, np.ones(3)/3, mode='same')
    
    valleys = []
    for i in range(1, len(hist_smooth) - 1):
        if hist_smooth[i] < hist_smooth[i-1] and hist_smooth[i] < hist_smooth[i+1] and hist_smooth[i] < 3:
            valley_x = (bin_edges[i] + bin_edges[i+1]) / 2
            valleys.append(valley_x)
    
    if len(valleys) >= 2:
        valleys = sorted(valleys)[:2]
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
    return boundaries


def sort_into_questions(circles, boundaries):
    """Sort circles into questions (4 per row)"""
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
        
        sorted_circles = sorted(col_circles, key=lambda c: c[1])
        
        current_row = [sorted_circles[0]]
        
        for circle in sorted_circles[1:]:
            y_diff = abs(circle[1] - current_row[0][1])
            tolerance = 20 if len(current_row) < 4 else 18
            
            if y_diff < tolerance:
                current_row.append(circle)
            else:
                if 3 <= len(current_row) <= 5:
                    current_row.sort(key=lambda c: c[0])
                    all_questions.append(current_row[:4])
                current_row = [circle]
        
        if 3 <= len(current_row) <= 5:
            current_row.sort(key=lambda c: c[0])
            all_questions.append(current_row[:4])
    
    all_questions.sort(key=lambda row: row[0][1])
    print(f"DEBUG: Organized {len(all_questions)} questions", file=sys.stderr)
    
    return all_questions


def analyze_bubble(img_color, gray_orig, x, y, r):
    """
    Analyze bubble - distinguish pre-printed gray from hand-filled
    Returns: (is_filled, confidence, debug_info)
    """
    mask = np.zeros(gray_orig.shape, dtype="uint8")
    inner_r = max(int(r * 0.70), 5)
    cv2.circle(mask, (x, y), inner_r, 255, -1)
    
    # Extract pixels
    pixels_gray = gray_orig[mask == 255]
    pixels_color = img_color[mask == 255]
    
    if len(pixels_gray) == 0:
        return False, 0, {}
    
    # Grayscale analysis
    mean_gray = float(np.mean(pixels_gray))
    min_gray = float(np.min(pixels_gray))
    std_gray = float(np.std(pixels_gray))
    
    # Color analysis (BGR)
    mean_b = float(np.mean(pixels_color[:, 0]))
    mean_g = float(np.mean(pixels_color[:, 1]))
    mean_r = float(np.mean(pixels_color[:, 2]))
    
    # Check if it's a pre-printed GRAY circle
    # Gray circles have B≈G≈R (neutral color)
    color_diff = max(abs(mean_b - mean_g), abs(mean_g - mean_r), abs(mean_b - mean_r))
    is_neutral_gray = color_diff < 15
    
    # Pre-printed circles are uniform and bright-ish
    is_uniform = std_gray < 18
    is_bright = mean_gray > 140
    
    # PRE-PRINTED GRAY CIRCLE detection
    if is_neutral_gray and is_uniform and is_bright:
        return False, 0, {
            'type': 'pre-printed',
            'mean_gray': mean_gray,
            'std': std_gray,
            'color_diff': color_diff
        }
    
    # FILLED BUBBLE detection
    # Count very dark pixels
    very_dark_count = np.sum(pixels_gray < 100)
    dark_count = np.sum(pixels_gray < 130)
    
    very_dark_pct = (very_dark_count / len(pixels_gray)) * 100
    dark_pct = (dark_count / len(pixels_gray)) * 100
    
    # Calculate confidence score
    confidence = 0
    
    # Factor 1: Darkness (0-40 points)
    if mean_gray < 80:
        confidence += 40
    elif mean_gray < 100:
        confidence += 30
    elif mean_gray < 120:
        confidence += 20
    elif mean_gray < 140:
        confidence += 10
    
    # Factor 2: Dark pixel percentage (0-30 points)
    if very_dark_pct > 50:
        confidence += 30
    elif very_dark_pct > 30:
        confidence += 20
    elif dark_pct > 40:
        confidence += 15
    elif dark_pct > 25:
        confidence += 10
    
    # Factor 3: Variation (pen marks have variation) (0-20 points)
    if std_gray > 25:
        confidence += 20
    elif std_gray > 18:
        confidence += 15
    elif std_gray > 12:
        confidence += 10
    
    # Factor 4: Color (pen/pencil is often blue/black, not neutral gray) (0-10 points)
    if not is_neutral_gray and mean_gray < 130:
        confidence += 10
    
    is_filled = confidence >= 50
    
    debug_info = {
        'mean_gray': mean_gray,
        'min_gray': min_gray,
        'std': std_gray,
        'very_dark_pct': very_dark_pct,
        'dark_pct': dark_pct,
        'color_diff': color_diff,
        'confidence': confidence,
        'is_neutral': is_neutral_gray,
        'is_uniform': is_uniform
    }
    
    return is_filled, confidence, debug_info


def grade_exam(image_path):
    """Main grading function"""
    try:
        img, gray, gray_normalized = preprocess_image(image_path)
        
        circles = find_all_circles(gray, gray_normalized)
        
        if len(circles) == 0:
            return {
                'success': False,
                'error': 'No circles detected',
                'detected_answers': {},
                'total_questions': 0
            }
        
        boundaries = detect_columns(circles)
        questions = sort_into_questions(circles, boundaries)
        
        if len(questions) == 0:
            return {
                'success': False,
                'error': f'Found {len(circles)} circles but could not organize',
                'detected_answers': {},
                'total_questions': 0
            }
        
        detected_answers = {}
        invalid_answers = {}
        options = ['A', 'B', 'C', 'D']
        
        annotated = img.copy()
        
        for question_num, row_circles in enumerate(questions, start=1):
            bubble_data = []
            
            for idx, circle in enumerate(row_circles):
                x, y, r = int(circle[0]), int(circle[1]), int(circle[2])
                is_filled, confidence, debug_info = analyze_bubble(img, gray, x, y, r)
                
                bubble_data.append({
                    'idx': idx,
                    'option': options[idx],
                    'x': x, 'y': y, 'r': r,
                    'is_filled': is_filled,
                    'confidence': confidence,
                    'debug': debug_info
                })
            
            # Debug first/last questions
            if question_num <= 5 or question_num > len(questions) - 5:
                print(f"DEBUG Q{question_num}:", file=sys.stderr)
                for b in bubble_data:
                    print(f"  {b['option']}: filled={b['is_filled']}, conf={b['confidence']}, gray={b['debug']['mean_gray']:.1f}, std={b['debug']['std']:.1f}", file=sys.stderr)
            
            # Find filled bubbles
            filled_bubbles = [b for b in bubble_data if b['is_filled']]
            
            # If multiple, keep highest confidence
            if len(filled_bubbles) > 1:
                filled_bubbles.sort(key=lambda b: b['confidence'], reverse=True)
                best = filled_bubbles[0]
                
                # Check if others are significantly lower confidence
                others_lower = all(
                    best['confidence'] - b['confidence'] > 15
                    for b in filled_bubbles[1:]
                )
                
                if others_lower:
                    filled_bubbles = [best]
            
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
                for b in filled_bubbles:
                    cv2.circle(annotated, (b['x'], b['y']), b['r'], (0, 255, 255), 3)
                    cv2.putText(annotated, "!", (b['x']-5, b['y']+5),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)
            
            # Draw green for empty
            for b in bubble_data:
                if not b['is_filled']:
                    cv2.circle(annotated, (b['x'], b['y']), b['r'], (0, 255, 0), 2)
        
        # Save
        input_path = Path(image_path)
        output_filename = f"checked_{input_path.name}"
        output_path = input_path.parent / output_filename
        cv2.imwrite(str(output_path), annotated)
        
        print(f"DEBUG: Detected {len(detected_answers)} valid answers from {len(questions)} questions", file=sys.stderr)
        
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
            'error': 'Usage: python omr_final_v2.py <image_path>'
        }))
        sys.exit(1)
    
    image_path = sys.argv[1]
    result = grade_exam(image_path)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
