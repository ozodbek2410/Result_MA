#!/usr/bin/env python3
"""Debug script: test adaptive _detect_fills on a specific image."""
import cv2, numpy as np, sys, os

script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)
from omr_hybrid import HybridOMR

image_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    script_dir, "..", "uploads", "omr", "omr-1773765426827-544201053.jpg")

scanner = HybridOMR(total_questions=90, debug=True)
img = cv2.imread(image_path)
if img is None:
    print("ERROR: Cannot read", image_path)
    sys.exit(1)

corners = scanner.find_corner_marks(img)
warped = scanner.four_point_transform(img, corners) if corners else img
resized, enhanced, scale = scanner._preprocess(warped)
scanner._color_resized = resized
h_proc, w_proc = enhanced.shape[:2]

bubbles = scanner._detect_bubbles(enhanced)
grid = scanner.build_grid_from_layout(resized, bubbles=bubbles)

sample_q = next(iter(grid.values()))
bubble_w = sample_q.get("A", {}).get("w", int(w_proc / 45))

print(f"\nGrid: {len(grid)} questions, bubble_w={bubble_w}")
print(f"\n--- Running adaptive _detect_fills ---")
detected, invalid = scanner._detect_fills(grid, enhanced, bubble_w, w_proc, h_proc, color_img=resized)

print(f"\n=== RESULTS ===")
print(f"Detected: {len(detected)} answers")
print(f"Invalid (multi): {len(invalid)} answers")
for q in sorted(detected.keys(), key=int):
    print(f"  Q{q}: {detected[q]}")
for q in sorted(invalid.keys(), key=int):
    print(f"  Q{q}: MULTI {invalid[q]}")
print(f"Unanswered: {90 - len(detected) - len(invalid)}")
