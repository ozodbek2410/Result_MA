"""
QR kod o'qish — EvalBee-level ishonchlilik.

Yondashuvlar:
1. ROI-first: QR joyi ma'lum (tepa o'ng) → avval shu regionni sinash
2. Multi-scale: [1.0, 1.5, 2.0, 0.75]
3. CLAHE enhancement: qorong'u/soyali QR uchun
4. pyzbar fallback: cv2 ishlamasa
5. Warped image retry: perspektiv tuzatilgandan keyin qayta sinash (scanner.py da)

v1: plain string "A1B2C3D4"
v2: JSON {"v":2,"c":"A1B2C3D4","q":90,"t":"block_test"}
"""
import json
import cv2
import numpy as np


def read_qr(image: np.ndarray, roi_hint: tuple = None) -> dict:
    """
    Rasmdan QR kod o'qish — multi-strategy.

    Args:
        image: BGR yoki grayscale rasm
        roi_hint: (x1, y1, x2, y2) — QR joyi (optional)

    Returns dict:
        found, variant_code, total_questions, test_type, raw
    """
    result = {"found": False, "variant_code": None, "total_questions": None,
              "test_type": None, "raw": None}

    # 1. ROI hint bilan sinash (eng tez)
    if roi_hint is not None:
        x1, y1, x2, y2 = roi_hint
        h, w = image.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        if x2 > x1 and y2 > y1:
            roi = image[y1:y2, x1:x2]
            data = _try_decode(roi)
            if data:
                result["found"] = True
                result["raw"] = data
                _parse_payload(data, result)
                return result

    # 2. Full image
    data = _try_decode(image)
    if data:
        result["found"] = True
        result["raw"] = data
        _parse_payload(data, result)
        return result

    # 3. Top-right region (QR odatda shu yerda)
    h, w = image.shape[:2]
    roi_tr = image[0:int(h * 0.35), int(w * 0.55):w]
    data = _try_decode(roi_tr)
    if data:
        result["found"] = True
        result["raw"] = data
        _parse_payload(data, result)
        return result

    # 4. Top-left region (ba'zi shablonlarda)
    roi_tl = image[0:int(h * 0.35), 0:int(w * 0.45)]
    data = _try_decode(roi_tl)
    if data:
        result["found"] = True
        result["raw"] = data
        _parse_payload(data, result)
        return result

    return result


def _try_decode(img: np.ndarray) -> str | None:
    """
    Multi-scale + CLAHE bilan QR decode qilish.
    cv2.QRCodeDetector + pyzbar fallback.
    """
    detector = cv2.QRCodeDetector()
    scales = [1.0, 1.5, 2.0, 0.75]

    for scale in scales:
        if scale != 1.0:
            scaled = cv2.resize(img, None, fx=scale, fy=scale,
                                interpolation=cv2.INTER_CUBIC)
        else:
            scaled = img

        # Direct decode
        data, _, _ = detector.detectAndDecode(scaled)
        if data:
            return data

        # CLAHE enhanced decode
        gray = cv2.cvtColor(scaled, cv2.COLOR_BGR2GRAY) if len(scaled.shape) == 3 else scaled
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4))
        enhanced = clahe.apply(gray)
        data, _, _ = detector.detectAndDecode(enhanced)
        if data:
            return data

    # pyzbar fallback — barcha scale lar bilan
    try:
        from pyzbar.pyzbar import decode as pyzbar_decode
        for scale in [1.0, 2.0]:
            if scale != 1.0:
                scaled = cv2.resize(img, None, fx=scale, fy=scale,
                                    interpolation=cv2.INTER_CUBIC)
            else:
                scaled = img
            gray = cv2.cvtColor(scaled, cv2.COLOR_BGR2GRAY) if len(scaled.shape) == 3 else scaled
            decoded = pyzbar_decode(gray)
            if decoded:
                return decoded[0].data.decode("utf-8")
    except ImportError:
        pass

    return None


def _parse_payload(data: str, result: dict) -> None:
    """v1 va v2 payload parsing."""
    data = data.strip()

    # v2: JSON format
    if data.startswith("{"):
        try:
            obj = json.loads(data)
            result["variant_code"] = obj.get("c")
            result["total_questions"] = obj.get("q")
            result["test_type"] = obj.get("t")
            return
        except json.JSONDecodeError:
            pass

    # v1: plain string — variant code
    result["variant_code"] = data
    result["total_questions"] = None
