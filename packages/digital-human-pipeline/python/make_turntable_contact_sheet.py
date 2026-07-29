"""Build a compact labeled contact sheet from a rendered turntable."""

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--pattern", default="*.png")
    return parser.parse_args()


def main():
    args = parse_args()
    source_dir = Path(args.input_dir).resolve()
    output_path = Path(args.output).resolve()
    images = sorted(source_dir.glob(args.pattern))
    if not images:
        raise RuntimeError(f"No turntable frames found in {source_dir}")

    tile_width = 420
    tile_height = 460
    header_height = 74
    columns = 4
    rows = (len(images) + columns - 1) // columns
    sheet = Image.new(
        "RGB",
        (tile_width * columns, header_height + tile_height * rows),
        "#11161d",
    )
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=26)
    label_font = ImageFont.load_default(size=20)
    draw.text((24, 22), args.title, fill="#f3f6fa", font=font)

    for index, path in enumerate(images):
        with Image.open(path) as source:
            frame = source.convert("RGB")
            frame.thumbnail((tile_width - 24, tile_height - 54), Image.Resampling.LANCZOS)
            column = index % columns
            row = index // columns
            x = column * tile_width + (tile_width - frame.width) // 2
            y = header_height + row * tile_height + 8
            sheet.paste(frame, (x, y))
            label = path.stem.rsplit("-", 1)[-1] + " degrees"
            draw.text(
                (column * tile_width + 16, header_height + (row + 1) * tile_height - 38),
                label,
                fill="#aab8c8",
                font=label_font,
            )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path, quality=94, subsampling=0)
    print(output_path)


if __name__ == "__main__":
    main()
