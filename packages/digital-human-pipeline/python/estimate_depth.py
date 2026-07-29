#!/usr/bin/env python3
"""Estimate a normalized scene depth map using Depth Anything V2."""

import argparse
import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import pipeline


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--model", default="depth-anything/Depth-Anything-V2-Small-hf")
    return parser.parse_args()


def main():
    args = parse_args()
    source = Path(args.input).resolve()
    output = Path(args.output).resolve()
    manifest = Path(args.manifest).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    manifest.parent.mkdir(parents=True, exist_ok=True)

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    estimator = pipeline("depth-estimation", model=args.model, device=device)
    image = Image.open(source).convert("RGB")
    result = estimator(image)
    depth = np.asarray(result["depth"], dtype=np.float32)
    depth -= depth.min()
    maximum = float(depth.max())
    if maximum > 0:
        depth /= maximum
    depth_image = Image.fromarray(np.uint8(np.clip(depth, 0, 1) * 255), mode="L")
    depth_image.save(output)

    data = {
        "schemaVersion": 1,
        "status": "PASS",
        "source": str(source),
        "output": str(output),
        "model": args.model,
        "device": device,
        "width": image.width,
        "height": image.height,
        "depthMin": float(depth.min()),
        "depthMax": float(depth.max()),
    }
    manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(data, ensure_ascii=False))


if __name__ == "__main__":
    main()
