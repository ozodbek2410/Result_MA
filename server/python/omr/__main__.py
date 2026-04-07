"""python -m omr <image> [--questions N] [--corners JSON] [--debug]

M-08 FIX: --corners argumenti qo'shildi.
  scanner.py da mavjud edi, __main__.py da yo'q edi.
  Endi command line dan client corners berib test qilish mumkin:

  python -m omr sheet.jpg --questions 60 --corners '[{"x":50,"y":40},{"x":950,"y":40},{"x":50,"y":1380},{"x":950,"y":1380}]'
"""
import sys
import json
import argparse

from scanner import OMRScanner

p = argparse.ArgumentParser(description="OMR Scanner v2")
p.add_argument("image", help="Rasm fayl yo'li")
p.add_argument("--questions", "-q", type=int, help="Savol soni (QR topilmasa ishlatiladi)")
p.add_argument(
    "--corners",
    type=str,
    default=None,
    help="Client corners JSON: [{x,y},{x,y},{x,y},{x,y}] — TL,TR,BL,BR tartibida",
)
p.add_argument("--debug", action="store_true", help="Traceback va batafsil log chiqarish")
args = p.parse_args()

client_corners = None
if args.corners:
    try:
        client_corners = json.loads(args.corners)
        if not isinstance(client_corners, list) or len(client_corners) != 4:
            print("[omr] --corners 4 elementli JSON array bo'lishi kerak", file=sys.stderr)
            sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"[omr] --corners JSON parse xatosi: {e}", file=sys.stderr)
        sys.exit(1)

r = OMRScanner(debug=args.debug).scan(
    args.image,
    total_questions=args.questions,
    client_corners=client_corners,
)
print(json.dumps(r, ensure_ascii=False, indent=2))
