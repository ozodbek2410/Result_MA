#!/usr/bin/env python3
"""
Formula image → LaTeX OCR using pix2tex.
Usage: python formula_ocr.py <image_path> [image_path2 ...]
       python formula_ocr.py --json <image_path1> <image_path2> ...

Returns LaTeX string for each image. With --json flag, returns JSON mapping.
"""
import sys
import json
import os


def ocr_formula(image_path: str, model) -> str:
    """OCR a single formula image and return LaTeX string."""
    from PIL import Image

    if not os.path.exists(image_path):
        return ''

    try:
        img = Image.open(image_path)

        # Upscale small images for better OCR accuracy
        MIN_WIDTH = 200
        if img.width < MIN_WIDTH and img.width > 0:
            scale = max(2, MIN_WIDTH // img.width)
            img = img.resize((img.width * scale, img.height * scale), Image.LANCZOS)

        # Convert to RGB if needed
        if img.mode != 'RGB':
            bg = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'RGBA':
                bg.paste(img, mask=img.split()[3])
            else:
                bg.paste(img)
            img = bg

        result = model(img)
        return result.strip() if result else ''
    except Exception as e:
        print(f"OCR error for {image_path}: {e}", file=sys.stderr)
        return ''


def main():
    if len(sys.argv) < 2:
        print("Usage: python formula_ocr.py [--json] <image_path> [image_path2 ...]", file=sys.stderr)
        sys.exit(1)

    json_mode = sys.argv[1] == '--json'
    paths = sys.argv[2:] if json_mode else sys.argv[1:]

    if not paths:
        print("{}" if json_mode else "")
        return

    # Load model once (heavy — ~500MB first time, cached after)
    try:
        from pix2tex.cli import LatexOCR
        model = LatexOCR()
    except ImportError:
        print("pix2tex not installed. Install: pip install pix2tex", file=sys.stderr)
        if json_mode:
            print("{}")
        sys.exit(1)

    if json_mode:
        result = {}
        for p in paths:
            latex = ocr_formula(p, model)
            result[p] = latex
        print(json.dumps(result))
    else:
        for p in paths:
            latex = ocr_formula(p, model)
            print(latex)


if __name__ == '__main__':
    main()
