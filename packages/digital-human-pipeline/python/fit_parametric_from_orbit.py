#!/usr/bin/env python3
"""Produce a review-only parametric geometry proposal from orbit observations."""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path

import numpy as np


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--observations", required=True, type=Path)
    parser.add_argument("--spec", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args()


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def accepted_near(frames: list[dict], targets: tuple[int, ...], tolerance: int = 20) -> list[dict]:
    result = []
    for frame in frames:
        if not frame.get("accepted"):
            continue
        angle = int(frame["angle"])
        if min(abs(angle - target) % 360 for target in targets) <= tolerance:
            result.append(frame)
    return result


def weighted_width(frames: list[dict], section: str) -> float | None:
    values = []
    weights = []
    for frame in frames:
        value = frame.get("sectionWidths", {}).get(section)
        if value and value > 0:
            values.append(value)
            weights.append(max(0.05, float(frame.get("confidence", 0.2))))
    if not values:
        return None
    return float(np.average(values, weights=weights))


def fit_ellipsoid_projection(frames: list[dict], part: str) -> dict | None:
    rows = []
    targets = []
    weights = []
    samples = []
    for frame in frames:
        if not frame.get("accepted"):
            continue
        observation = frame.get("semanticParts", {}).get(part, {})
        value = observation.get("widthToCharacterHeight")
        confidence = float(observation.get("confidence", 0))
        if value and value > 0 and confidence >= 0.45:
            theta = np.deg2rad(float(frame["angle"]))
            rows.append([np.cos(theta) ** 2, np.sin(theta) ** 2])
            targets.append((float(value) / 2) ** 2)
            weight = max(0.05, float(frame.get("confidence", 0.2))) * confidence
            weights.append(weight)
            samples.append(
                {
                    "angle": int(frame["angle"]),
                    "widthToCharacterHeight": round(float(value), 6),
                    "confidence": round(confidence, 6),
                    "weight": round(weight, 6),
                }
            )
    if len(rows) < 4:
        return None
    matrix = np.asarray(rows, dtype=np.float64)
    target = np.asarray(targets, dtype=np.float64)
    weight = np.asarray(weights, dtype=np.float64)
    weighted_matrix = matrix * np.sqrt(weight)[:, None]
    weighted_target = target * np.sqrt(weight)
    squared_axes, _, _, _ = np.linalg.lstsq(weighted_matrix, weighted_target, rcond=None)
    squared_axes = np.maximum(squared_axes, 1e-9)
    predicted = matrix @ squared_axes
    residual = np.sqrt(np.average((predicted - target) ** 2, weights=weight))
    mean_target = max(1e-9, float(np.average(target, weights=weight)))
    relative_residual = float(residual / mean_target)
    width_radius = float(np.sqrt(squared_axes[0]))
    depth_radius = float(np.sqrt(squared_axes[1]))
    return {
        "widthRadiusToCharacterHeight": width_radius,
        "depthRadiusToCharacterHeight": depth_radius,
        "depthToWidthRatio": depth_radius / max(1e-9, width_radius),
        "relativeResidual": relative_residual,
        "semanticConfidence": float(
            np.average(
                [sample["confidence"] for sample in samples],
                weights=[sample["weight"] for sample in samples],
            )
        ),
        "samples": samples,
    }


def main() -> None:
    args = parse_args()
    observations = load(args.observations)
    spec = load(args.spec)
    frames = observations["frames"]
    front = accepted_near(frames, (0, 360), 10)
    side = accepted_near(frames, (90, 270), 20)
    rear = accepted_near(frames, (180,), 20)
    proposals = []
    holds = []

    for key, dimension_key in (
        ("body", "scale"),
        ("helmet", "dimensions"),
    ):
        fit = fit_ellipsoid_projection(frames, key)
        current = spec["geometrySpec"][key][dimension_key]
        if not fit:
            proposals.append(
                {
                    "part": key,
                    "status": "HOLD",
                    "reason": "MULTI_VIEW_GEOMETRY_OBSERVATION_MISSING",
                }
            )
            continue
        observed_ratio = float(fit["depthToWidthRatio"])
        current_ratio = float(current[1]) / max(0.001, float(current[0]))
        plausible_min = current_ratio * 0.65
        plausible_max = current_ratio * 1.35
        semantic_confidence = float(fit["semanticConfidence"])
        fit_residual = float(fit["relativeResidual"])
        if (
            semantic_confidence < 0.55
            or fit_residual > 0.22
            or not plausible_min <= observed_ratio <= plausible_max
        ):
            hold = {
                "part": key,
                "status": "HOLD",
                "reason": "MULTI_VIEW_GEOMETRY_FIT_NOT_TRUSTWORTHY",
                "evidence": {
                    "observedSideToFrontRatio": round(observed_ratio, 6),
                    "currentGeometryRatio": round(current_ratio, 6),
                    "plausibleRange": [round(plausible_min, 6), round(plausible_max, 6)],
                    "semanticMaskConfidence": round(semantic_confidence, 6),
                    "relativeProjectionResidual": round(fit_residual, 6),
                    "sampleAngles": [sample["angle"] for sample in fit["samples"]],
                },
                "requiredAction": (
                    f"Owner-review the {key} masks or reject drifting orbit frames before numeric fitting."
                ),
            }
            proposals.append(hold)
            holds.append(hold)
            continue
        proposed = list(current)
        proposed[1] = round(float(current[0]) * observed_ratio, 3)
        proposals.append(
            {
                "part": key,
                "status": "REVIEW_REQUIRED",
                "parameter": f"geometrySpec.{key}.{dimension_key}",
                "current": current,
                "proposed": proposed,
                "evidence": {
                    "fittedWidthRadiusToCharacterHeight": round(
                        fit["widthRadiusToCharacterHeight"], 6
                    ),
                    "fittedDepthRadiusToCharacterHeight": round(
                        fit["depthRadiusToCharacterHeight"], 6
                    ),
                    "sideToFrontRatio": round(observed_ratio, 6),
                    "relativeProjectionResidual": round(fit_residual, 6),
                    "semanticMaskConfidence": round(semantic_confidence, 6),
                    "sampleAngles": [sample["angle"] for sample in fit["samples"]],
                },
                "confidence": (
                    "MEDIUM"
                    if len(fit["samples"]) >= 8 and fit_residual <= 0.14
                    else "LOW"
                ),
            }
        )

    report = {
        "schemaVersion": 1,
        "domain": "3D_MODELING",
        "proposalType": "PARAMETRIC_GEOMETRY_CALIBRATION",
        "status": "HOLD" if holds else "REVIEW_REQUIRED",
        "assetId": spec["assetId"],
        "sourceObservations": str(args.observations.resolve()),
        "sourceSpecification": str(args.spec.resolve()),
        "automaticMasterOverwrite": False,
        "fitObjective": "CONFIDENCE_WEIGHTED_MULTI_VIEW_REPROJECTION",
        "cardinalCoverage": {
            "front": [item["angle"] for item in front],
            "side": [item["angle"] for item in side],
            "rear": [item["angle"] for item in rear],
        },
        "proposals": proposals,
        "blockingFindings": holds,
        "deferred": [
            "arm and hand joint fitting requires semantic landmark review",
            "boot toe and heel fitting requires side-view owner approval",
            "face, branding and material boundaries remain identity-locked",
            "exact manufacturing union and physical proof remain HOLD",
        ],
        "nextGate": "SEMANTIC_PART_TRACKING" if holds else "GEOMETRY_OWNER_REVIEW",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    candidate = copy.deepcopy(spec)
    applied = []
    for proposal in proposals:
        if proposal.get("status") != "REVIEW_REQUIRED" or proposal.get("confidence") != "MEDIUM":
            continue
        part = proposal["part"]
        dimension_key = "scale" if part == "body" else "dimensions"
        candidate["geometrySpec"][part][dimension_key] = proposal["proposed"]
        applied.append(proposal["parameter"])
    candidate_path = args.output.with_name("geometry-review-candidate.spec.json")
    if applied:
        candidate["workflowId"] = f"{spec['workflowId']}-orbit-review"
        candidate["assetId"] = f"{spec['assetId']}-orbit-review"
        candidate["outputRoot"] = (
            "runtime/artifacts/media/huihui-printable-v3/"
            "orbit-calibration-v1/geometry-review-candidate"
        )
        candidate_path.write_text(
            json.dumps(candidate, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        report["reviewCandidate"] = {
            "status": "NON_MASTER_VISUAL_REVIEW_ONLY",
            "specPath": str(candidate_path.resolve()),
            "appliedParameters": applied,
            "automaticMasterOverwrite": False,
        }
    else:
        report["reviewCandidate"] = {
            "status": "NOT_MATERIALIZED",
            "reason": "No MEDIUM-confidence geometry proposal passed the fit gate.",
            "automaticMasterOverwrite": False,
        }
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "output": str(args.output), "proposals": len(proposals)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
