#!/usr/bin/env python3
"""Build a fail-closed multiview gauge proposal for semantic character geometry."""

import argparse
import json
from pathlib import Path

import cv2


CARDINAL_VIEW_BY_ANGLE = {
    0: "front",
    90: "right",
    180: "back",
    270: "left",
}


def load_json(path):
    with Path(path).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path, value):
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def round_value(value):
    return None if value is None else round(float(value), 4)


def xz_from_normalized(point, height_mm):
    if not point or len(point) != 2:
        return None
    return {
        "xMm": round_value((float(point[0]) - 0.5) * height_mm),
        "yMm": None,
        "zMm": round_value((1.0 - float(point[1])) * height_mm),
    }


def xz_from_pixel(point, frame_box, height_mm):
    if not point or len(point) != 2 or not frame_box:
        return None
    left, top, right, bottom = [float(value) for value in frame_box]
    width = max(1.0, right - left)
    height = max(1.0, bottom - top)
    return xz_from_normalized(
        [(float(point[0]) - left) / width, (float(point[1]) - top) / height],
        height_mm,
    )


def semantic_point(part, name):
    extrema = part.get("extremaNormalizedToCharacter", {})
    normalized_name = name.lower()
    if "top" in normalized_name or "crown" in normalized_name:
        return extrema.get("top")
    if "bottom" in normalized_name or "sole" in normalized_name:
        return extrema.get("bottom")
    if "left" in normalized_name and not any(
        marker in normalized_name for marker in ("center", "radius", "shoulder", "elbow", "wrist", "hip", "ankle", "toe", "heel", "palm", "fingertip")
    ):
        return extrema.get("left")
    if "right" in normalized_name and not any(
        marker in normalized_name for marker in ("center", "radius", "shoulder", "elbow", "wrist", "hip", "ankle", "toe", "heel", "palm", "fingertip")
    ):
        return extrema.get("right")
    if normalized_name == "center" or normalized_name.endswith("-center"):
        return part.get("center")
    if "brim-left" in normalized_name:
        return extrema.get("left")
    if "brim-right" in normalized_name:
        return extrema.get("right")
    return None


def part_observation(frame, observation_part):
    return (frame or {}).get("semanticParts", {}).get(observation_part)


def horizontal_polygon_intersections(points, level):
    if len(points) < 3:
        return []
    intersections = []
    closed = points + [points[0]]
    for first, second in zip(closed, closed[1:]):
        x1, y1 = float(first[0]), float(first[1])
        x2, y2 = float(second[0]), float(second[1])
        if y1 == y2:
            continue
        if not (min(y1, y2) <= level < max(y1, y2)):
            continue
        ratio = (level - y1) / (y2 - y1)
        intersections.append(x1 + ratio * (x2 - x1))
    return sorted(intersections)


def build_profile(profile, front_frame, height_mm):
    part = part_observation(front_frame, profile["semanticPart"])
    if not part or part.get("status") != "OBSERVED":
        return {
            "id": profile["id"],
            "semanticPart": profile["semanticPart"],
            "status": "HOLD",
            "reason": "SEMANTIC_PART_NOT_OBSERVED",
            "controlSections": [],
        }
    points = (
        part.get("contourLandmarks", {}).get("points", [])
    )
    normalized_points = [
        item.get("normalizedCharacterXY")
        for item in points
        if item.get("normalizedCharacterXY")
    ]
    box = part.get("boundingBox")
    frame_box = front_frame.get("boundingBox")
    fallback_left = None
    fallback_right = None
    if box and frame_box and frame_box[2] > frame_box[0]:
        character_width = frame_box[2] - frame_box[0]
        fallback_left = (box[0] - frame_box[0]) / character_width
        fallback_right = (box[2] - frame_box[0]) / character_width
    sections = []
    for level in profile["levels"]:
        intersections = horizontal_polygon_intersections(normalized_points, level)
        use_contour = (
            len(intersections) >= 2
            and intersections[-1] - intersections[0] >= 0.08
        )
        left = intersections[0] if use_contour else fallback_left
        right = intersections[-1] if use_contour else fallback_right
        sections.append(
            {
                "level": level,
                "zMm": round_value((1.0 - level) * height_mm),
                "leftXMm": round_value((left - 0.5) * height_mm) if left is not None else None,
                "rightXMm": round_value((right - 0.5) * height_mm) if right is not None else None,
                "widthMm": round_value((right - left) * height_mm)
                if left is not None and right is not None
                else None,
                "authority": "METRIC_FRONT_XZ",
                "source": "semantic-contour-polygon-intersection"
                if use_contour
                else "semantic-bounding-box-fallback",
                "fallbackUsed": not use_contour,
            }
        )
    return {
        "id": profile["id"],
        "semanticPart": profile["semanticPart"],
        "status": "PROPOSED_OWNER_REVIEW",
        "curveFamily": "CUBIC_BEZIER_SECTION_PROFILE",
        "controlSections": sections,
    }


