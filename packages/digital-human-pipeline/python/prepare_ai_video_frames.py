#!/usr/bin/env python3

import argparse
import json
from pathlib import Path

import cv2
import numpy as np

from render_reference_locked import (
    alpha_composite,
    grade_scene,
    localized_character_motion,
    remove_checkerboard,
    transform_character,
)


def read_source_frame(source: Path, timestamp: float, width: int, height: int):
    capture = cv2.VideoCapture(str(source))
    if not capture.isOpened():
        raise RuntimeError(f"AI_VIDEO_SCENE_UNREADABLE: {source}")
    capture.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000.0)
    ok, frame = capture.read()
    capture.release()
    if not ok:
        raise RuntimeError(f"AI_VIDEO_SCENE_FRAME_UNREADABLE: {timestamp}")
    return grade_scene(cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA))


def read_fixed_scene_frame(source: Path, width: int, height: int):
    frame = cv2.imread(str(source), cv2.IMREAD_COLOR)
    if frame is None:
        raise RuntimeError(f"AI_VIDEO_FIXED_SCENE_UNREADABLE: {source}")
    return cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA)


def harmonize_character(character, frame, left: int, top: int):
    """Match local scene luminance and color without destroying the approved identity."""
    height, width = character.shape[:2]
    frame_height, frame_width = frame.shape[:2]
    x1 = max(0, left)
    y1 = max(0, top)
    x2 = min(frame_width, left + width)
    y2 = min(frame_height, top + height)
    if x1 >= x2 or y1 >= y2:
        return character
    scene_roi = frame[y1:y2, x1:x2]
    crop = character[y1 - top : y2 - top, x1 - left : x2 - left]
    alpha = crop[:, :, 3] > 40
    if not np.any(alpha):
        return character
    scene_lab = cv2.cvtColor(scene_roi, cv2.COLOR_BGR2LAB).astype(np.float32)
    character_lab = cv2.cvtColor(crop[:, :, :3], cv2.COLOR_BGR2LAB).astype(np.float32)
    scene_mean = np.mean(scene_lab.reshape(-1, 3), axis=0)
    character_mean = np.mean(character_lab[alpha], axis=0)
    shift = np.clip(scene_mean - character_mean, [-16, -6, -6], [16, 6, 6])
    character_lab[alpha] = np.clip(character_lab[alpha] + shift * 0.38, 0, 255)
    crop[:, :, :3] = cv2.cvtColor(character_lab.astype(np.uint8), cv2.COLOR_LAB2BGR)
    softened_alpha = cv2.GaussianBlur(crop[:, :, 3], (0, 0), 0.55)
    crop[:, :, 3] = np.minimum(
        crop[:, :, 3].astype(np.int16),
        softened_alpha.astype(np.int16) + 10,
    ).astype(np.uint8)
    return character


def add_contact_shadow(frame, center, character_width: int):
    """Use two local masks: a broad soft shadow and a tight foot contact shadow."""
    shadow_mask = np.zeros(frame.shape[:2], dtype=np.uint8)
    broad_axes = (max(36, int(character_width * 0.34)), max(8, int(character_width * 0.052)))
    tight_axes = (max(24, int(character_width * 0.22)), max(4, int(character_width * 0.022)))
    cv2.ellipse(shadow_mask, center, broad_axes, 0, 0, 360, 150, -1, cv2.LINE_AA)
    cv2.ellipse(shadow_mask, (center[0], center[1] - 2), tight_axes, 0, 0, 360, 235, -1, cv2.LINE_AA)
    shadow_mask = cv2.GaussianBlur(shadow_mask, (0, 0), max(4.0, character_width * 0.028))
    alpha = shadow_mask.astype(np.float32)[:, :, None] / 255.0 * 0.52
    return np.clip(frame.astype(np.float32) * (1.0 - alpha), 0, 255).astype(np.uint8)


