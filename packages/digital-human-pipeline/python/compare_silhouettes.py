"""Compare normalized provider/refined silhouettes with the reference bundle."""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--render-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--contact-sheet", required=True)
    parser.add_argument("--size", type=int, default=512)
    return parser.parse_args()


def bbox(mask):
    rows, columns = np.nonzero(mask)
    if not len(rows):
        return None
    return columns.min(), rows.min(), columns.max() + 1, rows.max() + 1


def normalize_mask(mask, size):
    bounds = bbox(mask)
    canvas = Image.new("L", (size, size), 0)
    if bounds is None:
        return np.zeros((size, size), dtype=bool)
    source = Image.fromarray((mask * 255).astype(np.uint8)).crop(bounds)
    scale = min((size * 0.90) / source.width, (size * 0.90) / source.height)
    target = (
        max(1, round(source.width * scale)),
        max(1, round(source.height * scale)),
    )
    source = source.resize(target, Image.Resampling.LANCZOS)
    canvas.paste(source, ((size - target[0]) // 2, (size - target[1]) // 2))
    return np.asarray(canvas) > 127


def reference_mask(path):
    image = Image.open(path).convert("L")
    array = np.asarray(image)
    if array.mean() > 127:
        return array < 127
    return array > 127


def rendered_mask(path):
    image = Image.open(path).convert("RGBA")
    return np.asarray(image)[:, :, 3] > 8


def metric(reference, candidate):
    intersection = np.logical_and(reference, candidate).sum()
    union = np.logical_or(reference, candidate).sum()
    total = reference.sum() + candidate.sum()
    return {
        "iou": float(intersection / union) if union else 1.0,
        "dice": float((2 * intersection) / total) if total else 1.0,
        "referenceArea": int(reference.sum()),
        "candidateArea": int(candidate.sum()),
    }


def mask_image(mask, color):
    rgba = np.zeros((*mask.shape, 4), dtype=np.uint8)
    rgba[mask] = color
    return Image.fromarray(rgba, "RGBA")


def main():
    args = parse_args()
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    render_dir = Path(args.render_dir).resolve()
    output_path = Path(args.output).resolve()
    contact_path = Path(args.contact_sheet).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    contact_path.parent.mkdir(parents=True, exist_ok=True)

    rows = []
    cells = []
    for view in manifest["views"]:
        angle = int(view["angle"])
        reference = normalize_mask(reference_mask(view["maskPath"]), args.size)
        candidate_path = render_dir / f"silhouette-{angle:03d}.png"
        candidate = normalize_mask(rendered_mask(candidate_path), args.size)
        values = metric(reference, candidate)
        rows.append(
            {
                "angle": angle,
                "view": view["view"],
                "authority": view["authority"],
                **{key: round(value, 6) if isinstance(value, float) else value for key, value in values.items()},
            }
        )
        overlay = Image.new("RGBA", (args.size, args.size), (12, 18, 28, 255))
        overlay.alpha_composite(mask_image(reference, (66, 165, 245, 150)))
        overlay.alpha_composite(mask_image(candidate, (249, 184, 48, 150)))
        draw = ImageDraw.Draw(overlay)
        draw.rectangle((0, 0, args.size, 42), fill=(5, 10, 18, 220))
        draw.text(
            (14, 12),
            f"{angle:03d}  IoU {values['iou']:.3f}",
            fill=(245, 248, 252, 255),
            font=ImageFont.load_default(),
        )
        cells.append(overlay.convert("RGB"))

    mean_iou = float(np.mean([row["iou"] for row in rows]))
    mean_dice = float(np.mean([row["dice"] for row in rows]))
    front_iou = next(row["iou"] for row in rows if row["angle"] == 0)
    minimum_iou = min(row["iou"] for row in rows)
    status = (
        "PASS"
        if mean_iou >= 0.72 and front_iou >= 0.76 and minimum_iou >= 0.58
        else "PASS_WITH_CONDITIONS"
        if mean_iou >= 0.60 and front_iou >= 0.65
        else "FAIL"
    )
    report = {
        "schemaVersion": 1,
        "status": status,
        "normalization": "translation-and-scale-normalized silhouette comparison",
        "thresholds": {
            "passMeanIou": 0.72,
            "passFrontIou": 0.76,
            "passMinimumIou": 0.58,
            "conditionalMeanIou": 0.60,
            "conditionalFrontIou": 0.65,
        },
        "summary": {
            "meanIou": round(mean_iou, 6),
            "meanDice": round(mean_dice, 6),
            "frontIou": round(front_iou, 6),
            "minimumIou": round(minimum_iou, 6),
        },
        "views": rows,
        "limitations": [
            "AI-derived hidden views are directional references, not metric scans.",
            "Silhouette agreement does not validate texture, facial identity, or minimum wall thickness.",
        ],
    }
    output_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    sheet = Image.new("RGB", (args.size * 4, args.size * 2), (8, 13, 22))
    for index, cell in enumerate(cells):
        sheet.paste(cell, ((index % 4) * args.size, (index // 4) * args.size))
    sheet.save(contact_path, quality=94)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
