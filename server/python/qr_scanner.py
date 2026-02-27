#!/usr/bin/env python3
"""
QR Code Scanner for OMR Answer Sheets
Supports multiple detection methods for robust QR code reading
"""
        
import cv2
import json
import sys
import numpy as np

def scan_qr_code(image_path):
    """
    Scan QR code from image using multiple methods
    Returns: dict with 'found' (bool) and 'data' (str) keys
    """
    try:
        # Read image
        img = cv2.imread(image_path)
        if img is None:
            return {'found': False, 'error': 'Failed to read image'}
        
        # Initialize QR detector
        detector = cv2.QRCodeDetector()
        
        def clean_qr_data(data):
            """Clean and normalize QR code data"""
            if not data:
                return None
            # Remove whitespace and convert to uppercase
            cleaned = data.strip().upper()
            # Remove any non-alphanumeric characters except hyphens
            cleaned = ''.join(c for c in cleaned if c.isalnum() or c == '-')
            return cleaned if cleaned else None
        
        # Method 1: Original image
        data, bbox, _ = detector.detectAndDecode(img)
        if data:
            cleaned = clean_qr_data(data)
            if cleaned:
                return {'found': True, 'data': cleaned}
        
        # Method 2: Grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        data, bbox, _ = detector.detectAndDecode(gray)
        if data:
            cleaned = clean_qr_data(data)
            if cleaned:
                return {'found': True, 'data': cleaned}
        
        # Method 3: CLAHE (Contrast Limited Adaptive Histogram Equalization)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        data, bbox, _ = detector.detectAndDecode(enhanced)
        if data:
            cleaned = clean_qr_data(data)
            if cleaned:
                return {'found': True, 'data': cleaned}
        
        # Method 4: Binary threshold
        _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
        data, bbox, _ = detector.detectAndDecode(binary)
        if data:
            cleaned = clean_qr_data(data)
            if cleaned:
                return {'found': True, 'data': cleaned}
        
        # Method 5: Adaptive threshold
        adaptive = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY, 11, 2
        )
        data, bbox, _ = detector.detectAndDecode(adaptive)
        if data:
            cleaned = clean_qr_data(data)
            if cleaned:
                return {'found': True, 'data': cleaned}
        
        # Method 6: Otsu's threshold
        _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        data, bbox, _ = detector.detectAndDecode(otsu)
        if data:
            cleaned = clean_qr_data(data)
            if cleaned:
                return {'found': True, 'data': cleaned}
        
        # Method 7: Try with different scales
        for scale in [0.5, 1.5, 2.0]:
            width = int(img.shape[1] * scale)
            height = int(img.shape[0] * scale)
            resized = cv2.resize(img, (width, height), interpolation=cv2.INTER_LINEAR)
            data, bbox, _ = detector.detectAndDecode(resized)
            if data:
                cleaned = clean_qr_data(data)
                if cleaned:
                    return {'found': True, 'data': cleaned}
        
        return {'found': False, 'error': 'QR code not detected'}
        
    except Exception as e:
        return {'found': False, 'error': str(e)}

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'found': False, 'error': 'No image path provided'}))
        sys.exit(1)
    
    image_path = sys.argv[1]
    result = scan_qr_code(image_path)
    
    # Log to stderr for debugging
    if result.get('found'):
        print(f"DEBUG: QR Code found: '{result['data']}'", file=sys.stderr)
        print(f"DEBUG: QR Code length: {len(result['data'])}", file=sys.stderr)
        print(f"DEBUG: QR Code bytes: {result['data'].encode('utf-8').hex()}", file=sys.stderr)
    else:
        print(f"DEBUG: QR Code not found: {result.get('error', 'Unknown error')}", file=sys.stderr)
    
    print(json.dumps(result, ensure_ascii=False))