def build_probe(probe, frames_by_view, height_mm, minimum_depth_confidence, generated_metric):
    front_frame = frames_by_view.get("front")
    front_part = part_observation(front_frame, probe["observationPart"])
    manual_anchors = probe.get("frontAnchorPixels", {})
    if (
        (not front_part or front_part.get("status") != "OBSERVED")
        and not any(point is not None for point in manual_anchors.values())
    ):
        return {
            "id": probe["id"],
            "semanticRole": probe["semanticRole"],
            "primitiveFamily": probe["primitiveFamily"],
            "status": "HOLD",
            "authority": "NONE",
            "reason": "SEMANTIC_PART_NOT_OBSERVED",
            "anchors": [],
            "depthGauge": None,
        }

    anchors = []
    unresolved = []
    for anchor_name in probe["anchorNames"]:
        manual_point = manual_anchors.get(anchor_name)
        point = semantic_point(front_part, anchor_name) if front_part else None
        coordinate = (
            xz_from_pixel(manual_point, front_frame.get("boundingBox"), height_mm)
            if manual_point is not None
            else xz_from_normalized(point, height_mm)
        )
        if coordinate is None:
            unresolved.append(anchor_name)
            anchors.append(
                {
                    "name": anchor_name,
                    "status": "HOLD",
                    "reason": "DEDICATED_SEMANTIC_LANDMARK_REQUIRED",
                    "coordinate": None,
                }
            )
        else:
            anchors.append(
                {
                    "name": anchor_name,
                    "status": "PROPOSED_OWNER_REVIEW",
                    "authority": "METRIC_FRONT_XZ",
                    "source": "OWNER_REVIEWED_PIXEL_GAUGE"
                    if manual_point is not None
                    else "SEMANTIC_OBSERVATION",
                    "pixel": manual_point,
                    "coordinate": coordinate,
                }
            )

    depth_candidates = []
    for view in ("right", "left"):
        frame = frames_by_view.get(view)
        part = part_observation(frame, probe["observationPart"])
        if not frame or not part or part.get("status") != "OBSERVED":
            continue
        confidence = min(float(frame.get("confidence", 0)), float(part.get("confidence", 0)))
        depth_candidates.append(
            {
                "view": view,
                "confidence": round_value(confidence),
                "halfExtentMm": round_value(
                    float(part.get("widthToCharacterHeight", 0)) * height_mm / 2.0
                ),
                "metric": bool(generated_metric and confidence >= minimum_depth_confidence),
            }
        )

    metric_depth = [item for item in depth_candidates if item["metric"]]
    depth_values = [
        item["halfExtentMm"]
        for item in (metric_depth if metric_depth else depth_candidates)
        if item["halfExtentMm"] is not None
    ]
    depth_gauge = {
        "status": "METRIC" if metric_depth else "PROVISIONAL_OWNER_REVIEW",
        "halfExtentMm": round_value(sum(depth_values) / len(depth_values))
        if depth_values
        else None,
        "candidates": depth_candidates,
        "reason": None
        if metric_depth
        else "AI_GENERATED_SIDE_VIEWS_ARE_NON_METRIC",
    }
    if not depth_values:
        depth_gauge["status"] = "HOLD"
        depth_gauge["reason"] = "SIDE_VIEW_PART_OBSERVATION_MISSING"

    status = "PROPOSED_OWNER_REVIEW"
    if unresolved or depth_gauge["status"] != "METRIC":
        status = "HOLD"
    return {
        "id": probe["id"],
        "semanticRole": probe["semanticRole"],
        "observationPart": probe["observationPart"],
        "primitiveFamily": probe["primitiveFamily"],
        "status": status,
        "authority": "METRIC_FRONT_XZ_WITH_NON_METRIC_DEPTH_PRIOR",
        "anchors": anchors,
        "unresolvedAnchors": unresolved,
        "depthGauge": depth_gauge,
        "curveControlPoints": probe["curveControlPoints"],
        "ownerReviewRequired": probe["ownerReviewRequired"],
    }


