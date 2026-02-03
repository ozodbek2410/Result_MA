#!/usr/bin/env python3
"""
Universal Color OMR Scanner
Detects pre-printed colored bubble sheets (green=empty, red/dark=filled)
"""

import cv2
import numpy as np
import json
import sys
from pathlib import Path


def preprocess_image(image_path):
    """Load and prepare image for processing"""
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Cannot load image: {image_path}")
    
    # Resize if too large
    h, w = img.shape[:2]
    if w > 1500:
        scale = 1500 / w
        img = cv2.resize(img, (int(w * scale), int(h * scale)))
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    print(f"DEBUG: Image size: {img.shape[1]}x{img.shape[0]}", file=sys.stderr)
    
    return img, gray


def find_all_circles(gray):
    """
    Find ALL circles using multiple detection strategies with ADAPTIVE thresholding
    Returns deduplicated list of circles
    """
    h, w = gray.shape
    all_circles = []
    
    # Define exclusion zones - REDUCED header exclusion
    qr_x_min = int(w * 0.80)
    qr_y_max = int(h * 0.15)
    header_y_max = int(h * 0.12)  # Reduced from 0.18 to 0.12 to catch more circles
    
    print(f"DEBUG: Exclusion zones - QR: x>{qr_x_min}, y<{qr_y_max}; Header: y<{header_y_max}", file=sys.stderr)
    
    # Strategy 1: Multiple Hough parameter sets - MORE AGGRESSIVE
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    
    param_sets = [
        (50, 30, 7, 16),
        (40, 25, 7, 16),
        (30, 20, 7, 16),
        (60, 35, 7, 16),
        (25, 18, 7, 16),  # Very sensitive
        (20, 15, 7, 16),  # Extra sensitive
        (35, 22, 7, 16),  # Middle ground
    ]
    
    for param1, param2, minR, maxR in param_sets:
        circles = cv2.HoughCircles(
            blurred, cv2.HOUGH_GRADIENT, dp=1, minDist=10,  # Reduced from 12 to 10
            param1=param1, param2=param2, minRadius=minR, maxRadius=maxR
        )
        
        if circles is not None:
            for circle in circles[0]:
                x, y, r = circle
                if x > qr_x_min and y < qr_y_max:
                    continue
                if y < header_y_max:
                    continue
                all_circles.append([int(x), int(y), int(r)])
    
    # Strategy 2: ADAPTIVE threshold for dark areas
    # Split image into 3 vertical zones and process separately
    zone_width = w // 3
    for zone_idx in range(3):
        x_start = zone_idx * zone_width
        x_end = (zone_idx + 1) * zone_width if zone_idx < 2 else w
        
        # Extract zone
        zone_gray = gray[:, x_start:x_end]
        
        # Adaptive threshold for this zone - MULTIPLE BLOCK SIZES
        for block_size in [11, 15, 19]:  # Try different block sizes
            adaptive = cv2.adaptiveThreshold(
                zone_gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                cv2.THRESH_BINARY_INV, block_size, 2
            )
            
            contours, _ = cv2.findContours(adaptive, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
            
            for cnt in contours:
                area = cv2.contourArea(cnt)
                if 100 < area < 900:  # Slightly wider range
                    (x_rel, y_rel), radius = cv2.minEnclosingCircle(cnt)
                    
                    # Convert to absolute coordinates
                    x = x_rel + x_start
                    y = y_rel
                    
                    # Skip exclusion zones
                    if x > qr_x_min and y < qr_y_max:
                        continue
                    if y < header_y_max:
                        continue
                    
                    # Circularity check
                    perimeter = cv2.arcLength(cnt, True)
                    if perimeter == 0:
                        continue
                    
                    circularity = (4 * np.pi * area) / (perimeter ** 2)
                    x_box, y_box, w_box, h_box = cv2.boundingRect(cnt)
                    aspect_ratio = float(w_box) / h_box if h_box > 0 else 0
                    
                    if circularity > 0.65 and 0.75 < aspect_ratio < 1.25 and 6 < radius < 17:  # More lenient
                        all_circles.append([int(x), int(y), int(radius)])
    
    if len(all_circles) == 0:
        return np.array([])
    
    # Remove duplicates
    all_circles_list = [(int(c[0]), int(c[1]), int(c[2])) for c in all_circles]
    unique_circles = []
    all_circles_sorted = sorted(all_circles_list, key=lambda c: (c[1], c[0]))
    
    for circle in all_circles_sorted:
        is_duplicate = False
        for i, existing in enumerate(unique_circles):
            dist = np.sqrt((circle[0] - existing[0])**2 + (circle[1] - existing[1])**2)
            
            if dist < 10:  # Reduced from 12 to 10 for tighter deduplication
                if abs(circle[2] - 10) < abs(existing[2] - 10):
                    unique_circles[i] = circle
                is_duplicate = True
                break
        
        if not is_duplicate:
            unique_circles.append(circle)
    
    print(f"DEBUG: Found {len(unique_circles)} unique circles (from {len(all_circles)} detections)", file=sys.stderr)
    
    return np.array(unique_circles, dtype=np.int32)


def detect_grid_structure(circles):
    """
    Detect the grid structure (columns and rows)
    Returns column boundaries and expected row spacing
    """
    if len(circles) == 0:
        return [], 0
    
    # Analyze X coordinates to find columns
    x_coords = sorted([int(c[0]) for c in circles])
    y_coords = sorted([int(c[1]) for c in circles])
    
    # Find gaps in X distribution (column separators)
    x_gaps = []
    for i in range(len(x_coords) - 1):
        gap = x_coords[i+1] - x_coords[i]
        if gap > 60:  # Significant gap = column boundary
            mid_point = (x_coords[i] + x_coords[i+1]) / 2
            x_gaps.append(mid_point)
    
    # Define column boundaries
    if len(x_gaps) == 0:
        boundaries = [(min(x_coords) - 20, max(x_coords) + 20)]
    else:
        x_gaps = sorted(x_gaps)
        boundaries = []
        
        # First column
        boundaries.append((min(x_coords) - 20, x_gaps[0]))
        
        # Middle columns
        for i in range(len(x_gaps) - 1):
            boundaries.append((x_gaps[i], x_gaps[i+1]))
        
        # Last column
        boundaries.append((x_gaps[-1], max(x_coords) + 20))
    
    # Analyze Y coordinates to find row spacing
    y_diffs = [y_coords[i+1] - y_coords[i] for i in range(len(y_coords) - 1)]
    
    # Most common small difference = within same row
    # Most common large difference = between rows
    small_diffs = [d for d in y_diffs if d < 30]
    large_diffs = [d for d in y_diffs if 30 <= d < 100]
    
    if large_diffs:
        row_spacing = np.median(large_diffs)
    else:
        row_spacing = 25  # Default
    
    print(f"DEBUG: Detected {len(boundaries)} columns", file=sys.stderr)
    print(f"DEBUG: Estimated row spacing: {row_spacing:.1f}px", file=sys.stderr)
    
    return boundaries, row_spacing


def organize_into_grid(circles, boundaries, row_spacing):
    """
    Organize circles into a grid structure (questions x options)
    FLEXIBLE APPROACH: Accept 3-4 circles per question
    Returns list of questions, each with up to 4 circles (A, B, C, D)
    """
    if len(circles) == 0:
        return []
    
    # Sort all circles by Y coordinate first
    circles_sorted = sorted(circles, key=lambda c: c[1])
    
    print(f"DEBUG: Organizing {len(circles_sorted)} circles into rows", file=sys.stderr)
    
    # Group circles into rows based on Y coordinate
    rows = []
    current_row = [circles_sorted[0]]
    
    for circle in circles_sorted[1:]:
        y_diff = abs(circle[1] - current_row[0][1])
        
        # If Y difference is small, same row
        if y_diff < 20:  # Increased tolerance from 18 to 20
            current_row.append(circle)
        else:
            # Process completed row
            if len(current_row) >= 3:  # Accept 3 or more circles
                rows.append(current_row)
            # Start new row
            current_row = [circle]
    
    # Don't forget last row
    if len(current_row) >= 3:
        rows.append(current_row)
    
    print(f"DEBUG: Found {len(rows)} rows", file=sys.stderr)
    
    # Now organize each row into questions (groups of 4)
    all_questions = []
    
    for row_idx, row in enumerate(rows):
        # Sort by X coordinate
        row_sorted = sorted(row, key=lambda c: c[0])
        
        # Try to split into groups of 4 circles
        # Look for gaps in X coordinates
        if len(row_sorted) <= 4:
            # Single question
            # Pad with None if less than 4
            while len(row_sorted) < 4:
                row_sorted.append(None)
            all_questions.append(tuple(row_sorted[:4]))
        else:
            # Multiple questions in this row - find gaps
            x_coords = [c[0] for c in row_sorted]
            
            # Find large gaps (>50px) that separate questions
            groups = []
            current_group = [row_sorted[0]]
            
            for i in range(1, len(row_sorted)):
                x_gap = x_coords[i] - x_coords[i-1]
                
                if x_gap > 50:  # Large gap = new question
                    # Save current group
                    if 3 <= len(current_group) <= 4:
                        while len(current_group) < 4:
                            current_group.append(None)
                        groups.append(tuple(current_group[:4]))
                    current_group = [row_sorted[i]]
                else:
                    current_group.append(row_sorted[i])
            
            # Don't forget last group
            if 3 <= len(current_group) <= 4:
                while len(current_group) < 4:
                    current_group.append(None)
                groups.append(tuple(current_group[:4]))
            
            all_questions.extend(groups)
    
    print(f"DEBUG: Organized into {len(all_questions)} questions", file=sys.stderr)
    
    return all_questions


def calculate_fill_ratio(gray, x, y, r, global_threshold=180):
    """
    Calculate fill ratio based on Aspose OMR industry standard
    Returns percentage of dark pixels in the bubble (0-100%)
    
    Industry standard thresholds:
    - Empty circles with borders: 26-30% fill
    - Filled circles: 60-70% fill
    - Recommended threshold: 35-40% for reliable detection
    
    Uses FIXED global threshold (not adaptive) to ensure consistent measurements
    """
    # Create mask for circle (use inner 70% to avoid border artifacts)
    mask = np.zeros(gray.shape, dtype=np.uint8)
    inner_radius = max(int(r * 0.7), 4)
    cv2.circle(mask, (x, y), inner_radius, 255, -1)
    
    # Extract pixels
    circle_pixels = gray[mask == 255]
    
    if len(circle_pixels) == 0:
        return 0.0
    
    # Use FIXED threshold (not adaptive Otsu)
    # Pixels darker than threshold are considered "filled"
    # Threshold 180 means: pixels with value < 180 are dark (filled)
    dark_pixel_count = np.sum(circle_pixels < global_threshold)
    total_pixels = len(circle_pixels)
    
    # Calculate fill ratio as percentage
    fill_ratio = (dark_pixel_count / total_pixels) * 100.0
    
    return fill_ratio


def is_bubble_filled(img, gray, x, y, r, question_num=0, option='', global_threshold=180):
    """
    Determine if a bubble is filled using FILL RATIO method (Aspose OMR standard)
    
    Industry standard (Aspose OMR):
    - Empty circles: 26-30% fill ratio
    - Filled circles: 60-70% fill ratio
    - Threshold: 35-40% for reliable detection
    
    Returns: (is_filled, confidence, debug_info)
    """
    # Calculate fill ratio with global threshold
    fill_ratio = calculate_fill_ratio(gray, x, y, r, global_threshold)
    
    # Also get brightness and color info for additional validation
    mask = np.zeros(gray.shape, dtype=np.uint8)
    inner_radius = max(int(r * 0.7), 4)
    cv2.circle(mask, (x, y), inner_radius, 255, -1)
    
    circle_gray = gray[mask == 255]
    circle_color = img[mask == 255]
    
    if len(circle_gray) == 0:
        return False, 0, {'fill_ratio': 0}
    
    avg_brightness = float(np.mean(circle_gray))
    
    # Color analysis (BGR)
    avg_b = float(np.mean(circle_color[:, 0]))
    avg_g = float(np.mean(circle_color[:, 1]))
    avg_r = float(np.mean(circle_color[:, 2]))
    
    # HSV analysis
    hsv_region = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    circle_hsv = hsv_region[mask == 255]
    
    avg_h = float(np.mean(circle_hsv[:, 0]))
    avg_s = float(np.mean(circle_hsv[:, 1]))
    avg_v = float(np.mean(circle_hsv[:, 2]))
    
    debug_info = {
        'fill_ratio': fill_ratio,
        'brightness': avg_brightness,
        'rgb': (avg_r, avg_g, avg_b),
        'hsv': (avg_h, avg_s, avg_v),
        'threshold': global_threshold
    }
    
    # PRIORITY 1: Check for green pre-printed circles (always empty)
    is_green = (
        avg_g > avg_r + 10 and
        avg_g > avg_b + 5 and
        30 < avg_h < 90 and
        avg_s > 35
    )
    if is_green and fill_ratio < 45:
        return False, 0.95, {**debug_info, 'reason': 'green_preprinted', 'method': 'color'}
    
    # PRIORITY 2: MAIN DETECTION - Fill Ratio (Industry Standard)
    # Thresholds based on Aspose OMR:
    # < 32% = definitely empty (even with borders)
    # 32-38% = likely empty (border zone)
    # 38-45% = uncertain (use additional checks)
    # 45-55% = likely filled (light marks)
    # > 55% = definitely filled
    
    if fill_ratio < 32:
        # Definitely empty - below even border threshold
        return False, 0.95, {**debug_info, 'reason': 'low_fill_ratio', 'method': 'fill_ratio'}
    
    elif fill_ratio >= 55:
        # Definitely filled - well above threshold
        confidence = min(0.98, 0.85 + (fill_ratio - 55) * 0.01)
        return True, confidence, {**debug_info, 'reason': 'high_fill_ratio', 'method': 'fill_ratio'}
    
    elif fill_ratio >= 45:
        # Likely filled - above threshold
        confidence = 0.80 + (fill_ratio - 45) * 0.01
        return True, confidence, {**debug_info, 'reason': 'medium_fill_ratio', 'method': 'fill_ratio'}
    
    elif fill_ratio >= 38:
        # Uncertain zone - use additional checks
        # Check if there's actual ink (color or darkness)
        has_color = (
            (avg_r > avg_g + 8 and avg_r > avg_b + 5) or  # Red
            (avg_b > avg_r + 8 and avg_b > avg_g + 5) or  # Blue
            (avg_s > 30 and avg_brightness < 120)  # Any saturated dark color
        )
        
        is_dark = avg_brightness < 100
        
        if has_color or is_dark:
            # Has ink marks - likely filled
            confidence = 0.70 + (fill_ratio - 38) * 0.015
            return True, confidence, {**debug_info, 'reason': 'uncertain_with_ink', 'method': 'fill_ratio+color'}
        else:
            # No clear ink - likely just border
            return False, 0.75, {**debug_info, 'reason': 'uncertain_no_ink', 'method': 'fill_ratio+color'}
    
    else:  # 32 <= fill_ratio < 38
        # Border zone - likely empty but check for very dark marks
        if avg_brightness < 80:
            # Very dark despite low fill ratio - might be small but dark mark
            confidence = 0.65
            return True, confidence, {**debug_info, 'reason': 'border_zone_dark', 'method': 'fill_ratio+brightness'}
        else:
            # Normal border - empty
            return False, 0.85, {**debug_info, 'reason': 'border_zone_empty', 'method': 'fill_ratio'}


def grade_exam(image_path):
    """Main grading function"""
    try:
        img, gray = preprocess_image(image_path)
        
        # Find all circles
        circles = find_all_circles(gray)
        
        if len(circles) == 0:
            return {
                'success': False,
                'error': 'No circles detected',
                'detected_answers': {},
                'total_questions': 0
            }
        
        # Detect grid structure
        boundaries, row_spacing = detect_grid_structure(circles)
        
        # Organize into questions
        questions = organize_into_grid(circles, boundaries, row_spacing)
        
        if len(questions) == 0:
            return {
                'success': False,
                'error': f'Found {len(circles)} circles but could not organize into questions',
                'detected_answers': {},
                'total_questions': 0
            }
        
        # Calculate ADAPTIVE threshold using TWO-PASS approach
        # Pass 1: Find the LIGHTEST circles (definitely empty)
        # Pass 2: Use them as baseline to detect filled circles
        print(f"DEBUG: Calculating adaptive threshold using two-pass approach...", file=sys.stderr)
        
        circle_avg_brightness = []
        for question_num, row_circles in enumerate(questions, start=1):
            for circle in row_circles:
                if circle is None or not isinstance(circle, (tuple, list, np.ndarray)) or len(circle) < 3:
                    continue
                
                x, y, r = int(circle[0]), int(circle[1]), int(circle[2])
                
                if x < 0 or y < 0 or x >= img.shape[1] or y >= img.shape[0]:
                    continue
                
                mask = np.zeros(gray.shape, dtype=np.uint8)
                inner_radius = max(int(r * 0.7), 4)
                cv2.circle(mask, (x, y), inner_radius, 255, -1)
                circle_gray = gray[mask == 255]
                
                if len(circle_gray) > 0:
                    avg_bright = float(np.mean(circle_gray))
                    circle_avg_brightness.append(avg_bright)
        
        if circle_avg_brightness:
            circle_avg_brightness.sort()
            
            # Find the LIGHTEST 25% of circles (assume they are empty)
            percentile_75_idx = int(len(circle_avg_brightness) * 0.75)
            lightest_circles_threshold = circle_avg_brightness[percentile_75_idx]
            
            # Use this as our "empty circle" baseline
            # Pixels DARKER than this are considered "filled"
            # Add margin: threshold = baseline - 20 (to account for variation)
            global_threshold = max(lightest_circles_threshold - 20, 140)
            
            print(f"DEBUG: Lightest circles avg brightness: {lightest_circles_threshold:.1f}", file=sys.stderr)
            print(f"DEBUG: Global threshold (with margin): {global_threshold:.1f}", file=sys.stderr)
            print(f"DEBUG: Brightness range: {min(circle_avg_brightness):.1f} - {max(circle_avg_brightness):.1f}", file=sys.stderr)
        else:
            global_threshold = 180
            print(f"WARNING: No samples, using default threshold {global_threshold}", file=sys.stderr)
        
        # Grade each question using FILL RATIO method (Aspose OMR standard)
        detected_answers = {}
        invalid_answers = {}
        low_confidence = {}
        options = ['A', 'B', 'C', 'D']
        
        annotated = img.copy()
        
        print(f"DEBUG: Using Fill Ratio method (Aspose OMR standard)", file=sys.stderr)
        print(f"DEBUG: Thresholds - Empty: <32%, Uncertain: 32-45%, Filled: >45%", file=sys.stderr)
        
        # Process each question using fill ratio
        for question_num, row_circles in enumerate(questions, start=1):
            filled_bubbles = []
            
            try:
                for idx, circle in enumerate(row_circles):
                    if circle is None or not isinstance(circle, (tuple, list, np.ndarray)) or len(circle) < 3:
                        continue
                    
                    x, y, r = int(circle[0]), int(circle[1]), int(circle[2])
                    
                    if x < 0 or y < 0 or x >= img.shape[1] or y >= img.shape[0]:
                        continue
                    
                    # Use new fill ratio method with global threshold
                    is_filled, confidence, debug_info = is_bubble_filled(
                        img, gray, x, y, r, question_num, options[idx], global_threshold
                    )
                    
                    # Debug for first 5 questions and last 5, and any filled bubbles
                    should_debug = (question_num <= 5 or question_num > len(questions) - 5 or is_filled)
                    if should_debug:
                        fill_ratio = debug_info.get('fill_ratio', 0)
                        reason = debug_info.get('reason', 'unknown')
                        print(f"DEBUG Q{question_num}-{options[idx]}: filled={is_filled}, conf={confidence:.2f}, "
                              f"fill_ratio={fill_ratio:.1f}%, reason={reason}", file=sys.stderr)
                    
                    if is_filled:
                        fill_ratio = debug_info.get('fill_ratio', 0)
                        filled_bubbles.append((idx, options[idx], x, y, r, confidence, fill_ratio))
            
            except Exception as e:
                print(f"ERROR processing Q{question_num}: {e}", file=sys.stderr)
                import traceback
                traceback.print_exc(file=sys.stderr)
                continue
            
            # SMART FILTERING: If multiple filled bubbles, check fill ratios
            if len(filled_bubbles) > 1:
                # Sort by fill ratio (highest first)
                fill_ratios = sorted([b[6] for b in filled_bubbles], reverse=True)
                highest = fill_ratios[0]
                second_highest = fill_ratios[1] if len(fill_ratios) > 1 else 0
                
                # If highest is significantly higher than second (>15% difference), keep only highest
                if highest - second_highest > 15:
                    # Clear winner - keep only the most filled
                    filled_bubbles = [max(filled_bubbles, key=lambda x: x[6])]
                    print(f"DEBUG Q{question_num}: Filtered to highest fill ratio (diff={highest - second_highest:.1f}%)", file=sys.stderr)
                else:
                    # Similar fill ratios - keep all (real multiple answers)
                    print(f"DEBUG Q{question_num}: Keeping all {len(filled_bubbles)} bubbles (similar fill ratios)", file=sys.stderr)
            
            # Determine answer
            if len(filled_bubbles) == 0:
                # No answer
                pass
            elif len(filled_bubbles) == 1:
                # Single answer - valid
                try:
                    idx, ans, x, y, r, conf, fill_ratio = filled_bubbles[0]
                    detected_answers[question_num] = ans
                    
                    if conf < 0.7:
                        low_confidence[question_num] = {
                            'answer': ans, 
                            'confidence': conf,
                            'fill_ratio': fill_ratio
                        }
                    
                    # Draw red circle
                    cv2.circle(annotated, (x, y), r, (0, 0, 255), 3)
                    cv2.putText(annotated, "X", (x-5, y+5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
                except Exception as e:
                    print(f"ERROR drawing single answer Q{question_num}: {e}", file=sys.stderr)
            else:
                # Multiple answers - invalid
                try:
                    answers_list = [b[1] for b in filled_bubbles]
                    fill_ratios = [b[6] for b in filled_bubbles]
                    invalid_answers[question_num] = {
                        'answers': answers_list,
                        'fill_ratios': fill_ratios
                    }
                    
                    print(f"DEBUG Q{question_num}: Multiple answers: {answers_list} (fill ratios: {[f'{fr:.1f}%' for fr in fill_ratios]})", file=sys.stderr)
                    
                    # Draw yellow circles
                    for idx, ans, x, y, r, conf, fill_ratio in filled_bubbles:
                        cv2.circle(annotated, (x, y), r, (0, 255, 255), 3)
                        cv2.putText(annotated, "!", (x-5, y+5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)
                except Exception as e:
                    print(f"ERROR drawing multiple answers Q{question_num}: {e}", file=sys.stderr)
            
            # Draw green for empty bubbles
            try:
                for idx, circle in enumerate(row_circles):
                    if circle is None:
                        continue
                    
                    if not isinstance(circle, (tuple, list, np.ndarray)) or len(circle) < 3:
                        continue
                    
                    x, y, r = int(circle[0]), int(circle[1]), int(circle[2])
                    
                    if x < 0 or y < 0 or x >= img.shape[1] or y >= img.shape[0]:
                        continue
                    
                    is_in_filled = any(x == fb[2] and y == fb[3] for fb in filled_bubbles)
                    
                    if not is_in_filled:
                        cv2.circle(annotated, (x, y), r, (0, 255, 0), 2)
            except Exception as e:
                print(f"ERROR drawing circles for Q{question_num}: {e}", file=sys.stderr)
        
        # Save results
        input_path = Path(image_path)
        
        print(f"DEBUG: Saving annotated image...", file=sys.stderr)
        output_filename = f"checked_{input_path.name}"
        output_path = input_path.parent / output_filename
        
        try:
            cv2.imwrite(str(output_path), annotated)
            print(f"DEBUG: Annotated image saved: {output_filename}", file=sys.stderr)
        except Exception as e:
            print(f"ERROR saving annotated image: {e}", file=sys.stderr)
        
        # Save all circles visualization
        print(f"DEBUG: Saving all circles image...", file=sys.stderr)
        all_circles_img = img.copy()
        for circle in circles:
            try:
                x, y, r = int(circle[0]), int(circle[1]), int(circle[2])
                cv2.circle(all_circles_img, (x, y), r, (255, 0, 255), 2)
                cv2.circle(all_circles_img, (x, y), 2, (255, 0, 255), -1)
            except Exception as e:
                print(f"ERROR drawing circle {circle}: {e}", file=sys.stderr)
                continue
        
        all_circles_filename = f"all_circles_{input_path.name}"
        all_circles_path = input_path.parent / all_circles_filename
        
        try:
            cv2.imwrite(str(all_circles_path), all_circles_img)
            print(f"DEBUG: All circles image saved: {all_circles_filename}", file=sys.stderr)
        except Exception as e:
            print(f"ERROR saving all circles image: {e}", file=sys.stderr)
        
        print(f"DEBUG: Processing complete, preparing results...", file=sys.stderr)
        print(f"DEBUG: Detected {len(detected_answers)} valid answers from {len(questions)} questions", file=sys.stderr)
        if invalid_answers:
            print(f"DEBUG: {len(invalid_answers)} questions with multiple answers", file=sys.stderr)
        if low_confidence:
            print(f"DEBUG: {len(low_confidence)} answers with low confidence", file=sys.stderr)
        
        result = {
            'success': True,
            'detected_answers': detected_answers,
            'total_questions': len(questions),
            'annotated_image': output_filename,
            'all_circles_image': all_circles_filename,
            'circles_found': len(circles),
            'rows_found': len(questions)
        }
        
        if invalid_answers:
            result['invalid_answers'] = invalid_answers
            result['warning'] = f'{len(invalid_answers)} questions have multiple answers'
        
        if low_confidence:
            result['low_confidence'] = low_confidence
        
        print(f"DEBUG: Returning result with {len(result)} keys", file=sys.stderr)
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
    """CLI interface"""
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python omr_color.py <image_path>'
        }))
        sys.exit(1)
    
    image_path = sys.argv[1]
    
    try:
        print("DEBUG: Starting grade_exam...", file=sys.stderr)
        result = grade_exam(image_path)
        print("DEBUG: grade_exam completed", file=sys.stderr)
        print("DEBUG: Result keys:", list(result.keys()) if isinstance(result, dict) else "NOT A DICT", file=sys.stderr)
        print(json.dumps(result, ensure_ascii=False))
        print("DEBUG: JSON output completed", file=sys.stderr)
    except Exception as e:
        print(f"DEBUG: Exception in main: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({
            'success': False,
            'error': str(e)
        }))


if __name__ == '__main__':
    main()
