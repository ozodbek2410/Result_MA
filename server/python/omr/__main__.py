"""python -m omr <image> [--questions N] [--debug]"""
import sys
import json
import argparse

from scanner import OMRScanner

p = argparse.ArgumentParser(description="OMR Scanner v2")
p.add_argument("image")
p.add_argument("--questions", "-q", type=int)
p.add_argument("--debug", action="store_true")
args = p.parse_args()

r = OMRScanner(debug=args.debug).scan(args.image, total_questions=args.questions)
print(json.dumps(r, ensure_ascii=False, indent=2))
