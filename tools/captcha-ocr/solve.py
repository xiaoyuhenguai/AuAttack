#!/usr/bin/env python3
"""Solve a captcha image with ddddocr.

Usage:
  python solve.py <image> [--mode ocr]

Outputs JSON: {"ok": true, "text": "abcd", "mode": "ocr"}
"""
import argparse
import json
import sys


def main() -> int:
    ap = argparse.ArgumentParser(description="ddddocr captcha solver")
    ap.add_argument("image", help="path to the captcha image")
    ap.add_argument(
        "--mode", choices=["ocr", "slide"], default="ocr",
        help="ocr: alphanumeric captcha; slide: slide-captcha gap (needs --target)",
    )
    ap.add_argument("--target", default=None, help="slide mode: target image path")
    args = ap.parse_args()

    try:
        import ddddocr
    except ImportError as exc:
        print(json.dumps({"ok": False, "error": "ddddocr not installed; run: pip install ddddocr"}))
        return 2

    if args.mode == "ocr":
        ocr = ddddocr.DdddOcr(show_ad=False)
        with open(args.image, "rb") as fh:
            img = fh.read()
        text = ocr.classification(img).strip()
        print(json.dumps({"ok": bool(text), "text": text, "mode": "ocr"}))
        return 0

    if args.mode == "slide":
        if not args.target:
            print(json.dumps({"ok": False, "error": "slide mode requires --target <image>"}))
            return 2
        det = ddddocr.DdddOcr(det=False, ocr=False, show_ad=False)
        with open(args.image, "rb") as fh:
            background = fh.read()
        with open(args.target, "rb") as fh:
            target = fh.read()
        result = det.slide_match(target, background, simple_target=True)
        x = result.get("target", {}).get("x") if isinstance(result, dict) else None
        print(json.dumps({"ok": x is not None, "x": x, "mode": "slide"}))
        return 0

    print(json.dumps({"ok": False, "error": "unknown mode"}))
    return 2


if __name__ == "__main__":
    sys.exit(main())
