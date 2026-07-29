#!/usr/bin/env python3
"""Generate masked 16-bit relative depth maps for normalized turntable views."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import pipeline


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference-manifest", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--model", default="depth-anything/Depth-Anything-V2-Small-hf")
    return parser.parse_args()


def normalize_foreground(values: np.ndarray, mask: np.ndarray) -> np.ndarray:
    foreground = values[mask]
    if foreground.size == 0:
        raise RuntimeError("Depth input has an empty foreground mask")
    low, high = np.percentile(foreground, (1.0, 99.0))
    if high <= low:
        return np.zeros_like(values, dtype=np.float32)
    normalized = np.clip((values - low) / (high - low), 0, 1)
    normalized[~mask] = 0
    return normalized.astype(np.float32)


def main() -> None:
    args = parse_args()
    reference = json.loads(args.reference_manifest.read_text(encoding="utf-8"))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    args.manifest.parent.mkdir(parents=True, exist_ok=True)

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    estimator = pipeline("depth-estimation", model=args.model, device=device)
    outputs: list[dict] = []

    for view in reference["views"]:
        image = Image.open(view["normalizedPath"]).convert("RGB")
        mask_image = Image.open(view["maskPath"]).convert("L")
        mask = np.asarray(mask_image) >= 24
        result = estimator(image)
        depth = np.asarray(result["depth"].resize(image.size, Image.Resampling.BICUBIC), dtype=np.float32)
        depth = normalize_foreground(depth, mask)

        stem = f'huihui-angle-{view["angle"]:03d}-{view["view"]}'
        depth_16_path = (args.output_dir / f"{stem}-depth16.png").resolve()
        preview_path = (args.output_dir / f"{stem}-depth-preview.png").resolve()
        Image.fromarray(np.uint16(depth * 65535), mode="I;16").save(depth_16_path)
        Image.fromarray(np.uint8(depth * 255), mode="L").save(preview_path)
        outputs.append(
            {
                "angle": view["angle"],
                "view": view["view"],
                "depth16Path": str(depth_16_path),
                "previewPath": str(preview_path),
                "relativeDepthOnly": True,
                "foregroundPercentiles": [1.0, 99.0],
            }
        )

    manifest = {
        "schemaVersion": 1,
        "assetId": reference["assetId"],
        "status": "DEPTH_SET_READY",
        "model": args.model,
        "device": device,
        "metricDepth": False,
        "warning": "Single-view depth is a shape prior. Multi-view silhouettes remain the geometric constraint.",
        "views": outputs,
    }
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "PASS", "views": len(outputs), "device": device}, ensure_ascii=False))


if __name__ == "__main__":
    main()
