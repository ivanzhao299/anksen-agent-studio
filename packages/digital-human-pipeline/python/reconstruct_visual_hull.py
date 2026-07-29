#!/usr/bin/env python3
"""Build and validate a watertight visual hull from normalized turntable masks."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage.measure import marching_cubes


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference-manifest", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--resolution", type=int, default=256)
    parser.add_argument("--minimum-view-votes", type=int, default=7)
    parser.add_argument("--print-height-mm", type=float, default=180.0)
    return parser.parse_args()


def keep_significant_components(volume: np.ndarray, minimum_voxels: int) -> tuple[np.ndarray, list[int]]:
    labels, count = ndimage.label(volume, structure=np.ones((3, 3, 3), dtype=np.uint8))
    if count == 0:
        raise RuntimeError("Visual hull is empty")
    sizes = np.bincount(labels.ravel())
    retained = [index for index in range(1, len(sizes)) if sizes[index] >= minimum_voxels]
    if not retained:
        retained = [int(np.argmax(sizes[1:]) + 1)]
    return np.isin(labels, retained), sorted((int(sizes[index]) for index in retained), reverse=True)


def project_occupancy(
    volume: np.ndarray,
    axes: tuple[np.ndarray, np.ndarray, np.ndarray],
    angle_degrees: int,
    center_x: float,
    ground_y: int,
    canvas_size: tuple[int, int],
) -> np.ndarray:
    z_axis, y_axis, x_axis = axes
    indices = np.argwhere(volume)
    z = z_axis[indices[:, 0]]
    y = y_axis[indices[:, 1]]
    x = x_axis[indices[:, 2]]
    theta = math.radians(angle_degrees)
    u = np.rint(center_x + x * math.cos(theta) - y * math.sin(theta)).astype(np.int32)
    v = np.rint(ground_y - z).astype(np.int32)
    width, height = canvas_size
    valid = (u >= 0) & (u < width) & (v >= 0) & (v < height)
    projection = np.zeros((height, width), dtype=bool)
    projection[v[valid], u[valid]] = True
    # Occupied voxels are several source pixels apart. Rasterize their projected
    # footprint before measuring the silhouette instead of comparing sparse points.
    pixel_step = max(
        float(abs(x_axis[1] - x_axis[0])),
        float(abs(z_axis[1] - z_axis[0])),
    )
    projection = ndimage.binary_dilation(
        projection,
        iterations=max(1, int(math.ceil(pixel_step / 2.0))),
    )
    projection = ndimage.binary_closing(projection, iterations=2)
    projection = ndimage.binary_fill_holes(projection)
    return projection


def save_overlay(target: np.ndarray, predicted: np.ndarray, destination: Path) -> None:
    height, width = target.shape
    canvas = np.zeros((height, width, 3), dtype=np.uint8)
    canvas[target & ~predicted] = (55, 205, 105)
    canvas[predicted & ~target] = (236, 72, 153)
    canvas[target & predicted] = (238, 241, 244)
    Image.fromarray(canvas).save(destination)


def make_overlay_contact_sheet(overlays: list[dict], destination: Path) -> None:
    thumb = (303, 324)
    header = 34
    sheet = Image.new("RGB", (thumb[0] * 4, (thumb[1] + header) * 2), (20, 24, 31))
    draw = ImageDraw.Draw(sheet)
    for index, overlay in enumerate(overlays):
        row, column = divmod(index, 4)
        image = Image.open(overlay["overlayPath"]).convert("RGB")
        image.thumbnail(thumb, Image.Resampling.LANCZOS)
        x = column * thumb[0] + (thumb[0] - image.width) // 2
        y = row * (thumb[1] + header) + header
        sheet.paste(image, (x, y))
        draw.text(
            (column * thumb[0] + 8, row * (thumb[1] + header) + 8),
            f'{overlay["angle"]:03d} deg IoU {overlay["silhouetteIoU"]:.3f}',
            fill="white",
        )
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination)


def main() -> None:
    args = parse_args()
    reference = json.loads(args.reference_manifest.read_text(encoding="utf-8"))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    overlay_dir = args.output_dir / "reprojection"
    overlay_dir.mkdir(parents=True, exist_ok=True)

    canvas_width, canvas_height = reference["canvas"]
    master = reference["views"][0]
    master_bbox = master["normalizedForegroundBox"]
    center_x = (master_bbox[0] + master_bbox[2]) / 2.0
    ground_y = int(master["groundLineY"])
    character_height_px = ground_y - master_bbox[1]

    extent_xy = max(canvas_width * 0.48, (master_bbox[2] - master_bbox[0]) * 0.62)
    z_max = character_height_px * 1.02
    resolution = args.resolution
    x_axis = np.linspace(-extent_xy, extent_xy, resolution, dtype=np.float32)
    y_axis = np.linspace(-extent_xy, extent_xy, resolution, dtype=np.float32)
    z_axis = np.linspace(0.0, z_max, resolution, dtype=np.float32)
    xx, yy = np.meshgrid(x_axis, y_axis, indexing="xy")

    masks: list[tuple[dict, np.ndarray]] = []
    for view in reference["views"]:
        mask = np.asarray(Image.open(view["maskPath"]).convert("L")) >= 24
        masks.append((view, mask))

    volume = np.zeros((resolution, resolution, resolution), dtype=bool)
    for z_index, z_value in enumerate(z_axis):
        v = int(round(ground_y - float(z_value)))
        if v < 0 or v >= canvas_height:
            continue
        votes = np.zeros((resolution, resolution), dtype=np.uint8)
        for view, mask in masks:
            theta = math.radians(view["angle"])
            u = np.rint(center_x + xx * math.cos(theta) - yy * math.sin(theta)).astype(np.int32)
            valid = (u >= 0) & (u < canvas_width)
            sampled = np.zeros_like(valid)
            sampled[valid] = mask[v, u[valid]]
            votes += sampled
        volume[z_index] = votes >= args.minimum_view_votes

    volume = ndimage.binary_closing(volume, structure=np.ones((3, 3, 3), dtype=bool), iterations=1)
    volume = ndimage.binary_fill_holes(volume)
    minimum_component = max(32, int(volume.size * 0.000002))
    volume, component_sizes = keep_significant_components(volume, minimum_component)

    spacing = (
        float(z_axis[1] - z_axis[0]),
        float(y_axis[1] - y_axis[0]),
        float(x_axis[1] - x_axis[0]),
    )
    vertices_zyx, faces, _, _ = marching_cubes(volume.astype(np.float32), level=0.5, spacing=spacing)
    vertices = np.column_stack(
        (
            x_axis[0] + vertices_zyx[:, 2],
            y_axis[0] + vertices_zyx[:, 1],
            z_axis[0] + vertices_zyx[:, 0],
        )
    )
    scale_mm = args.print_height_mm / max(vertices[:, 2].max() - vertices[:, 2].min(), 1e-6)
    vertices *= scale_mm
    vertices[:, 2] -= vertices[:, 2].min()
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=True)
    trimesh.smoothing.filter_taubin(mesh, lamb=0.45, nu=0.46, iterations=12)
    mesh.remove_unreferenced_vertices()
    mesh.visual.face_colors = [154, 158, 163, 255]

    stl_path = (args.output_dir / "huihui-v3-visual-hull.stl").resolve()
    glb_path = (args.output_dir / "huihui-v3-visual-hull.glb").resolve()
    mesh.export(stl_path)
    mesh.export(glb_path)

    overlays: list[dict] = []
    for view, target in masks:
        predicted = project_occupancy(
            volume,
            (z_axis, y_axis, x_axis),
            view["angle"],
            center_x,
            ground_y,
            (canvas_width, canvas_height),
        )
        intersection = int(np.logical_and(target, predicted).sum())
        union = int(np.logical_or(target, predicted).sum())
        iou = intersection / union if union else 0.0
        overlay_path = (overlay_dir / f'huihui-angle-{view["angle"]:03d}-{view["view"]}-overlay.png').resolve()
        save_overlay(target, predicted, overlay_path)
        overlays.append(
            {
                "angle": view["angle"],
                "view": view["view"],
                "silhouetteIoU": round(iou, 6),
                "overlayPath": str(overlay_path),
            }
        )

    overlay_sheet = (args.output_dir / "huihui-v3-reprojection-contact-sheet.png").resolve()
    make_overlay_contact_sheet(overlays, overlay_sheet)
    bounds = mesh.bounds
    report = {
        "schemaVersion": 1,
        "status": "GEOMETRY_CANDIDATE",
        "method": "eight-view vote-tolerant orthographic visual hull",
        "resolution": resolution,
        "minimumViewVotes": args.minimum_view_votes,
        "retainedComponentVoxelCounts": component_sizes,
        "mesh": {
            "vertices": int(len(mesh.vertices)),
            "faces": int(len(mesh.faces)),
            "watertight": bool(mesh.is_watertight),
            "windingConsistent": bool(mesh.is_winding_consistent),
            "dimensionsMm": [round(float(value), 4) for value in (bounds[1] - bounds[0])],
            "stlPath": str(stl_path),
            "glbPath": str(glb_path),
        },
        "reprojection": overlays,
        "meanSilhouetteIoU": round(float(np.mean([entry["silhouetteIoU"] for entry in overlays])), 6),
        "depthFusionStatus": "PENDING_SURFACE_FIT",
        "materialStatus": "BLOCKED_UNTIL_GEOMETRY_APPROVAL",
    }
    report_path = args.output_dir / "visual-hull-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
