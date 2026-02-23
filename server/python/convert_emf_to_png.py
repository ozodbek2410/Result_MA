#!/usr/bin/env python3
"""
EMF/WMF to PNG converter using Pillow
Usage: python convert_emf_to_png.py <input_emf> <output_png> [width_px] [height_px]

Windows: Pillow EMF/WMF ni GDI+ orqali ochadi

width_px va height_px berilsa, rasm aynan shu o'lchamga resize qilinadi
(Word dagi original o'lcham)
"""

import sys
import os


def convert_emf_to_png(input_path, output_path, target_width=None, target_height=None):
    """EMF/WMF faylni PNG ga konvertatsiya qilish (Word original o'lchami bilan)"""
    try:
        from PIL import Image
    except ImportError:
        print("Pillow not installed. Install: pip install Pillow", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(input_path):
        print(f"Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    try:
        img = Image.open(input_path)

        # 150 DPI da render qilish - yaxshi sifat, lekin haddan tashqari katta emas
        try:
            img.load(dpi=150)
        except TypeError:
            pass

        # Agar Word dan o'lcham berilgan bo'lsa, aynan shu o'lchamga resize qilish
        if target_width and target_height and target_width > 0 and target_height > 0:
            img = img.resize((target_width, target_height), Image.LANCZOS)
        # Agar o'lcham berilmagan bo'lsa, native o'lchamda qoldirish
        # Hech qanday sun'iy kattalashtirish yo'q

        # RGBA bo'lsa, oq fon qo'shish
        if img.mode == 'RGBA':
            background = Image.new('RGB', img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[3])
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        # PNG sifat parametrlari
        img.save(output_path, 'PNG', optimize=True, dpi=(150, 150))

        print(f"Converted: {input_path} -> {output_path} ({img.width}x{img.height}px)")
        return True

    except Exception as e:
        print(f"Conversion error: {e}", file=sys.stderr)

        # Fallback: oddiy ochib saqlash
        try:
            img = Image.open(input_path)
            if img.mode == 'RGBA':
                background = Image.new('RGB', img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[3])
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            # Agar target o'lcham berilgan bo'lsa, resize qilish
            if target_width and target_height and target_width > 0 and target_height > 0:
                img = img.resize((target_width, target_height), Image.LANCZOS)

            img.save(output_path, 'PNG')
            print(f"Fallback conversion: {input_path} -> {output_path} ({img.width}x{img.height}px)")
            return True
        except Exception as e2:
            print(f"Fallback also failed: {e2}", file=sys.stderr)
            sys.exit(1)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python convert_emf_to_png.py <input_emf> <output_png> [width_px] [height_px]")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]
    width = int(sys.argv[3]) if len(sys.argv) > 3 else None
    height = int(sys.argv[4]) if len(sys.argv) > 4 else None

    convert_emf_to_png(input_file, output_file, width, height)
