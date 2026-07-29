"""Produce a conservative, machine-readable printable-mesh quality report."""

import argparse
import json
from pathlib import Path

import numpy as np
import trimesh


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mesh", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--target-height-mm", type=float, default=180.0)
    parser.add_argument("--minimum-wall-mm", type=float, default=1.6)
    return parser.parse_args()


def load_mesh(path):
    # STL stores every triangle independently. Processing and explicitly merging
    # coincident vertices is required before topology checks, otherwise a valid
    # watertight solid is reported as one disconnected body per face.
    loaded = trimesh.load(path, force="scene", process=True)
    geometries = list(loaded.geometry.values()) if isinstance(loaded, trimesh.Scene) else [loaded]
    if not geometries:
        raise RuntimeError("No mesh geometry found")
    mesh = trimesh.util.concatenate(geometries)
    mesh.merge_vertices()
    mesh.remove_unreferenced_vertices()
    return geometries, mesh


def edge_counts(mesh):
    if len(mesh.edges_unique) == 0:
        return {"boundary": 0, "nonManifold": 0}
    counts = np.bincount(mesh.edges_unique_inverse, minlength=len(mesh.edges_unique))
    return {
        "boundary": int(np.count_nonzero(counts == 1)),
        "nonManifold": int(np.count_nonzero(counts > 2)),
    }


def main():
    args = parse_args()
    mesh_path = Path(args.mesh).resolve()
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    geometries, mesh = load_mesh(mesh_path)
    areas = np.asarray(mesh.area_faces)
    edges = edge_counts(mesh)
    extents_mm = np.asarray(mesh.extents, dtype=float) * 1000.0
    height_error_mm = abs(float(extents_mm[2]) - args.target_height_mm)
    duplicate_faces = len(mesh.faces) - len(
        np.unique(np.sort(np.asarray(mesh.faces), axis=1), axis=0)
    )
    connected = mesh.split(only_watertight=False)
    volume_cm3 = abs(float(mesh.volume)) * 1_000_000.0 if mesh.is_volume else None

    hard_failures = []
    if not mesh.is_watertight:
        hard_failures.append("MESH_NOT_WATERTIGHT")
    if not mesh.is_winding_consistent:
        hard_failures.append("WINDING_INCONSISTENT")
    if edges["boundary"] > 0:
        hard_failures.append("BOUNDARY_EDGES_PRESENT")
    if edges["nonManifold"] > 0:
        hard_failures.append("NON_MANIFOLD_EDGES_PRESENT")
    if duplicate_faces > 0:
        hard_failures.append("DUPLICATE_FACES_PRESENT")
    if height_error_mm > 0.6:
        hard_failures.append("TARGET_HEIGHT_OUT_OF_TOLERANCE")

    report = {
        "schemaVersion": 1,
        "mesh": str(mesh_path),
        "status": "FAIL" if hard_failures else "PASS_WITH_CONDITIONS",
        "manufacturingProfile": {
            "process": "resin-or-fdm-character-prototype",
            "targetHeightMm": args.target_height_mm,
            "minimumWallMm": args.minimum_wall_mm,
            "detailPolicy": "separate intersecting parts are allowed in assembly package",
        },
        "geometry": {
            "geometryCount": len(geometries),
            "connectedBodyCount": len(connected),
            "vertices": int(len(mesh.vertices)),
            "faces": int(len(mesh.faces)),
            "watertight": bool(mesh.is_watertight),
            "windingConsistent": bool(mesh.is_winding_consistent),
            "isVolume": bool(mesh.is_volume),
            "eulerNumber": int(mesh.euler_number),
            "volumeCm3": volume_cm3,
            "extentsMm": [round(float(value), 4) for value in extents_mm],
            "heightErrorMm": round(height_error_mm, 4),
            "boundaryEdges": edges["boundary"],
            "nonManifoldEdges": edges["nonManifold"],
            "duplicateFaces": int(duplicate_faces),
            "degenerateFaceCount": int(np.count_nonzero(areas < 1e-14)),
        },
        "checks": {
            "watertight": "PASS" if mesh.is_watertight else "FAIL",
            "winding": "PASS" if mesh.is_winding_consistent else "FAIL",
            "manifold": "PASS" if not edges["boundary"] and not edges["nonManifold"] else "FAIL",
            "targetScale": "PASS" if height_error_mm <= 0.6 else "FAIL",
            "minimumWallThickness": "MANUAL_OR_SLICER_VERIFICATION_REQUIRED",
            "selfIntersection": "MANUAL_OR_SLICER_VERIFICATION_REQUIRED",
            "supportAndOverhang": "SLICER_PROFILE_REQUIRED",
        },
        "hardFailures": hard_failures,
        "releaseConditions": [
            "Run slicer wall-thickness and support preview before physical production.",
            "Print a 60 mm proof before the 180 mm final part.",
            "Keep the provider source mesh and refined DCC file for rollback.",
        ],
    }
    output_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