def render_front_gauge_overlay(front_frame, profiles, probes, output_path, height_mm):
    image = cv2.imread(str(front_frame.get("framePath", "")), cv2.IMREAD_COLOR)
    if image is None:
        return False
    box = front_frame.get("boundingBox")
    if not box:
        return False
    left, top, right, bottom = [int(value) for value in box]
    character_width = max(1, right - left)
    character_height = max(1, bottom - top)
    center_x = int(round(left + character_width * 0.5))
    cv2.line(image, (center_x, top), (center_x, bottom), (255, 205, 82), 2)
    cv2.line(image, (left, bottom), (right, bottom), (86, 222, 255), 3)
    cv2.rectangle(image, (left, top), (right, bottom), (255, 255, 255), 2)
    for profile_index, profile in enumerate(profiles):
        color = (72, 244, 160) if profile_index == 0 else (255, 132, 76)
        for section in profile.get("controlSections", []):
            if section["leftXMm"] is None or section["rightXMm"] is None:
                continue
            y = int(
                round(
                    top
                    + (1.0 - float(section["zMm"]) / height_mm)
                    * character_height
                )
            )
            x1 = int(
                round(
                    left
                    + (float(section["leftXMm"]) / height_mm + 0.5)
                    * character_width
                )
            )
            x2 = int(
                round(
                    left
                    + (float(section["rightXMm"]) / height_mm + 0.5)
                    * character_width
                )
            )
            cv2.line(image, (x1, y), (x2, y), color, 2)
            cv2.circle(image, (x1, y), 5, color, -1)
            cv2.circle(image, (x2, y), 5, color, -1)
    for part_name, part in front_frame.get("semanticParts", {}).items():
        semantic_box = part.get("boundingBox")
        if not semantic_box:
            continue
        x1, y1, x2, y2 = [int(value) for value in semantic_box]
        cv2.rectangle(image, (x1, y1), (x2, y2), (164, 164, 255), 1)
        cv2.putText(
            image,
            part_name,
            (x1, max(18, y1 - 6)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )
    for probe in probes:
        for anchor in probe.get("anchors", []):
            point = anchor.get("pixel")
            if not point:
                continue
            x, y = [int(round(value)) for value in point]
            cv2.circle(image, (x, y), 6, (0, 242, 255), -1)
            cv2.putText(
                image,
                anchor["name"],
                (x + 8, y - 8),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.42,
                (18, 18, 18),
                3,
                cv2.LINE_AA,
            )
            cv2.putText(
                image,
                anchor["name"],
                (x + 8, y - 8),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.42,
                (0, 242, 255),
                1,
                cv2.LINE_AA,
            )
    cv2.imwrite(str(output_path), image)
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--observations", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    config = load_json(args.config)
    observations = load_json(args.observations)
    output_root = Path(args.output_dir)
    output_root.mkdir(parents=True, exist_ok=True)

    accepted_frames = [
        frame for frame in observations.get("frames", []) if frame.get("accepted")
    ]
    frames_by_view = {}
    for frame in accepted_frames:
        view = CARDINAL_VIEW_BY_ANGLE.get(int(frame.get("angle", -1)))
        if view:
            frames_by_view[view] = frame

    required_views = [
        CARDINAL_VIEW_BY_ANGLE[angle]
        for angle in config["viewAuthority"]["requiredAngles"]
        if angle in CARDINAL_VIEW_BY_ANGLE
    ]
    missing_views = [view for view in required_views if view not in frames_by_view]
    height_mm = float(config["targetHeightMm"])
    generated_metric = bool(config["viewAuthority"]["generatedViewsAreMetric"])
    minimum_depth_confidence = float(
        config["viewAuthority"]["minimumDepthConfidence"]
    )

    coordinate_system = {
        "schemaVersion": 1,
        "assetId": config["assetId"],
        "coordinateSystem": config["coordinateSystem"],
        "unit": config["datums"]["unit"],
        "targetHeightMm": height_mm,
        "datums": config["datums"],
        "viewRegistration": [
            {
                "view": view,
                "angle": next(
                    angle for angle, name in CARDINAL_VIEW_BY_ANGLE.items() if name == view
                ),
                "available": view in frames_by_view,
                "authority": "METRIC_XZ_GAUGE"
                if view == "front"
                else "NON_METRIC_DEPTH_PRIOR",
                "confidence": round_value(frames_by_view.get(view, {}).get("confidence"))
                if view in frames_by_view
                else None,
            }
            for view in required_views
        ],
        "missingViews": missing_views,
    }

    probes = [
        build_probe(
            probe,
            frames_by_view,
            height_mm,
            minimum_depth_confidence,
            generated_metric,
        )
        for probe in config["semanticProbes"]
    ]
    profiles = [
        build_profile(profile, frames_by_view.get("front"), height_mm)
        for profile in config["gaugeProfiles"]
    ]
    probe_by_id = {probe["id"]: probe for probe in probes}
    interfaces = []
    for item in config["interfaces"]:
        parent = probe_by_id.get(item["parentPart"])
        child = probe_by_id.get(item["childPart"])
        ready = (
            parent is not None
            and child is not None
            and parent["status"] != "HOLD"
            and child["status"] != "HOLD"
        )
        interfaces.append(
            {
                **item,
                "status": "PROPOSED_OWNER_REVIEW" if ready else "HOLD",
                "reason": None if ready else "PART_GAUGE_OR_DEPTH_NOT_LOCKED",
                "executionRule": "PATCH_NAMED_INTERFACE_ONLY",
            }
        )

    metric_probe_count = sum(
        1 for probe in probes if probe["depthGauge"] and probe["depthGauge"]["status"] == "METRIC"
    )
    hold_probe_count = sum(1 for probe in probes if probe["status"] == "HOLD")
    report_status = (
        "PROPOSAL_READY"
        if not missing_views and metric_probe_count == len(probes)
        else "HOLD_OWNER_REVIEW"
    )
    anchor_proposal = {
        "schemaVersion": 1,
        "assetId": config["assetId"],
        "baselineVersion": config["baselineVersion"],
        "status": report_status,
        "automaticMasterOverwrite": False,
        "profiles": profiles,
        "semanticProbes": probes,
    }
    patch_work_order = {
        "schemaVersion": 1,
        "assetId": config["assetId"],
        "baselineVersion": config["baselineVersion"],
        "status": "HOLD",
        "scope": "SEMANTIC_PART_LOCAL_PATCHES",
        "masterMeshMutationAllowed": False,
        "globalSmoothingAllowed": False,
        "globalVoxelRemeshAllowed": False,
        "manufacturingUnion": "DEFERRED",
        "operations": [
            {
                "partId": probe["id"],
                "primitiveFamily": probe["primitiveFamily"],
                "status": probe["status"],
                "operation": "FIT_PRIMITIVE_AND_BEZIER_FROM_GAUGES",
                "reason": "OWNER_REVIEW_AND_METRIC_DEPTH_REQUIRED"
                if probe["status"] == "HOLD"
                else None,
            }
            for probe in probes
        ],
        "interfaces": interfaces,
    }
    overlay_path = output_root / "front-gauge-overlay.png"
    overlay_written = render_front_gauge_overlay(
        frames_by_view.get("front", {}),
        profiles,
        probes,
        overlay_path,
        height_mm,
    )
    calibration_report = {
        "schemaVersion": 1,
        "domain": "3D_MODELING",
        "assetId": config["assetId"],
        "workflowId": config["workflowId"],
        "calibrationMode": config["calibrationMode"],
        "status": report_status,
        "baselineMesh": config["baselineMesh"],
        "baselinePreserved": True,
        "method": "GAUGE_DRIVEN_SEMANTIC_PRIMITIVE_AND_BEZIER_CALIBRATION",
        "summary": {
            "requiredViews": len(required_views),
            "availableViews": len(required_views) - len(missing_views),
            "semanticProbes": len(probes),
            "holdProbes": hold_probe_count,
            "metricDepthProbes": metric_probe_count,
            "interfaces": len(interfaces),
            "interfacesOnHold": sum(1 for item in interfaces if item["status"] == "HOLD"),
        },
        "authority": {
            "front": "METRIC_IDENTITY_AND_XZ_GAUGE",
            "sideAndRear": "NON_METRIC_AI_PRIOR",
            "generatedViewsAreMetric": generated_metric,
        },
        "findings": [
            "FRONT_SCALE_AND_XZ_GAUGE_LOCKED",
            "DEPTH_REMAINS_NON_METRIC",
            "DEDICATED_ARM_HAND_LEG_EAR_BRANDING_PROBES_REQUIRED",
            "LOCAL_PATCH_WORK_ORDER_CREATED",
            "AUTOMATIC_MASTER_OVERWRITE_FORBIDDEN",
        ],
        "artifacts": {
            "coordinateSystem": str(output_root / "gauge-coordinate-system.json"),
            "anchorProposal": str(output_root / "semantic-anchor-proposal.json"),
            "patchWorkOrder": str(output_root / "local-patch-work-order.json"),
            "frontGaugeOverlay": str(overlay_path) if overlay_written else None,
        },
    }

    write_json(output_root / "gauge-coordinate-system.json", coordinate_system)
    write_json(output_root / "semantic-anchor-proposal.json", anchor_proposal)
    write_json(output_root / "local-patch-work-order.json", patch_work_order)
    write_json(output_root / "calibration-report.json", calibration_report)
    print(json.dumps(calibration_report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
