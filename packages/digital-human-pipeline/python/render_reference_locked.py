#!/usr/bin/env python3

import argparse
import json
import math
import subprocess
from pathlib import Path

import cv2
import numpy as np


def ease(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def remove_checkerboard(image: np.ndarray) -> np.ndarray:
    """Remove only bright neutral pixels connected to the canvas boundary."""
    bgr = image[:, :, :3]
    channel_range = bgr.max(axis=2) - bgr.min(axis=2)
    bright_neutral = ((bgr.min(axis=2) > 205) & (channel_range < 18)).astype(np.uint8)
    count, labels = cv2.connectedComponents(bright_neutral, connectivity=8)
    border_labels = set(labels[0, :]) | set(labels[-1, :]) | set(labels[:, 0]) | set(labels[:, -1])
    background = np.zeros(labels.shape, dtype=np.uint8)
    for label in border_labels:
        if 0 < label < count:
            background[labels == label] = 255
    alpha = 255 - background
    alpha = cv2.GaussianBlur(alpha, (0, 0), 0.65)
    rgba = cv2.cvtColor(bgr, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = alpha
    points = cv2.findNonZero((alpha > 8).astype(np.uint8))
    if points is None:
        raise RuntimeError("REFERENCE_LOCK_ALPHA_EMPTY")
    x, y, width, height = cv2.boundingRect(points)
    margin = 12
    x = max(0, x - margin)
    y = max(0, y - margin)
    width = min(rgba.shape[1] - x, width + margin * 2)
    height = min(rgba.shape[0] - y, height + margin * 2)
    return rgba[y : y + height, x : x + width]


def localized_character_motion(rgba: np.ndarray, time_seconds: float, talking: bool) -> np.ndarray:
    height, width = rgba.shape[:2]
    grid_x, grid_y = np.meshgrid(np.arange(width, dtype=np.float32), np.arange(height, dtype=np.float32))

    arm_center_x = width * 0.82
    arm_center_y = height * 0.34
    arm_sigma_x = width * 0.16
    arm_sigma_y = height * 0.24
    arm_weight = np.exp(
        -(
            ((grid_x - arm_center_x) ** 2) / (2 * arm_sigma_x**2)
            + ((grid_y - arm_center_y) ** 2) / (2 * arm_sigma_y**2)
        )
    )
    arm_phase = math.sin(time_seconds * math.tau * 1.25)
    map_x = grid_x - arm_weight * arm_phase * 7.0
    map_y = grid_y - arm_weight * arm_phase * 12.0
    moved = cv2.remap(rgba, map_x, map_y, cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT)

    face_left = int(width * 0.34)
    face_right = int(width * 0.72)
    face_top = int(height * 0.23)
    face_bottom = int(height * 0.47)
    face = moved[face_top:face_bottom, face_left:face_right]
    if face.size:
        blink_phase = time_seconds % 2.15
        blink = blink_phase < 0.10 or 0.18 < blink_phase < 0.25
        eye_y = int(face.shape[0] * 0.42)
        eye_height = max(3, int(face.shape[0] * 0.10))
        for eye_x in (int(face.shape[1] * 0.31), int(face.shape[1] * 0.72)):
            if blink:
                cv2.ellipse(face, (eye_x, eye_y), (int(face.shape[1] * 0.055), eye_height), 0, 0, 360, (12, 14, 15, 255), -1)
                cv2.line(
                    face,
                    (eye_x - int(face.shape[1] * 0.04), eye_y),
                    (eye_x + int(face.shape[1] * 0.04), eye_y),
                    (242, 242, 238, 255),
                    max(2, int(face.shape[0] * 0.015)),
                    cv2.LINE_AA,
                )

        if talking:
            mouth_x = int(face.shape[1] * 0.51)
            mouth_y = int(face.shape[0] * 0.68)
            mouth_open = 0.5 + 0.5 * math.sin(time_seconds * math.tau * 4.2)
            cv2.ellipse(
                face,
                (mouth_x, mouth_y),
                (int(face.shape[1] * 0.07), max(3, int(face.shape[0] * (0.018 + mouth_open * 0.045)))),
                0,
                0,
                360,
                (10, 12, 13, 255),
                -1,
                cv2.LINE_AA,
            )
            cv2.ellipse(
                face,
                (mouth_x, mouth_y),
                (int(face.shape[1] * 0.055), max(2, int(face.shape[0] * (0.010 + mouth_open * 0.026)))),
                0,
                0,
                360,
                (240, 242, 238, 255),
                -1,
                cv2.LINE_AA,
            )
    return moved


def transform_character(rgba: np.ndarray, target_height: int, time_seconds: float) -> np.ndarray:
    scale = target_height / rgba.shape[0]
    resized = cv2.resize(rgba, None, fx=scale, fy=scale, interpolation=cv2.INTER_LANCZOS4)
    angle = math.sin(time_seconds * math.tau * 0.42) * 0.8
    breath = 1.0 + math.sin(time_seconds * math.tau * 0.75) * 0.006
    center = (resized.shape[1] / 2, resized.shape[0] * 0.64)
    matrix = cv2.getRotationMatrix2D(center, angle, breath)
    return cv2.warpAffine(
        resized,
        matrix,
        (resized.shape[1], resized.shape[0]),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
    )


def grade_scene(frame: np.ndarray) -> np.ndarray:
    softened = cv2.edgePreservingFilter(frame, flags=1, sigma_s=38, sigma_r=0.18)
    mixed = cv2.addWeighted(frame, 0.74, softened, 0.26, 0)
    lab = cv2.cvtColor(mixed, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    l_channel = cv2.createCLAHE(clipLimit=1.45, tileGridSize=(8, 8)).apply(l_channel)
    return cv2.cvtColor(cv2.merge((l_channel, a_channel, b_channel)), cv2.COLOR_LAB2BGR)


def alpha_composite(canvas: np.ndarray, foreground: np.ndarray, left: int, top: int) -> None:
    frame_height, frame_width = canvas.shape[:2]
    fg_height, fg_width = foreground.shape[:2]
    x1 = max(0, left)
    y1 = max(0, top)
    x2 = min(frame_width, left + fg_width)
    y2 = min(frame_height, top + fg_height)
    if x1 >= x2 or y1 >= y2:
        return
    crop = foreground[y1 - top : y2 - top, x1 - left : x2 - left]
    alpha = crop[:, :, 3:4].astype(np.float32) / 255.0
    canvas[y1:y2, x1:x2] = (
        crop[:, :, :3].astype(np.float32) * alpha + canvas[y1:y2, x1:x2].astype(np.float32) * (1.0 - alpha)
    ).astype(np.uint8)


def write_contact_sheet(frames: list[np.ndarray], output: Path) -> None:
    thumbs = [cv2.resize(frame, (384, 216), interpolation=cv2.INTER_AREA) for frame in frames]
    sheet = np.hstack(thumbs)
    cv2.imwrite(str(output), sheet)


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

    fps = int(story["fps"])
    duration = float(story["duration"])
    width = int(story["resolution"]["width"])
    height = int(story["resolution"]["height"])
    reconstruction = scene["reconstruction"]
    source_video = Path(reconstruction["sourceVideo"]).resolve()
    source_start = float(reconstruction.get("sourceTimestamp", 0))
    reference_asset = project / characters[0]["referenceAssets"]["referenceLockedCutout"]

    raw_asset = cv2.imread(str(reference_asset), cv2.IMREAD_COLOR)
    if raw_asset is None:
        raise RuntimeError(f"REFERENCE_LOCK_ASSET_UNREADABLE: {reference_asset}")
    cutout = remove_checkerboard(raw_asset)
    cv2.imwrite(str(output / "huihui-reference-locked-cutout.png"), cutout)

    capture = cv2.VideoCapture(str(source_video))
    if not capture.isOpened():
        raise RuntimeError(f"SCENE_VIDEO_UNREADABLE: {source_video}")
    source_fps = capture.get(cv2.CAP_PROP_FPS) or fps
    temp_video = output / "reference-locked-visual.mp4"
    writer = cv2.VideoWriter(str(temp_video), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
    if not writer.isOpened():
        raise RuntimeError("REFERENCE_LOCK_VIDEO_WRITER_FAILED")

    dialogue = story.get("dialogue", [{}])[0]
    talk_start = float(dialogue.get("start", 0))
    talk_end = min(duration, talk_start + 3.25)
    samples = []
    sample_indices = {0, int(fps * duration * 0.45), int(fps * duration) - 1}
    for frame_index in range(int(round(duration * fps))):
        time_seconds = frame_index / fps
        capture.set(cv2.CAP_PROP_POS_MSEC, (source_start + time_seconds) * 1000.0)
        ok, frame = capture.read()
        if not ok:
            raise RuntimeError(f"SCENE_FRAME_READ_FAILED: {frame_index}")
        frame = cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA)
        frame = grade_scene(frame)

        shadow_center = (int(width * 0.68), int(height * 0.91))
        shadow_layer = frame.copy()
        cv2.ellipse(shadow_layer, shadow_center, (150, 24), 0, 0, 360, (15, 25, 24), -1, cv2.LINE_AA)
        frame = cv2.addWeighted(shadow_layer, 0.33, frame, 0.67, 0)

        talking = talk_start <= time_seconds <= talk_end
        character = localized_character_motion(cutout.copy(), time_seconds, talking)
        character = transform_character(character, int(height * 0.82), time_seconds)
        entry = ease(time_seconds / 0.72)
        left = int(width * (0.78 - entry * 0.24) - character.shape[1] / 2)
        top = int(height - character.shape[0] - 16 + math.sin(time_seconds * math.tau * 0.75) * 3)
        alpha_composite(frame, character, left, top)

        if frame_index in sample_indices:
            samples.append(frame.copy())
        writer.write(frame)

    writer.release()
    capture.release()
    write_contact_sheet(samples, output / "reference-locked-motion-contact-sheet.jpg")
    cv2.imwrite(str(output / "reference-locked-action.png"), samples[min(1, len(samples) - 1)])

    final_video = output / "huihui-reference-locked-test.mp4"
    audio = project / dialogue["audio"]
    delay = max(0, int(talk_start * 1000))
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(temp_video),
            "-i",
            str(audio),
            "-filter_complex",
            f"[1:a]adelay={delay}|{delay}[voice]",
            "-map",
            "0:v:0",
            "-map",
            "[voice]",
            "-c:v",
            "libx264",
            "-crf",
            "17",
            "-preset",
            "medium",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-t",
            str(duration),
            "-movflags",
            "+faststart",
            str(final_video),
        ],
        check=True,
        capture_output=True,
    )
    report = {
        "schemaVersion": 1,
        "status": "PASS",
        "identityMode": "reference-locked-2.5d",
        "sceneMode": "dynamic-source-footage",
        "sceneStylization": "reference-preserving-edge-grade",
        "duration": duration,
        "fps": fps,
        "sourceVideo": str(source_video),
        "sourceTimestamp": source_start,
        "characterAsset": str(reference_asset),
        "motions": ["entrance", "idle-breath", "body-sway", "localized-hand-wave", "blink", "viseme-mouth"],
        "production3DReady": False,
        "limitations": [
            "This proof locks the approved front-view identity in 2.5D.",
            "Production 360-degree animation still requires approved orthographic views and a retopologized 3D asset.",
        ],
    }
    (output / "reference-lock-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
