#!/usr/bin/env python3

import argparse
import hashlib
import json
from pathlib import Path

import cv2


CHARACTERS = [
    {
        "assetId": "huihui",
        "displayName": "灰灰",
        "archetype": "robot",
        "panel": [0, 0, 768, 512],
        "hero": [70, 55, 380, 478],
        "front": [385, 52, 472, 222],
        "side": [475, 52, 575, 222],
        "back": [578, 52, 704, 222],
        "expressions": [385, 224, 704, 337],
    },
    {
        "assetId": "erbao",
        "displayName": "二宝",
        "archetype": "boy",
        "panel": [768, 0, 1536, 512],
        "hero": [790, 55, 1165, 478],
        "front": [1168, 48, 1262, 245],
        "side": [1262, 48, 1363, 245],
        "back": [1363, 48, 1480, 245],
        "expressions": [1160, 248, 1482, 356],
    },
    {
        "assetId": "xiaoban",
        "displayName": "小拌",
        "archetype": "mixer",
        "panel": [0, 512, 768, 960],
        "hero": [65, 555, 390, 946],
        "front": [390, 548, 480, 729],
        "side": [480, 548, 578, 729],
        "back": [578, 548, 704, 729],
        "expressions": [388, 730, 704, 839],
    },
    {
        "assetId": "water-tower-grandpa",
        "displayName": "水塔爷爷",
        "archetype": "water-tower",
        "panel": [768, 512, 1536, 960],
        "hero": [790, 550, 1150, 948],
        "front": [1148, 548, 1247, 733],
        "side": [1247, 548, 1350, 733],
        "back": [1350, 548, 1477, 733],
        "expressions": [1142, 733, 1480, 843],
    },
]


def crop(image, box):
    left, top, right, bottom = box
    return image[top:bottom, left:right]


def write_image(path: Path, image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if image.size == 0 or not cv2.imwrite(str(path), image):
        raise RuntimeError(f"CHARACTER_ASSET_WRITE_FAILED: {path}")


def make_contact_sheet(assets, output: Path) -> None:
    cells = []
    for asset in assets:
        row = []
        for view in ("front", "side", "back"):
            image = cv2.imread(str(output / asset["views"][view]), cv2.IMREAD_COLOR)
            if image is None:
                raise RuntimeError(f"CHARACTER_VIEW_UNREADABLE: {asset['views'][view]}")
            canvas = cv2.copyMakeBorder(image, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=(242, 240, 234))
            scale = min(220 / canvas.shape[1], 240 / canvas.shape[0])
            resized = cv2.resize(canvas, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
            cell = cv2.copyMakeBorder(
                resized,
                0,
                260 - resized.shape[0],
                0,
                240 - resized.shape[1],
                cv2.BORDER_CONSTANT,
                value=(242, 240, 234),
            )
            cv2.putText(
                cell,
                f"{asset['assetId']} / {view}",
                (10, 252),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.42,
                (45, 43, 39),
                1,
                cv2.LINE_AA,
            )
            row.append(cell)
        cells.append(cv2.hconcat(row))
    write_image(output / "tri-view-contact-sheet.jpg", cv2.vconcat(cells))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--manifest", required=True)
    args = parser.parse_args()

    source = Path(args.input).resolve()
    output = Path(args.output).resolve()
    manifest_path = Path(args.manifest).resolve()
    image = cv2.imread(str(source), cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError(f"CHARACTER_SHEET_UNREADABLE: {source}")
    height, width = image.shape[:2]
    if width != 1536 or height != 1024:
        raise RuntimeError(f"CHARACTER_SHEET_DIMENSIONS_UNSUPPORTED: {width}x{height}")

    output.mkdir(parents=True, exist_ok=True)
    extracted = []
    for character in CHARACTERS:
        character_root = output / character["assetId"]
        views = {}
        for view in ("panel", "hero", "front", "side", "back", "expressions"):
            path = character_root / f"{view}.png"
            write_image(path, crop(image, character[view]))
            views[view] = str(path.relative_to(output))
        extracted.append(
            {
                "assetId": character["assetId"],
                "displayName": character["displayName"],
                "archetype": character["archetype"],
                "identityMode": "source-sheet-crop",
                "sourcePanel": character["panel"],
                "views": views,
                "recommendedElementReferences": [
                    views["front"],
                    views["side"],
                    views["back"],
                    views["expressions"],
                ],
                "quality": {
                    "front": "REFERENCE_READY",
                    "side": "REFERENCE_READY",
                    "back": "REFERENCE_READY",
                    "expressions": "REFERENCE_READY",
                    "hiddenSurfaces": "UNAVAILABLE",
                },
            }
        )

    make_contact_sheet(extracted, output)
    manifest = {
        "schemaVersion": 1,
        "bundleId": "cement-factory-no2-ip-family-v1",
        "source": {
            "path": str(source),
            "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "width": width,
            "height": height,
            "layout": "four-character-quadrant-sheet",
        },
        "characters": extracted,
        "contactSheet": "tri-view-contact-sheet.jpg",
        "limitations": [
            "The extracted views preserve source pixels and are intended for reference-conditioned generation.",
            "Hidden geometry, clean orthographic projection, and occluded surfaces are not present in the source sheet.",
        ],
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
