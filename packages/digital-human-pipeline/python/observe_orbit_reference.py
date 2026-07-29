#!/usr/bin/env python3
"""Measure pseudo-multiview silhouettes and continuous-frame feature tracks."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


SUPPORT_LEVELS = (0.04, 0.10, 0.18, 0.28, 0.40, 0.52, 0.64, 0.78, 0.92)
SECTION_RANGES = {
    "helmet": (0.02, 0.24),
    "upperBody": (0.25, 0.48),
    "torso": (0.38, 0.72),
    "lowerBody": (0.62, 0.82),
    "boots": (0.82, 0.99),
}
PART_COLORS = {
    "helmet": (0, 190, 255),
    "face": (255, 120, 50),
    "body": (60, 220, 80),
    "boots": (210, 80, 220),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--manifest", type=Path)
    source.add_argument("--frames-manifest", type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args()


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def foreground_mask_from_image(path: Path) -> np.ndarray:
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(path)
    height, width = image.shape[:2]
    border = np.concatenate(
        [
            image[: max(2, height // 30), :, :].reshape(-1, 3),
            image[-max(2, height // 30) :, :, :].reshape(-1, 3),
            image[:, : max(2, width // 30), :].reshape(-1, 3),
            image[:, -max(2, width // 30) :, :].reshape(-1, 3),
        ]
    )
    background = np.median(border.astype(np.float32), axis=0)
    distance = np.linalg.norm(image.astype(np.float32) - background, axis=2)
    mask = (distance > 22).astype(np.uint8) * 255
    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    if count <= 1:
        return mask
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return np.where(labels == largest, 255, 0).astype(np.uint8)


def load_mask(entry: dict) -> np.ndarray:
    path = entry.get("maskPath")
    if path and Path(path).exists():
        mask = np.asarray(Image.open(path).convert("L"))
        return np.where(mask > 24, 255, 0).astype(np.uint8)
    return foreground_mask_from_image(Path(entry["framePath"]))


def bounds(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.nonzero(mask > 0)
    if not len(xs):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)


def normalize_point(
    point: tuple[float, float], box: tuple[int, int, int, int]
) -> list[float]:
    x0, y0, x1, y1 = box
    return [
        round((float(point[0]) - x0) / max(1, x1 - x0), 6),
        round((float(point[1]) - y0) / max(1, y1 - y0), 6),
    ]


def measured_extrema(
    mask: np.ndarray, box: tuple[int, int, int, int]
) -> dict[str, list[float]]:
    ys, xs = np.nonzero(mask > 0)
    extrema = {}
    selectors = {
        "top": ys == ys.min(),
        "bottom": ys == ys.max(),
        "left": xs == xs.min(),
        "right": xs == xs.max(),
    }
    for name, selected in selectors.items():
        extrema[name] = normalize_point(
            (float(xs[selected].mean()), float(ys[selected].mean())), box
        )
    extrema["centroid"] = normalize_point(
        (float(xs.mean()), float(ys.mean())), box
    )
    return extrema


def contour_landmarks(
    mask: np.ndarray, box: tuple[int, int, int, int]
) -> dict:
    contours, _ = cv2.findContours(
        mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE
    )
    if not contours:
        return {"count": 0, "points": []}
    contour = max(contours, key=cv2.contourArea)
    perimeter = cv2.arcLength(contour, True)
    simplified = cv2.approxPolyDP(contour, max(1.0, perimeter * 0.006), True)
    points = [
        {
            "pixel": [int(point[0][0]), int(point[0][1])],
            "normalizedCharacterXY": normalize_point(
                (point[0][0], point[0][1]), box
            ),
        }
        for point in simplified[:128]
    ]
    return {
        "method": "EXTERNAL_CONTOUR_DOUGLAS_PEUCKER",
        "epsilonPerimeterRatio": 0.006,
        "count": len(points),
        "points": points,
    }


def support_at(mask: np.ndarray, box: tuple[int, int, int, int], level: float) -> dict:
    x0, y0, x1, y1 = box
    y = min(y1 - 1, max(y0, round(y0 + level * (y1 - y0 - 1))))
    xs = np.nonzero(mask[y] > 0)[0]
    if not len(xs):
        return {"level": level, "left": None, "right": None, "width": 0.0}
    width = max(1, x1 - x0)
    left = float((xs.min() - x0) / width)
    right = float((xs.max() - x0) / width)
    return {
        "level": level,
        "left": round(left, 6),
        "right": round(right, 6),
        "width": round(right - left, 6),
    }


def section_width(mask: np.ndarray, box: tuple[int, int, int, int], band: tuple[float, float]) -> float:
    x0, y0, x1, y1 = box
    start = round(y0 + band[0] * (y1 - y0))
    end = round(y0 + band[1] * (y1 - y0))
    widths = []
    for y in range(max(y0, start), min(y1, end)):
        xs = np.nonzero(mask[y] > 0)[0]
        if len(xs):
            widths.append((xs.max() - xs.min() + 1) / max(1, x1 - x0))
    return round(float(np.median(widths)) if widths else 0.0, 6)


def largest_component(mask: np.ndarray, minimum_area: int = 30) -> np.ndarray:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if count <= 1:
        return np.zeros_like(mask, dtype=np.uint8)
    candidates = [
        (index, int(stats[index, cv2.CC_STAT_AREA]))
        for index in range(1, count)
        if int(stats[index, cv2.CC_STAT_AREA]) >= minimum_area
    ]
    if not candidates:
        return np.zeros_like(mask, dtype=np.uint8)
    selected = max(candidates, key=lambda item: item[1])[0]
    return np.where(labels == selected, 255, 0).astype(np.uint8)


def semantic_part_observations(image_path: Path, mask: np.ndarray, box: tuple[int, int, int, int]) -> dict:
    image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if image is None:
        return {}
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    x0, y0, x1, y1 = box
    width = max(1, x1 - x0)
    height = max(1, y1 - y0)
    yy, xx = np.indices(mask.shape)
    nx = (xx - x0) / width
    ny = (yy - y0) / height
    foreground = mask > 0
    yellow = (
        foreground
        & (hsv[:, :, 0] >= 8)
        & (hsv[:, :, 0] <= 42)
        & (hsv[:, :, 1] >= 70)
        & (hsv[:, :, 2] >= 55)
    )
    low_saturation = foreground & (hsv[:, :, 1] <= 105) & (hsv[:, :, 2] >= 35)
    dark = foreground & (hsv[:, :, 2] <= 105)
    candidates = {
        "helmet": yellow & (ny >= -0.03) & (ny <= 0.30),
        "face": dark & (nx >= 0.14) & (nx <= 0.86) & (ny >= 0.12) & (ny <= 0.52),
        "body": low_saturation & (nx >= 0.12) & (nx <= 0.88) & (ny >= 0.22) & (ny <= 0.78),
        "boots": yellow & (ny >= 0.73) & (ny <= 1.02),
    }
    result = {}
    for name, candidate in candidates.items():
        component = largest_component(candidate.astype(np.uint8) * 255)
        part_box = bounds(component)
        if part_box is None:
            result[name] = {
                "status": "NOT_OBSERVED",
                "confidence": 0.0,
                "segmentationMethod": "COLOR_SPATIAL_PRIOR_V1",
            }
            continue
        px0, py0, px1, py1 = part_box
        area = int(np.count_nonzero(component))
        box_area = max(1, (px1 - px0) * (py1 - py0))
        fill = area / box_area
        area_ratio = area / max(1, np.count_nonzero(mask))
        confidence = min(0.85, max(0.0, fill * 0.55 + min(1.0, area_ratio * 6) * 0.45))
        result[name] = {
            "status": "OBSERVED" if confidence >= 0.45 else "LOW_CONFIDENCE",
            "confidence": round(float(confidence), 6),
            "segmentationMethod": "COLOR_SPATIAL_PRIOR_V1",
            "boundingBox": [px0, py0, px1, py1],
            "center": [
                round(((px0 + px1) / 2 - x0) / width, 6),
                round(((py0 + py1) / 2 - y0) / height, 6),
            ],
            "widthRatio": round((px1 - px0) / width, 6),
            "heightRatio": round((py1 - py0) / height, 6),
            "widthToCharacterHeight": round((px1 - px0) / height, 6),
            "heightToCharacterHeight": round((py1 - py0) / height, 6),
            "areaRatio": round(area_ratio, 6),
            "fillRatio": round(fill, 6),
            "extremaNormalizedToCharacter": measured_extrema(component, box),
            "contourLandmarks": contour_landmarks(component, box),
        }
    return result


def observe(entry: dict, mask: np.ndarray, config: dict, front_height: int) -> dict:
    box = bounds(mask)
    if box is None:
        return {
            "angle": entry["angle"],
            "accepted": False,
            "confidence": 0.0,
            "rejectionReasons": ["EMPTY_FOREGROUND"],
        }
    x0, y0, x1, y1 = box
    height, width = mask.shape
    foreground_ratio = float(np.count_nonzero(mask) / mask.size)
    box_height = y1 - y0
    height_drift = abs(box_height - front_height) / max(1, front_height)
    acceptance = config["frameAcceptance"]
    reasons = []
    if foreground_ratio < acceptance["minimumForegroundRatio"]:
        reasons.append("FOREGROUND_TOO_SMALL")
    if foreground_ratio > acceptance["maximumForegroundRatio"]:
        reasons.append("FOREGROUND_TOO_LARGE")
    if height_drift > acceptance["maximumHeightDriftRatio"]:
        reasons.append("HEIGHT_DRIFT_EXCEEDED")
    contour_count, _, _, _ = cv2.connectedComponentsWithStats(mask, 8)
    if contour_count > 12:
        reasons.append("FOREGROUND_FRAGMENTED")
    confidence = max(
        0.0,
        min(
            1.0,
            1.0
            - height_drift * 2.5
            - max(0.0, acceptance["minimumForegroundRatio"] - foreground_ratio) * 3.0,
        ),
    )
    authority = entry.get("authority", "ai-orbit-frame")
    if authority == "identity-and-proportion-master":
        confidence = 1.0
        reasons = []
    else:
        confidence = min(confidence, float(config["fitting"]["generatedFrameWeight"]))
    image_path = Path(entry.get("normalizedPath") or entry.get("framePath"))
    return {
        "angle": int(entry["angle"]),
        "view": entry.get("view", f"orbit-{int(entry['angle']):03d}"),
        "framePath": entry.get("normalizedPath") or entry.get("framePath"),
        "maskPath": entry.get("maskPath"),
        "authority": authority,
        "accepted": not reasons,
        "confidence": round(confidence, 6),
        "rejectionReasons": reasons,
        "canvas": [width, height],
        "foregroundRatio": round(foreground_ratio, 6),
        "heightDriftRatio": round(height_drift, 6),
        "boundingBox": [x0, y0, x1, y1],
        "normalizedExtrema": measured_extrema(mask, box),
        "contourLandmarks": contour_landmarks(mask, box),
        "supportProfile": [support_at(mask, box, level) for level in SUPPORT_LEVELS],
        "sectionWidths": {
            name: section_width(mask, box, band) for name, band in SECTION_RANGES.items()
        },
        "semanticParts": semantic_part_observations(image_path, mask, box),
    }


def track_features(entries: list[dict], masks: list[np.ndarray]) -> dict:
    if len(entries) < 2:
        return {"mode": "NOT_AVAILABLE", "tracks": [], "frameFeatureCounts": []}
    images = [
        cv2.imread(str(Path(item.get("normalizedPath") or item.get("framePath"))), cv2.IMREAD_GRAYSCALE)
        for item in entries
    ]
    if any(image is None for image in images):
        return {"mode": "NOT_AVAILABLE", "tracks": [], "frameFeatureCounts": []}
    tracks: dict[int, list[dict]] = {}
    next_id = 0
    points = cv2.goodFeaturesToTrack(
        images[0], maxCorners=240, qualityLevel=0.012, minDistance=9, mask=masks[0]
    )
    active: dict[int, np.ndarray] = {}
    if points is not None:
        for point in points.reshape(-1, 2):
            active[next_id] = point
            tracks[next_id] = [{
                "frame": 0,
                "angle": entries[0]["angle"],
                "xy": point.tolist(),
                "normalizedCharacterXY": normalize_point(
                    (point[0], point[1]), bounds(masks[0])
                ),
            }]
            next_id += 1
    counts = [len(active)]
    for index in range(1, len(images)):
        if active:
            ids = list(active)
            previous = np.float32([active[item] for item in ids]).reshape(-1, 1, 2)
            current, status, error = cv2.calcOpticalFlowPyrLK(
                images[index - 1],
                images[index],
                previous,
                None,
                winSize=(31, 31),
                maxLevel=4,
                criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 40, 0.01),
            )
            replacement: dict[int, np.ndarray] = {}
            for item_id, point, valid, residual in zip(ids, current, status, error):
                x, y = point.reshape(2)
                in_bounds = 0 <= x < masks[index].shape[1] and 0 <= y < masks[index].shape[0]
                in_mask = in_bounds and masks[index][round(y), round(x)] > 0
                if valid[0] and in_mask and residual[0] < 30:
                    replacement[item_id] = np.array([x, y], dtype=np.float32)
                    tracks[item_id].append(
                        {
                            "frame": index,
                            "angle": entries[index]["angle"],
                            "xy": [round(float(x), 3), round(float(y), 3)],
                            "normalizedCharacterXY": normalize_point(
                                (x, y), bounds(masks[index])
                            ),
                            "residual": round(float(residual[0]), 4),
                        }
                    )
            active = replacement
        if index % 2 == 0:
            occupied = np.zeros_like(masks[index])
            for point in active.values():
                cv2.circle(occupied, tuple(np.round(point).astype(int)), 14, 255, -1)
            spawn_mask = cv2.bitwise_and(masks[index], cv2.bitwise_not(occupied))
            spawned = cv2.goodFeaturesToTrack(
                images[index], maxCorners=max(0, 240 - len(active)), qualityLevel=0.012, minDistance=9, mask=spawn_mask
            )
            if spawned is not None:
                for point in spawned.reshape(-1, 2):
                    active[next_id] = point
                    tracks[next_id] = [{
                        "frame": index,
                        "angle": entries[index]["angle"],
                        "xy": point.tolist(),
                        "normalizedCharacterXY": normalize_point(
                            (point[0], point[1]), bounds(masks[index])
                        ),
                    }]
                    next_id += 1
        counts.append(len(active))
    durable = [
        {"trackId": item_id, "observations": observations}
        for item_id, observations in tracks.items()
        if len(observations) >= 3
    ]
    return {
        "mode": "LUCAS_KANADE_CONTINUOUS_FRAME_TRACKING",
        "tracks": durable,
        "frameFeatureCounts": counts,
        "durableTrackCount": len(durable),
    }


def write_diagnostic_contact_sheet(frames: list[dict], output_path: Path) -> Path:
    tiles = []
    tile_width = 520
    tile_height = 520
    for frame in frames:
        source = cv2.imread(str(Path(frame["framePath"])), cv2.IMREAD_COLOR)
        if source is None:
            continue
        canvas = source.copy()
        for part, observation in frame.get("semanticParts", {}).items():
            box = observation.get("boundingBox")
            if not box:
                continue
            color = PART_COLORS.get(part, (255, 255, 255))
            x0, y0, x1, y1 = [int(value) for value in box]
            cv2.rectangle(canvas, (x0, y0), (x1, y1), color, 5)
            label = f"{part} {float(observation.get('confidence', 0)):.2f}"
            cv2.putText(
                canvas,
                label,
                (x0, max(28, y0 - 12)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.85,
                color,
                2,
                cv2.LINE_AA,
            )
        height, width = canvas.shape[:2]
        scale = min(tile_width / width, (tile_height - 54) / height)
        resized = cv2.resize(
            canvas,
            (max(1, round(width * scale)), max(1, round(height * scale))),
            interpolation=cv2.INTER_AREA,
        )
        tile = np.full((tile_height, tile_width, 3), 20, dtype=np.uint8)
        x = (tile_width - resized.shape[1]) // 2
        y = 46 + (tile_height - 46 - resized.shape[0]) // 2
        tile[y : y + resized.shape[0], x : x + resized.shape[1]] = resized
        title = (
            f"{int(frame['angle']):03d} deg | "
            f"{'PASS' if frame.get('accepted') else 'REJECT'} | "
            f"confidence {float(frame.get('confidence', 0)):.2f}"
        )
        cv2.putText(
            tile,
            title,
            (16, 32),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.72,
            (235, 235, 235),
            2,
            cv2.LINE_AA,
        )
        tiles.append(tile)
    if not tiles:
        return output_path
    columns = 4
    rows = (len(tiles) + columns - 1) // columns
    blank = np.full((tile_height, tile_width, 3), 20, dtype=np.uint8)
    padded = tiles + [blank] * (rows * columns - len(tiles))
    contact_sheet = np.vstack(
        [np.hstack(padded[row * columns : (row + 1) * columns]) for row in range(rows)]
    )
    cv2.imwrite(str(output_path), contact_sheet, [cv2.IMWRITE_JPEG_QUALITY, 94])
    return output_path


def main() -> None:
    args = parse_args()
    config = load_json(args.config)
    if args.manifest:
        manifest = load_json(args.manifest)
        entries = manifest["views"]
        source_mode = "SPARSE_MULTIVIEW_FIXTURE"
    else:
        manifest = load_json(args.frames_manifest)
        entries = manifest["frames"]
        source_mode = "CONTINUOUS_AI_ORBIT_VIDEO"
    masks = [load_mask(entry) for entry in entries]
    front_index = min(range(len(entries)), key=lambda index: abs(int(entries[index]["angle"])))
    front_box = bounds(masks[front_index])
    if front_box is None:
        raise RuntimeError("Authoritative front mask is empty")
    front_height = front_box[3] - front_box[1]
    observations = [
        observe(entry, mask, config, front_height) for entry, mask in zip(entries, masks)
    ]
    tracking = (
        track_features(entries, masks)
        if source_mode == "CONTINUOUS_AI_ORBIT_VIDEO"
        else {
            "mode": "DISABLED_FOR_SPARSE_NON_CONTIGUOUS_VIEWS",
            "tracks": [],
            "frameFeatureCounts": [],
            "durableTrackCount": 0,
        }
    )
    accepted = [item for item in observations if item["accepted"]]
    report = {
        "schemaVersion": 1,
        "domain": "3D_MODELING",
        "check": "AI_ORBIT_FRAME_OBSERVATION",
        "status": (
            "PASS_WITH_CONDITIONS"
            if source_mode == "SPARSE_MULTIVIEW_FIXTURE" and len(accepted) >= 6
            else "PASS"
            if len(accepted) >= 8 and tracking["durableTrackCount"] >= 24
            else "HOLD"
        ),
        "assetId": config["assetId"],
        "sourceMode": source_mode,
        "generatedViewsAreMetric": False,
        "authority": {
            "front": "IDENTITY_AND_FRONTAL_PROPORTION_MASTER",
            "generatedFrames": "NON_METRIC_CONFIDENCE_WEIGHTED_OBSERVATIONS",
        },
        "coordinateSystem": {
            "type": "PER_FRAME_CHARACTER_NORMALIZED_IMAGE_PLANE",
            "origin": "foreground bounding-box top-left",
            "xAxis": "image-right",
            "yAxis": "image-down",
            "range": [0, 1],
            "angleAxis": "configured clockwise orbit angle in degrees",
            "metricScaleAvailable": False,
            "correspondenceSources": [
                "measured silhouette extrema",
                "simplified external contour landmarks",
                "continuous-frame Lucas-Kanade feature tracks when available",
                "semantic-part extrema normalized to the character frame",
            ],
        },
        "summary": {
            "frames": len(observations),
            "accepted": len(accepted),
            "rejected": len(observations) - len(accepted),
            "acceptedAngles": [item["angle"] for item in accepted],
            "angleCoverageDegrees": len({item["angle"] for item in accepted}) * 360 / max(1, len(observations)),
        },
        "frames": observations,
        "featureTracking": tracking,
        "materialTracking": {
            "status": "DEFERRED_UNTIL_GEOMETRY_LOCK",
            "reason": "Color and local material details must not compensate for incorrect geometry.",
        },
        "semanticPartTracking": {
            "status": "COLOR_SPATIAL_PRIOR_BASELINE",
            "requiredParts": ["body", "helmet", "face", "arms", "hands", "legs", "boots"],
            "observedParts": ["body", "helmet", "face", "boots"],
            "pendingParts": ["arms", "hands", "legs"],
            "reason": "Color/spatial priors isolate coarse parts; learned or owner-reviewed masks remain required for joints.",
        },
        "limitations": [
            "AI-generated orbit frames are not calibrated metric photographs.",
            "Silhouette and optical-flow observations cannot independently prove hidden topology.",
            "Branding and semantic-part identity require owner review.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    diagnostic_path = args.output.with_name("orbit-observation-contact-sheet.jpg")
    write_diagnostic_contact_sheet(observations, diagnostic_path)
    report["diagnosticContactSheet"] = str(diagnostic_path.resolve())
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "output": str(args.output), **report["summary"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
