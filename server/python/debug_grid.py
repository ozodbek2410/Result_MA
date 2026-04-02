#!/usr/bin/env python3
"""Debug grid positions for a specific OMR scan."""
import cv2, numpy as np, sys, os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from omr_hybrid import HybridOMR

image_path = sys.argv[1] if len(sys.argv) > 1 else "/var/www/Result_MA/server/uploads/omr/omr-1773806444255-158684403.jpg"

scanner = HybridOMR(total_questions=90, debug=False)
img = cv2.imread(image_path)
if img is None:
    print("ERROR: Cannot read", image_path)
    sys.exit(1)

corners = scanner.find_corner_marks(img)
print("Corners found:", {k: (v['x'], v['y']) for k, v in corners.items()} if corners else "NONE")

warped = scanner.four_point_transform(img, corners) if corners else img
resized, enhanced, scale = scanner._preprocess(warped)
h_proc, w_proc = resized.shape[:2]
print(f"Image: {w_proc}x{h_proc}, scale={scale:.3f}")

bubbles = scanner._detect_bubbles(enhanced)
print(f"Bubbles detected: {len(bubbles)}")
grid = scanner._build_grid(bubbles, w_proc, h_proc)
print(f"Grid: {len(grid)} rows")

# Show positions for Q1-Q15
for q in range(1, 16):
    if q in grid:
        r = grid[q]
        ax, bx, cx, dx = r['A']['x'], r['B']['x'], r['C']['x'], r['D']['x']
        ay = r['A']['y']
        print(f"Q{q:2d}: y={ay:4d}  A={ax:4d}  B={bx:4d}  C={cx:4d}  D={dx:4d}  gaps=[{bx-ax},{cx-bx},{dx-cx}]")

# Save warped + grid overlay for visual check
warped_resized = cv2.resize(warped, (w_proc, h_proc))
bw = 28  # approximate bubble width
for q in range(1, 16):
    if q in grid:
        r = grid[q]
        for letter in ['A', 'B', 'C', 'D']:
            x, y = r[letter]['x'], r[letter]['y']
            color = (0, 0, 255) if letter == 'A' else (0, 255, 0) if letter == 'B' else (255, 0, 0) if letter == 'C' else (255, 255, 0)
            cv2.rectangle(warped_resized, (x - bw//2, y - bw//2), (x + bw//2, y + bw//2), color, 2)
            cv2.putText(warped_resized, letter, (x - 5, y - bw//2 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

output_path = "/var/www/Result_MA/server/uploads/debug_grid_overlay.jpg"
cv2.imwrite(output_path, warped_resized)
print(f"Saved overlay: {output_path}")

# Measure actual pixel darkness at each position for Q1-Q13
print("\n--- Actual pixel values Q1-Q13 (enhanced, lower=darker) ---")
for q in range(1, 14):
    if q in grid:
        r = grid[q]
        vals = {}
        for letter in ['A', 'B', 'C', 'D']:
            x, y = r[letter]['x'], r[letter]['y']
            roi = enhanced[max(0,y-bw//2):y+bw//2, max(0,x-bw//2):x+bw//2]
            mean_val = np.mean(roi) if roi.size > 0 else 0
            vals[letter] = mean_val
        darkest = min(vals, key=vals.get)
        print(f"Q{q:2d}: A={vals['A']:.0f} B={vals['B']:.0f} C={vals['C']:.0f} D={vals['D']:.0f}  darkest={darkest}")