def add_ground_occlusion(frame, road_source, left: int, foot_y: int, character_width: int):
    """Blend a narrow strip of local road texture over the feet to avoid sticker edges."""
    frame_height, frame_width = frame.shape[:2]
    x1 = max(0, left + int(character_width * 0.16))
    x2 = min(frame_width, left + int(character_width * 0.84))
    y1 = max(0, foot_y - 3)
    y2 = min(frame_height, foot_y + 5)
    if x1 >= x2 or y1 >= y2:
        return
    strip = road_source[y1:y2, x1:x2].copy()
    mask = np.zeros((y2 - y1, x2 - x1), dtype=np.uint8)
    cv2.ellipse(
        mask,
        ((x2 - x1) // 2, max(1, (y2 - y1) // 2)),
        (max(1, (x2 - x1) // 2), max(1, (y2 - y1) // 2)),
        0,
        0,
        360,
        54,
        -1,
        cv2.LINE_AA,
    )
    alpha = mask.astype(np.float32)[:, :, None] / 255.0
    frame[y1:y2, x1:x2] = (
        strip.astype(np.float32) * alpha + frame[y1:y2, x1:x2].astype(np.float32) * (1.0 - alpha)
    ).astype(np.uint8)


def compose(
    frame,
    cutout,
    width: int,
    height: int,
    motion_time: float,
    left_ratio: float,
    character_height_ratio: float,
    foot_baseline_ratio: float,
):
    character = localized_character_motion(cutout.copy(), motion_time, talking=False)
    character = transform_character(character, int(height * character_height_ratio), motion_time)
    left = int(width * left_ratio - character.shape[1] / 2)
    foot_y = int(height * foot_baseline_ratio)
    visible = cv2.findNonZero((character[:, :, 3] > 16).astype(np.uint8))
    if visible is None:
        raise RuntimeError("AI_VIDEO_CHARACTER_ALPHA_EMPTY")
    visible_points = visible.reshape(-1, 2)
    _, _, _, visible_height = cv2.boundingRect(visible)
    visible_top = int(np.min(visible_points[:, 1]))
    visible_bottom = visible_top + visible_height - 1
    top = int(foot_y - visible_bottom)
    road_source = frame.copy()
    character = harmonize_character(character, frame, left, top)
    center = (int(left + character.shape[1] * 0.5), foot_y + 2)
    frame = add_contact_shadow(frame, center, character.shape[1])
    alpha_composite(frame, character, left, top)
    add_ground_occlusion(frame, road_source, left, foot_y, character.shape[1])
    return frame


def label(frame, text: str):
    canvas = frame.copy()
    cv2.rectangle(canvas, (16, 16), (210, 56), (20, 27, 33), -1)
    cv2.putText(canvas, text, (30, 45), cv2.FONT_HERSHEY_SIMPLEX, 0.72, (245, 245, 242), 2, cv2.LINE_AA)
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    project = Path(args.project).resolve()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    story = json.loads((project / "story.json").read_text())
    scene = json.loads((project / "scene.json").read_text())
    characters = json.loads((project / "characters.json").read_text())
    width = int(story["resolution"]["width"])
    height = int(story["resolution"]["height"])
    duration = float(story["duration"])
    composition = story["shots"][0].get("composition", {})
    character_height_ratio = float(composition.get("characterHeightRatio", 0.50))
    foot_baseline_ratio = float(composition.get("footBaselineRatio", 0.865))
    start_left_ratio = float(composition.get("startLeftRatio", 0.63))
    end_left_ratio = float(composition.get("endLeftRatio", 0.61))
    reconstruction = scene["reconstruction"]
    reference = project / characters[0]["referenceAssets"]["referenceLockedCutout"]
    fixed_start_path = reconstruction.get("fixedStartFrame") or reconstruction.get("fixedSceneFrame")
    fixed_end_path = reconstruction.get("fixedEndFrame") or fixed_start_path
    precomposed_character = bool(reconstruction.get("precomposedCharacter", False))
    if fixed_start_path:
        source = (project / fixed_start_path).resolve()
        end_source = (project / fixed_end_path).resolve()
        source_start = None
        start = read_fixed_scene_frame(source, width, height)
        end = read_fixed_scene_frame(end_source, width, height)
        if not precomposed_character:
            raw = cv2.imread(str(reference), cv2.IMREAD_COLOR)
            if raw is None:
                raise RuntimeError(f"AI_VIDEO_CHARACTER_REFERENCE_UNREADABLE: {reference}")
            cutout = remove_checkerboard(raw)
            start = compose(
                start,
                cutout,
                width,
                height,
                0.18,
                start_left_ratio,
                character_height_ratio,
                foot_baseline_ratio,
            )
            end = compose(
                end,
                cutout,
                width,
                height,
                0.78,
                end_left_ratio,
                character_height_ratio,
                foot_baseline_ratio,
            )
    else:
        source = Path(reconstruction["sourceVideo"]).resolve()
        end_source = None
        source_start = float(reconstruction.get("sourceTimestamp", 0))
        raw = cv2.imread(str(reference), cv2.IMREAD_COLOR)
        if raw is None:
            raise RuntimeError(f"AI_VIDEO_CHARACTER_REFERENCE_UNREADABLE: {reference}")
        cutout = remove_checkerboard(raw)
        start = read_source_frame(source, source_start, width, height)
        end = read_source_frame(source, source_start + duration - 1 / int(story["fps"]), width, height)
        start = compose(
            start,
            cutout,
            width,
            height,
            0.18,
            start_left_ratio,
            character_height_ratio,
            foot_baseline_ratio,
        )
        end = compose(
            end,
            cutout,
            width,
            height,
            0.78,
            end_left_ratio,
            character_height_ratio,
            foot_baseline_ratio,
        )

    start_path = output / "start-frame.png"
    end_path = output / "end-frame.png"
    cv2.imwrite(str(start_path), start)
    cv2.imwrite(str(end_path), end)
    board = cv2.hconcat(
        [
            cv2.resize(label(start, "START FRAME"), (640, 360), interpolation=cv2.INTER_AREA),
            cv2.resize(label(end, "END FRAME"), (640, 360), interpolation=cv2.INTER_AREA),
        ]
    )
    board_path = output / "start-end-frame-board.jpg"
    cv2.imwrite(str(board_path), board)
    report = {
        "schemaVersion": 1,
        "status": "PASS",
        "sourceVideo": str(source),
        "sourceEndFrame": str(end_source) if end_source is not None else None,
        "sourceStart": source_start,
        "sourceEnd": (
            source_start + duration - 1 / int(story["fps"])
            if source_start is not None
            else None
        ),
        "identityReference": str(reference),
        "startFrame": str(start_path),
        "endFrame": str(end_path),
        "board": str(board_path),
        "duration": duration,
        "resolution": {"width": width, "height": height},
        "grounding": {
            "characterHeightRatio": character_height_ratio,
            "footBaselineRatio": foot_baseline_ratio,
            "contactShadow": "dual-local-mask",
            "environmentColorMatch": True,
            "groundOcclusion": True,
            "precomposedCharacter": precomposed_character,
            "backgroundLock": fixed_start_path is not None,
        },
    }
    (output / "frame-preparation-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
