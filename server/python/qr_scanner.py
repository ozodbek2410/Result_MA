#!/usr/bin/env python3
"""
QR Code Scanner for OMR Answer Sheets
Supports v1 (plain string) and v2 ({"v":2,"c":"CODE","q":90,"t":"test"}) formats.
Returns structured result: found, variant_code, total_questions, test_type, raw, data
"""
import cv2
import json
import sys
import numpy as np


def _parse_payload(raw: str) -> dict:
    """v1 va v2 QR payload parsing — omr/qr.py bilan bir xil mantiq."""
    s = raw.strip()
    if s.startswith('{'):
        try:
            obj = json.loads(s)
            return {
                'variant_code': obj.get('c'),
                'total_questions': obj.get('q'),
                'test_type': obj.get('t'),
            }
        except json.JSONDecodeError:
            pass
    # v1: plain string — faqat variant code
    code = ''.join(c for c in s.upper() if c.isalnum() or c == '-')
    return {'variant_code': code or s, 'total_questions': None, 'test_type': None}


def scan_qr_code(image_path: str) -> dict:
    """
    Rasmdan QR kod o'qish. Ko'p usul sinab ko'riladi.
    Returns: {found, variant_code, total_questions, test_type, raw, data}
    data = raw (backward compat)
    """
    try:
        img = cv2.imread(image_path)
        if img is None:
            return {'found': False, 'error': 'Rasm o\'qilmadi'}

        detector = cv2.QRCodeDetector()
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        candidates = [img, gray]

        # CLAHE
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        candidates.append(clahe.apply(gray))

        # Thresholds
        _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
        candidates.append(binary)
        _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        candidates.append(otsu)
        adaptive = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )
        candidates.append(adaptive)

        # Scale variants
        h, w = img.shape[:2]
        for scale in [1.5, 2.0, 0.75]:
            candidates.append(
                cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_LINEAR)
            )

        for candidate in candidates:
            data, _, _ = detector.detectAndDecode(candidate)
            if data:
                parsed = _parse_payload(data)
                if parsed['variant_code']:
                    return {
                        'found': True,
                        'raw': data,
                        'data': data,  # backward compat
                        **parsed,
                    }

        # pyzbar fallback
        try:
            from pyzbar.pyzbar import decode
            decoded = decode(gray)
            if decoded:
                data = decoded[0].data.decode('utf-8')
                parsed = _parse_payload(data)
                if parsed['variant_code']:
                    return {
                        'found': True,
                        'raw': data,
                        'data': data,
                        **parsed,
                    }
        except ImportError:
            pass

        return {'found': False, 'error': 'QR kod topilmadi'}

    except Exception as e:
        return {'found': False, 'error': str(e)}


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'found': False, 'error': 'Rasm yo\'li berilmadi'}))
        sys.exit(1)

    result = scan_qr_code(sys.argv[1])

    if result.get('found'):
        print(f"[QR] variant={result.get('variant_code')} q={result.get('total_questions')} t={result.get('test_type')}", file=sys.stderr)
    else:
        print(f"[QR] topilmadi: {result.get('error')}", file=sys.stderr)

    print(json.dumps(result, ensure_ascii=False))
