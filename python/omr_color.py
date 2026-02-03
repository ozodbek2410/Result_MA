#!/usr/bin/env python3
"""
Color OMR Scanner - For pre-printed colored bubble sheets
Green circles = empty, Red/Dark circles = filled
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
    if w > 1500:
        scale = 1500 / w
        img = cv2.resize(img, (int(w * scale), int(h * scale)))
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    print(f"DEBUG: Image size: {img.shape[1]}x{img.shape[0]}", file=sys.stderr)
    
    return img, gray


def find_circles_aggressive(gray):
    """Find circles with aggressive parameters for pre-printed circles"""
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    
    # More aggressive parameters to find pre-printed circles
    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1,
        minDist=15,  # Circles are close together
        param1=40,   # Lower edge threshold
        param2=20,   # Lower circle threshold
        minRadius=6,
        maxRadius=18
    )
    
    if circles is None:
        return []
    
    circles = np.uint16(np.around(circles[0]))
    print(f"DEBUG: Found {len(circles)} circles", file=sys.stderr)
    
    return circles


def detect_columns(circles):
    """Detect 3 columns based on X coordinates"""
    if len(circles) == 0:
        return []
    
    x_coords = sorted([c[0] for c in circles])
    
    # Find large gaps (column separators)
    gaps = []
    for i in range(len(x_coords) - 1):
        gap = x_coords[i+1] - x_coords[i]
        if gap > 80:  # Large gap = column boundary
            mid_point = (x_coords[i] + x_coords[i+1]) / 2
            gaps.append(mid_point)
    
    # Sort and take largest gaps
    if len(gaps) >= 2:
        gaps = sorted(gaps)[:2]
    
    # Define column boundaries
    if len(gaps) == 0:
        # Single column
        boundaries = [(min(x_coords), max(x_coords))]
    elif len(gaps) == 1:
        # Two columns
        boundaries = [
            (min(x_coords), gaps[0]),
            (gaps[0], max(x_coords))
        ]
    else:
        # Three columns
        boundaries = [
            (min(x_coords), gaps[0]),
            (gaps[0], gaps[1]),
            (gaps[1], max(x_coords))
        ]
    
    print(f"DEBUG: Detected {len(boundaries)} column(s)", file=sys.stderr)
    for i, (x_min, x_max) in enumerate(boundaries):
        print(f"DEBUG: Column {i+1}: X={int(x_min)}-{int(x_max)}", file=sys.stderr)
    
    return boundaries


def sort_into_questions(circles, boundaries):
    """Sort circles into questions (4 per row, multiple columns)"""
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
        
        print(f"DEBUG: Column {col_idx + 1}: {len(col_circles)} circles", file=sys.stderr)
        
        # Sort by Y
        sorted_circles = sorted(col_circles, key=lambda c: c[1])
        
        # Group into rows (4 bubbles per question)
        current_row = [sorted_circles[0]]
        
        for circle in sorted_circles[1:]:
            y_diff = abs(circle[1] - current_row[0][1])
            
            if y_diff < 20:  # Same row
                current_row.append(circle)
            else:
                # Process row
                if len(current_row) >= 4:
                    current_row.sort(key=lambda c: c[0])
                    all_questions.append(current_row[:4])
                
                current_row = [circle]
        
        # Last row
        if len(current_row) >= 4:
            current_row.sort(key=lambda c: c[0])
            all_questions.append(current_row[:4])
    
    # Sort all by Y coordinate
    all_questions.sort(key=lambda row: row[0][1])
    
    print(f"DEBUG: Total questions: {len(all_questions)}", file=sys.stderr)
    
    return all_questions


def is_circle_filled_color(img, gray, x, y, r):
    """
    Detect if circle is filled by checking color
    Green = empty, Red/Dark = filled
    """
    # Extract circle region
    mask = np.zeros(gray.shape, dtype="uint8")
    cv2.circle(mask, (x, y), int(r * 0.7), 255, -1)
    
    # Get pixels in circle
    circle_pixels = img[mask == 255]
    
    if len(circle_pixels) == 0:
        return False, 0, 0
    
    # Calculate average color
    avg_b = np.mean(circle_pixels[:, 0])
    avg_g = np.mean(circle_pixels[:, 1])
    avg_r = np.mean(circle_pixels[:, 2])
    
    # Green circles: high G, low R
    # Red/Dark circles: high R or low overall brightness
    
    # Check if green (empty)
    is_green = avg_g > avg_r + 20 and avg_g > avg_b + 20
    
    # Check if red (filled)
    is_red = avg_r > avg_g + 20 and avg_r > avg_b + 10
    
    # Check if dark (filled with pencil)
    brightness = (avg_r + avg_g + avg_b) / 3
    is_dark = brightness < 100
    
    is_filled = is_red or is_dark
    
    return is_filled, brightness, (avg_r, avg_g, avg_b)


def grade_exam(image_path):
    """Main grading function"""
    try:
        img, gray = preprocess_image(image_path)
        
        circles = find_circles_aggressive(gray)
        
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
                'error': f'Found {len(circles)} circles but could not organize into questions',
                'detected_answers': {},
                'total_questions': 0
            }
        
        detected_answers = {}
        invalid_answers = {}  # Questions with multiple answers
        options = ['A', 'B', 'C', 'D']
        
        annotated = img.copy()
        
        for question_num, row_circles in enumerate(questions, start=1):
            filled_bubbles = []
            
            for idx, circle in enumerate(row_circles):
                x, y, r = int(circle[0]), int(circle[1]), int(circle[2])
                
                is_filled, brightness, avg_color = is_circle_filled_color(img, gray, x, y, r)
                
                if question_num <= 20:
                    print(f"DEBUG Q{question_num}-{options[idx]}: brightness={brightness:.1f}, RGB={avg_color}, filled={is_filled}", file=sys.stderr)
                
                if is_filled:
                    filled_bubbles.append((idx, options[idx], x, y, r))
            
            # Check if multiple answers
            if len(filled_bubbles) == 1:
                # Single answer - correct
                detected_answers[question_num] = filled_bubbles[0][1]
                
                # Draw red for single filled
                idx, ans, x, y, r = filled_bubbles[0]
                cv2.circle(annotated, (x, y), r, (0, 0, 255), 3)
                cv2.putText(annotated, "X", (x-5, y+5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
                
            elif len(filled_bubbles) > 1:
                # Multiple answers - INVALID (yellow)
                answers_list = [b[1] for b in filled_bubbles]
                invalid_answers[question_num] = answers_list
                
                # Don't add to detected_answers (invalid)
                print(f"DEBUG Q{question_num}: Multiple bubbles filled: {answers_list}", file=sys.stderr)
                
                # Draw yellow for all filled bubbles in this question
                for idx, ans, x, y, r in filled_bubbles:
                    cv2.circle(annotated, (x, y), r, (0, 255, 255), 3)  # Yellow (BGR)
                    cv2.putText(annotated, "!", (x-5, y+5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)
            
            # Draw green for empty bubbles
            for idx, circle in enumerate(row_circles):
                x, y, r = int(circle[0]), int(circle[1]), int(circle[2])
                
                # Check if this bubble was marked as filled
                is_in_filled = any(x == fb[2] and y == fb[3] for fb in filled_bubbles)
                
                if not is_in_filled:
                    cv2.circle(annotated, (x, y), r, (0, 255, 0), 2)  # Green
        
        input_path = Path(image_path)
        output_filename = f"checked_{input_path.name}"
        output_path = input_path.parent / output_filename
        cv2.imwrite(str(output_path), annotated)
        
        print(f"DEBUG: Detected {len(detected_answers)} valid answers from {len(questions)} questions", file=sys.stderr)
        if invalid_answers:
            print(f"DEBUG: Found {len(invalid_answers)} questions with multiple answers (invalid)", file=sys.stderr)
        
        result = {
            'success': True,
            'detected_answers': detected_answers,
            'total_questions': len(questions),
            'annotated_image': output_filename,
            'circles_found': len(circles),
            'rows_found': len(questions)
        }
        
        # Add invalid answers info
        if invalid_answers:
            result['invalid_answers'] = invalid_answers
            result['warning'] = f'{len(invalid_answers)} questions have multiple answers marked'
        
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
    result = grade_exam(image_path)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
