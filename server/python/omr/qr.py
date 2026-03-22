"""
QR kod o'qish va payload parsing.
v1: plain string "A1B2C3D4"
v2: JSON {"v":2,"c":"A1B2C3D4","q":90,"t":"block_test"}
"""
import json
import cv2
import numpy as np


def read_qr(image: np.ndarray) -> dict:
    """
    Rasmdan QR kod o'qish.
    MUHIM: perspektiv transform OLDIN original rasmda o'qilsin —
    QR decoder distorted rasmlarda ishlamaydi.

    Returns dict:
        found: bool
        variant_code: str | None
        total_questions: int | None
        test_type: str | None  ("block_test" | "test")
        raw: str | None
    """
    result = {"found": False, "variant_code": None, "total_questions": None,
              "test_type": None, "raw": None}

    detector = cv2.QRCodeDetector()

    # Original rasmda sinash
    data, _, _ = detector.detectAndDecode(image)
    if not data:
        # Bir oz o'lchamini oshirib sinash (kichik QR uchun)
        h, w = image.shape[:2]
        bigger = cv2.resize(image, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
        data, _, _ = detector.detectAndDecode(bigger)

    if not data:
        # pyzbar fallback (agar mavjud bo'lsa)
        try:
            from pyzbar.pyzbar import decode
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
            decoded = decode(gray)
            if decoded:
                data = decoded[0].data.decode("utf-8")
        except ImportError:
            pass

    if not data:
        return result

    result["found"] = True
    result["raw"] = data
    _parse_payload(data, result)
    return result


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
    # total_questions v1 da yo'q — layout detection kerak
    result["total_questions"] = None
