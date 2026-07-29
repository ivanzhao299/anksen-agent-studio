#!/usr/bin/env python3
"""Measure mesh continuity without confusing smooth shading with smooth geometry."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import trimesh


PROTOTYPE_THRESHOLDS = {
    "dihedralP95MaxDegrees": 8.0,
    "dihedralP99MaxDegrees": 15.0,
    "adjacencyAbove10DegreesMaxRatio": 0.03,
    "triangleQualityP01Min": 0.45,
}

FINE_ASSET_THRESHOLDS = {
    "dihedralP95MaxDegrees": 4.5,
    "dihedralP99MaxDegrees": 9.0,
    "adjacencyAbove5DegreesMaxRatio": 0.05,
    "adjacencyAbove10DegreesMaxRatio": 0.01,
    "triangleQualityP01Min": 0.55,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mesh", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--source-mesh")
    parser.add_argument("--feature-angle-degrees", type=float, default=60.0)
    parser.add_argument("--feature-zone-voxel-radius", type=float, default=3.0)
    return parser.parse_args()


def round_metric(value: float) -> float:
    return round(float(value), 6)


def percentile(values: np.ndarray, value: float) -> float:
    return round_metric(np.percentile(values, value))


def load_mesh(path: Path) -> trimesh.Trimesh:
    loaded = trimesh.load(path, force="scene", process=True)
    geometries = (
        list(loaded.geometry.values())
        if isinstance(loaded, trimesh.Scene)
        else [loaded]
    )
    meshes = [item for item in geometries if isinstance(item, trimesh.Trimesh)]
    if not meshes:
        raise RuntimeError("SURFACE_QUALITY_MESH_EMPTY")
    return trimesh.util.concatenate(meshes)


def adjacency_metrics(adjacency_degrees: np.ndarray) -> dict:
    if adjacency_degrees.size == 0:
        raise RuntimeError("SURFACE_QUALITY_NO_FACE_ADJACENCY")
    return {
        "count": int(len(adjacency_degrees)),
        "dihedralDegrees": {
            "p50": percentile(adjacency_degrees, 50),
            "p90": percentile(adjacency_degrees, 90),
            "p95": percentile(adjacency_degrees, 95),
            "p99": percentile(adjacency_degrees, 99),
            "p999": percentile(adjacency_degrees, 99.9),
        },
        "sharpAdjacencyRatio": {
            "above5": round_metric(np.mean(adjacency_degrees > 5.0)),
            "above10": round_metric(np.mean(adjacency_degrees > 10.0)),
            "above20": round_metric(np.mean(adjacency_degrees > 20.0)),
            "above30": round_metric(np.mean(adjacency_degrees > 30.0)),
        },
    }


def transform_source_to_candidate(
    source: trimesh.Trimesh, candidate: trimesh.Trimesh
) -> trimesh.Trimesh:
    """Match glTF Y-up source coordinates to the Blender/STL Z-up export."""
    source = source.copy()
    source_vertices = np.asarray(source.vertices)
    source_height = float(np.ptp(source_vertices[:, 1]))
    candidate_height = float(np.ptp(candidate.vertices[:, 2]))
    if source_height <= 0 or candidate_height <= 0:
        raise RuntimeError("SURFACE_QUALITY_ALIGNMENT_EXTENT_INVALID")
    scale = candidate_height / source_height
    transformed = np.column_stack(
        (
            source_vertices[:, 0] * scale,
            -source_vertices[:, 2] * scale,
            (source_vertices[:, 1] - np.min(source_vertices[:, 1])) * scale
            + np.min(candidate.vertices[:, 2]),
        )
    )
    source.vertices = transformed
    return source


def source_feature_evidence(
    source: trimesh.Trimesh,
    candidate: trimesh.Trimesh,
    candidate_adjacency_degrees: np.ndarray,
    feature_angle_degrees: float,
    feature_zone_voxel_radius: float,
) -> dict:
    try:
        from scipy.spatial import cKDTree
    except ImportError as error:
        raise RuntimeError("SURFACE_QUALITY_SCIPY_REQUIRED_FOR_SOURCE_FEATURES") from error

    aligned_source = transform_source_to_candidate(source, candidate)
    source_angles = np.degrees(aligned_source.face_adjacency_angles)
    source_feature_mask = source_angles >= feature_angle_degrees
    source_feature_edges = aligned_source.face_adjacency_edges[source_feature_mask]
    if len(source_feature_edges) == 0:
        raise RuntimeError("SURFACE_QUALITY_SOURCE_FEATURES_EMPTY")

    source_edge_vertices = aligned_source.vertices[source_feature_edges]
    source_feature_samples = np.concatenate(
        (
            source_edge_vertices[:, 0],
            source_edge_vertices[:, 1],
            np.mean(source_edge_vertices, axis=1),
        ),
        axis=0,
    )
    candidate_edge_vertices = candidate.vertices[candidate.face_adjacency_edges]
    candidate_edge_midpoints = np.mean(candidate_edge_vertices, axis=1)
    target_voxel_size = float(np.ptp(candidate.vertices[:, 2])) / 380.0
    zone_radius = target_voxel_size * feature_zone_voxel_radius
    nearest_distances, _ = cKDTree(source_feature_samples).query(
        candidate_edge_midpoints, k=1, workers=-1
    )
    feature_zone_mask = nearest_distances <= zone_radius
    organic_zone_mask = ~feature_zone_mask
    feature_angles = candidate_adjacency_degrees[feature_zone_mask]
    organic_angles = candidate_adjacency_degrees[organic_zone_mask]
    if feature_angles.size == 0 or organic_angles.size == 0:
        raise RuntimeError("SURFACE_QUALITY_FEATURE_PARTITION_EMPTY")

    return {
        "sourceAlignment": {
            "axisMapping": "source glTF (x,y,z) -> candidate (x,-z,y)",
            "candidateHeightMeters": round_metric(
                np.ptp(candidate.vertices[:, 2])
            ),
        },
        "featureAngleDegrees": round_metric(feature_angle_degrees),
        "featureZoneRadiusMeters": round_metric(zone_radius),
        "sourceFeatureAdjacencies": int(np.sum(source_feature_mask)),
        "sourceFeatureSamples": int(len(source_feature_samples)),
        "candidateFeatureZoneRatio": round_metric(np.mean(feature_zone_mask)),
        "candidateFeatureZone": adjacency_metrics(feature_angles),
        "organicContinuityZone": adjacency_metrics(organic_angles),
        "hardFeatureRetention": {
            "status": (
                "PASS"
                if percentile(feature_angles, 90) >= 10.0
                and np.mean(feature_angles > 10.0) >= 0.10
                else "HOLD"
            ),
            "rule": "feature-zone p90 >= 10 degrees and above10 ratio >= 0.10",
        },
    }


def threshold_pass(metrics: dict, thresholds: dict) -> bool:
    comparisons = {
        "dihedralP95MaxDegrees": metrics["dihedralDegrees"]["p95"],
        "dihedralP99MaxDegrees": metrics["dihedralDegrees"]["p99"],
        "adjacencyAbove5DegreesMaxRatio": metrics["sharpAdjacencyRatio"]["above5"],
        "adjacencyAbove10DegreesMaxRatio": metrics["sharpAdjacencyRatio"]["above10"],
        "triangleQualityP01Min": metrics["triangleQuality"]["p01"],
    }
    for name, expected in thresholds.items():
        actual = comparisons[name]
        if name.endswith("Min"):
            if actual < expected:
                return False
        elif actual > expected:
            return False
    return True


def main() -> None:
    args = parse_args()
    mesh_path = Path(args.mesh).resolve()
    output_path = Path(args.output).resolve()
    mesh = load_mesh(mesh_path)

    adjacency_degrees = np.degrees(mesh.face_adjacency_angles)
    if adjacency_degrees.size == 0:
        raise RuntimeError("SURFACE_QUALITY_NO_FACE_ADJACENCY")

    triangles = mesh.triangles
    edge_vectors = np.stack(
        (
            triangles[:, 1] - triangles[:, 0],
            triangles[:, 2] - triangles[:, 1],
            triangles[:, 0] - triangles[:, 2],
        ),
        axis=1,
    )
    squared_edge_lengths = np.sum(edge_vectors * edge_vectors, axis=2)
    triangle_quality = (
        4.0
        * np.sqrt(3.0)
        * mesh.area_faces
        / np.maximum(np.sum(squared_edge_lengths, axis=1), 1e-18)
    )

    global_adjacency = adjacency_metrics(adjacency_degrees)
    metrics = {
        "vertices": int(len(mesh.vertices)),
        "triangleFaces": int(len(mesh.faces)),
        "faceAdjacencies": int(len(adjacency_degrees)),
        "connectedBodies": int(len(mesh.split(only_watertight=False))),
        "watertight": bool(mesh.is_watertight),
        "dihedralDegrees": global_adjacency["dihedralDegrees"],
        "sharpAdjacencyRatio": global_adjacency["sharpAdjacencyRatio"],
        "triangleQuality": {
            "p01": percentile(triangle_quality, 1),
            "p05": percentile(triangle_quality, 5),
            "median": percentile(triangle_quality, 50),
            "below020Ratio": round_metric(np.mean(triangle_quality < 0.2)),
        },
    }

    source_path = Path(args.source_mesh).resolve() if args.source_mesh else None
    feature_evidence = None
    continuity_metrics = metrics
    if source_path:
        feature_evidence = source_feature_evidence(
            load_mesh(source_path),
            mesh,
            adjacency_degrees,
            max(20.0, min(args.feature_angle_degrees, 120.0)),
            max(0.5, min(args.feature_zone_voxel_radius, 8.0)),
        )
        continuity_metrics = {
            **metrics,
            "dihedralDegrees": feature_evidence["organicContinuityZone"][
                "dihedralDegrees"
            ],
            "sharpAdjacencyRatio": feature_evidence["organicContinuityZone"][
                "sharpAdjacencyRatio"
            ],
        }

    prototype_pass = threshold_pass(continuity_metrics, PROTOTYPE_THRESHOLDS)
    fine_asset_pass = threshold_pass(continuity_metrics, FINE_ASSET_THRESHOLDS)
    hard_feature_pass = (
        feature_evidence is None
        or feature_evidence["hardFeatureRetention"]["status"] == "PASS"
    )
    findings = []
    if not prototype_pass:
        findings.append("PROTOTYPE_SURFACE_CONTINUITY_THRESHOLD_NOT_MET")
    if not fine_asset_pass:
        findings.append("FINE_ASSET_CURVATURE_THRESHOLD_NOT_MET")
    if not hard_feature_pass:
        findings.append("HARD_FEATURE_RETENTION_THRESHOLD_NOT_MET")
    findings.extend(
        [
            "SEMANTIC_REGION_VISUAL_REVIEW_REQUIRED",
            "SCULPT_OR_RETOPO_RECOMMENDED_FOR_MASTER_GRADE"
        ]
        if not fine_asset_pass
        else []
    )

    report = {
        "schemaVersion": 2,
        "domain": "3D_MODELING",
        "check": "SURFACE_QUALITY",
        "mesh": str(mesh_path),
        "meshSha256": hashlib.sha256(mesh_path.read_bytes()).hexdigest(),
        "status": (
            "PASS"
            if prototype_pass and fine_asset_pass
            else "PASS_WITH_CONDITIONS"
            if prototype_pass
            else "FAIL"
        ),
        "grade": (
            "FINE_ASSET"
            if fine_asset_pass
            else "REFINED_PROTOTYPE"
            if prototype_pass
            else "REWORK_REQUIRED"
        ),
        "metrics": metrics,
        "featureAwareEvidence": feature_evidence,
        "continuityMetricSource": (
            "organicContinuityZone"
            if feature_evidence is not None
            else "globalAdjacency"
        ),
        "thresholds": {
            "prototype": PROTOTYPE_THRESHOLDS,
            "fineAsset": FINE_ASSET_THRESHOLDS,
        },
        "gates": {
            "prototypeSurfaceContinuity": "PASS" if prototype_pass else "FAIL",
            "fineAssetCurvature": "PASS" if fine_asset_pass else "HOLD",
            "hardFeatureRetention": "PASS" if hard_feature_pass else "HOLD",
            "semanticPartSeparation": "HOLD",
        },
        "findings": findings,
        "limitations": [
            (
                "Source-aware organic continuity excludes adjacency near high-confidence source hard features."
                if feature_evidence is not None
                else "No source mesh was supplied, so global dihedral metrics cannot distinguish intentional hard details from unwanted shell faceting."
            ),
            "Source geometry is a single material-free body, so semantic part separation remains a required master-grade gate.",
            "Smooth shading is not used as geometry evidence.",
            "Fine-asset release still requires semantic-region visual review, slicer review and physical proof.",
        ],
        "externalModelCalled": False,
        "credentialValueRead": False,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
