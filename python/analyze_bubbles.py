#!/usr/bin/env python3
"""
Analyze bubble characteristics to tune thresholds
"""

import cv2
import numpy as np
import sys

def analyze_sample_bubbles(image_path):
    """Analyze sample bubbles to understand their characteristics"""
    
    img = cv2.imread(image_path)
    if img is None:
        print(f"Cannot load image: {image_path}")
        return
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # CLAHE normalization
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray_norm = clahe.apply(gray)
    
    print("=" * 80)
    print("BUBBLE ANALYSIS - Click on bubbles to analyze them")
    print("=" * 80)
    print("LEFT CLICK: Analyze as FILLED bubble")
    print("RIGHT CLICK: Analyze as EMPTY bubble")
    print("MIDDLE CLICK or 'q': Quit")
    print("=" * 80)
    
    filled_samples = []
    empty_samples = []
    
    def mouse_callback(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            # Analyze as filled
            analyze_bubble(x, y, "FILLED", filled_samples)
        elif event == cv2.EVENT_RBUTTONDOWN:
            # Analyze as empty
            analyze_bubble(x, y, "EMPTY", empty_samples)
        elif event == cv2.EVENT_MBUTTONDOWN:
            cv2.destroyAllWindows()
    
    def analyze_bubble(x, y, label, samples):
        r = 11  # Approximate radius
        
        # Create mask
        mask = np.zeros(gray.shape, dtype="uint8")
        inner_r = max(int(r * 0.70), 5)
        cv2.circle(mask, (x, y), inner_r, 255, -1)
        
        # Extract pixels
        pixels_orig = gray[mask == 255]
        pixels_norm = gray_norm[mask == 255]
        
        if len(pixels_orig) == 0:
            print(f"No pixels at ({x}, {y})")
            return
        
        # Calculate statistics
        avg_orig = float(np.mean(pixels_orig))
        min_orig = float(np.min(pixels_orig))
        max_orig = float(np.max(pixels_orig))
        std_orig = float(np.std(pixels_orig))
        
        avg_norm = float(np.mean(pixels_norm))
        
        brightness_range = max_orig - min_orig
        
        # Count dark pixels
        very_dark = np.sum(pixels_orig < 110)
        dark = np.sum(pixels_orig < 130)
        
        very_dark_pct = (very_dark / len(pixels_orig)) * 100
        dark_pct = (dark / len(pixels_orig)) * 100
        fill_pct = very_dark_pct * 1.5 + dark_pct * 0.3
        
        is_uniform = (std_orig < 15 and brightness_range < 40)
        
        # Store sample
        sample = {
            'label': label,
            'avg_orig': avg_orig,
            'min_orig': min_orig,
            'max_orig': max_orig,
            'std_orig': std_orig,
            'avg_norm': avg_norm,
            'range': brightness_range,
            'fill_pct': fill_pct,
            'is_uniform': is_uniform
        }
        samples.append(sample)
        
        # Print analysis
        print(f"\n{label} bubble at ({x}, {y}):")
        print(f"  Original: avg={avg_orig:.1f}, min={min_orig:.1f}, max={max_orig:.1f}, std={std_orig:.1f}, range={brightness_range:.1f}")
        print(f"  Normalized: avg={avg_norm:.1f}")
        print(f"  Fill: {fill_pct:.1f}%")
        print(f"  Uniform: {is_uniform}")
        
        # Draw circle on image
        color = (0, 0, 255) if label == "FILLED" else (0, 255, 0)
        cv2.circle(img, (x, y), r, color, 2)
        cv2.imshow("Bubble Analysis", img)
    
    cv2.namedWindow("Bubble Analysis")
    cv2.setMouseCallback("Bubble Analysis", mouse_callback)
    cv2.imshow("Bubble Analysis", img)
    
    print("\nWaiting for clicks...")
    cv2.waitKey(0)
    cv2.destroyAllWindows()
    
    # Print summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    if filled_samples:
        print(f"\nFILLED bubbles ({len(filled_samples)} samples):")
        avg_brightness = np.mean([s['avg_orig'] for s in filled_samples])
        avg_std = np.mean([s['std_orig'] for s in filled_samples])
        avg_fill = np.mean([s['fill_pct'] for s in filled_samples])
        print(f"  Average brightness: {avg_brightness:.1f}")
        print(f"  Average std_dev: {avg_std:.1f}")
        print(f"  Average fill%: {avg_fill:.1f}")
        print(f"  Brightness range: {min([s['avg_orig'] for s in filled_samples]):.1f} - {max([s['avg_orig'] for s in filled_samples]):.1f}")
    
    if empty_samples:
        print(f"\nEMPTY bubbles ({len(empty_samples)} samples):")
        avg_brightness = np.mean([s['avg_orig'] for s in empty_samples])
        avg_std = np.mean([s['std_orig'] for s in empty_samples])
        avg_fill = np.mean([s['fill_pct'] for s in empty_samples])
        print(f"  Average brightness: {avg_brightness:.1f}")
        print(f"  Average std_dev: {avg_std:.1f}")
        print(f"  Average fill%: {avg_fill:.1f}")
        print(f"  Brightness range: {min([s['avg_orig'] for s in empty_samples]):.1f} - {max([s['avg_orig'] for s in empty_samples]):.1f}")
    
    if filled_samples and empty_samples:
        print(f"\nDIFFERENCE:")
        filled_avg = np.mean([s['avg_orig'] for s in filled_samples])
        empty_avg = np.mean([s['avg_orig'] for s in empty_samples])
        print(f"  Brightness difference: {empty_avg - filled_avg:.1f}")
        
        filled_std = np.mean([s['std_orig'] for s in filled_samples])
        empty_std = np.mean([s['std_orig'] for s in empty_samples])
        print(f"  Std_dev difference: {filled_std - empty_std:.1f}")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python analyze_bubbles.py <image_path>")
        sys.exit(1)
    
    analyze_sample_bubbles(sys.argv[1])
