#!/usr/bin/env python3
"""Normalize AI turntable frames against an authoritative front master."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from rembg import new_session, remove


CANVAS_SIZE = (1214, 1296)
BACKGROUND = (239, 241, 244)
ANGLE_FILES = (
    ("000", "front", "huihui-brand-front-master.png"),
    ("045", "front-right", "huihui-angle-045-front-right.png"),
    ("090", "right", "huihui-angle-090-right.png"),
    ("135", "rear-right", "huihui-angle-135-rear-right.png"),
    ("180", "back", "huihui-angle-180-back.png"),
    ("225", "rear-left", "huihui-angle-225-rear-left.png"),
    ("270", "left", "huihui-angle-270-left.png"),
    ("315", "front-left", "huihui-angle-315-front-left.png"),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--front", required=True, type=Path)
    parser.add_argument("--generated-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--mask-dir", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--contact-sheet", required=True, type=Path)
    return parser.parse_args()


def alpha_bbox(image: Image.Image, threshold: int = 24) -> tuple[int, int, int, int]:
    alpha = np.asarray(image.getchannel("A"))
    ys, xs = np.where(alpha >= threshold)
    if not len(xs):
        raise RuntimeError("Foreground segmentation returned an empty mask")
    return int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)


def segment(image: Image.Image, session) -> Image.Image:
    return remove(
        image.convert("RGB"),
        session=session,
        alpha_matting=True,
        alpha_matting_foreground_threshold=245,
        alpha_matting_background_threshold=15,
        alpha_matting_erode_size=5,
    ).convert("RGBA")


def normalize_frame(
    foreground: Image.Image,
    target_bbox: tuple[int, int, int, int],
) -> tuple[Image.Image, Image.Image, dict]:
    source_bbox = alpha_bbox(foreground)
    cropped = foreground.crop(source_bbox)
    target_height = target_bbox[3] - target_bbox[1]
    scale = target_height / max(1, cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), target_height),
        Image.Resampling.LANCZOS,
    )

    target_center_x = (target_bbox[0] + target_bbox[2]) / 2
    paste_x = round(target_center_x - resized.width / 2)
    paste_y = target_bbox[3] - resized.height

    rgba_canvas = Image.new("RGBA", CANVAS_SIZE, (*BACKGROUND, 255))
    rgba_canvas.alpha_composite(resized, (paste_x, paste_y))
    mask_canvas = Image.new("L", CANVAS_SIZE, 0)
    mask_canvas.paste(resized.getchannel("A"), (paste_x, paste_y))

    normalized_bbox = alpha_bbox(
        Image.merge(
            "RGBA",
            (
                mask_canvas,
                mask_canvas,
                mask_canvas,
                mask_canvas,
            ),
        )
    )
    metadata = {
        "sourceForegroundBox": list(source_bbox),
        "scale": round(scale, 8),
        "normalizedForegroundBox": list(normalized_bbox),
        "groundLineY": target_bbox[3],
        "canvas": list(CANVAS_SIZE),
    }
    return rgba_canvas.convert("RGB"), mask_canvas, metadata


def make_contact_sheet(entries: list[dict], destination: Path) -> None:
    thumb_size = (303, 324)
    header = 34
    sheet = Image.new("RGB", (thumb_size[0] * 4, (thumb_size[1] + header) * 2), (20, 24, 31))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, entry in enumerate(entries):
        row, column = divmod(index, 4)
        image = Image.open(entry["normalizedPath"]).convert("RGB")
        image.thumbnail(thumb_size, Image.Resampling.LANCZOS)
        x = column * thumb_size[0] + (thumb_size[0] - image.width) // 2
        y = row * (thumb_size[1] + header) + header
        sheet.paste(image, (x, y))
        label = f'{entry["angle"]} deg  {entry["view"]}'
        draw.text((column * thumb_size[0] + 10, row * (thumb_size[1] + header) + 10), label, fill="white", font=font)
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, quality=95)


def main() -> None:
    args = parse_args()
    for directory in (args.output_dir, args.mask_dir, args.manifest.parent):
        directory.mkdir(parents=True, exist_ok=True)

    session = new_session("isnet-general-use")
    front_source = args.front.resolve()
    front_segmented = segment(Image.open(front_source), session)
    target_bbox = alpha_bbox(front_segmented)

    entries: list[dict] = []
    for angle, view, filename in ANGLE_FILES:
        source = front_source if angle == "000" else (args.generated_dir / filename).resolve()
        if not source.exists():
            raise FileNotFoundError(source)
        image = Image.open(source).convert("RGB")
        segmented = front_segmented if angle == "000" else segment(image, session)
        normalized, mask, metadata = normalize_frame(segmented, target_bbox)
        normalized_path = (args.output_dir / f"huihui-angle-{angle}-{view}.png").resolve()
        mask_path = (args.mask_dir / f"huihui-angle-{angle}-{view}-mask.png").resolve()
        normalized.save(normalized_path)
        mask.save(mask_path)
        entries.append(
            {
                "angle": int(angle),
                "view": view,
                "sourcePath": str(source),
                "sourceSize": [image.width, image.height],
                "normalizedPath": str(normalized_path),
                "maskPath": str(mask_path),
                "authority": "identity-and-proportion-master" if angle == "000" else "ai-derived-hidden-geometry-reference",
                **metadata,
            }
        )

    make_contact_sheet(entries, args.contact_sheet.resolve())
    manifest = {
        "schemaVersion": 1,
        "assetId": "huihui-printable-v3",
        "status": "REFERENCE_SET_READY",
        "authoritativeView": 0,
        "canvas": list(CANVAS_SIZE),
        "normalization": "constant foreground height, center line and ground line; aspect ratio preserved",
        "generatedViewsAreMetric": False,
        "views": entries,
    }
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "PASS", "views": len(entries), "manifest": str(args.manifest)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
