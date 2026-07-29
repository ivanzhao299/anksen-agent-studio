import argparse
import hashlib
import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-blend", required=True)
    parser.add_argument("--gauge-proposal", required=True)
    parser.add_argument("--output-dir", required=True)
    argv = []
    if "--" in __import__("sys").argv:
        argv = __import__("sys").argv[__import__("sys").argv.index("--") + 1 :]
    return parser.parse_args(argv)


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def vector_mm(vector):
    return [round(component * 1000.0, 4) for component in vector]


def baseline_meshes():
    return [
        obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH" and not obj.name.startswith("Gauge.")
    ]


def ray_hit(scene, depsgraph, x, z, origin_y, direction_y):
    hit, location, _normal, _index, obj, _matrix = scene.ray_cast(
        depsgraph,
        Vector((x, origin_y, z)),
        Vector((0.0, direction_y, 0.0)),
        distance=1.0,
    )
    if not hit or obj is None or obj.name.startswith("Gauge."):
        return None
    return {"location": location.copy(), "object": obj.name}


def transfer_anchor(scene, depsgraph, x_mm, z_mm):
    offsets_mm = [
        (0.0, 0.0),
        (-0.5, 0.0),
        (0.5, 0.0),
        (0.0, -0.5),
        (0.0, 0.5),
        (-1.0, 0.0),
        (1.0, 0.0),
        (0.0, -1.0),
        (0.0, 1.0),
    ]
    for offset_x_mm, offset_z_mm in offsets_mm:
        x = (x_mm + offset_x_mm) / 1000.0
        z = (z_mm + offset_z_mm) / 1000.0
        front = ray_hit(scene, depsgraph, x, z, -0.35, 1.0)
        back = ray_hit(scene, depsgraph, x, z, 0.35, -1.0)
        if front and back and back["location"].y > front["location"].y:
            front_y_mm = front["location"].y * 1000.0
            back_y_mm = back["location"].y * 1000.0
            return {
                "status": "PROVISIONAL_OWNER_REVIEW",
                "authority": "METRIC_FRONT_XZ_WITH_V15_RAYCAST_DEPTH_PRIOR",
                "sampleOffsetMm": [offset_x_mm, offset_z_mm],
                "xMm": round(x * 1000.0, 4),
                "zMm": round(z * 1000.0, 4),
                "frontYMm": round(front_y_mm, 4),
                "backYMm": round(back_y_mm, 4),
                "centerYMm": round((front_y_mm + back_y_mm) / 2.0, 4),
                "depthMm": round(back_y_mm - front_y_mm, 4),
                "halfExtentMm": round((back_y_mm - front_y_mm) / 2.0, 4),
                "frontObject": front["object"],
                "backObject": back["object"],
            }
    return {
        "status": "HOLD_NO_V15_INTERSECTION",
        "authority": "METRIC_FRONT_XZ_ONLY",
        "xMm": round(x_mm, 4),
        "zMm": round(z_mm, 4),
    }


def ensure_collection(name):
    existing = bpy.data.collections.get(name)
    if existing:
        for obj in list(existing.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        return existing
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def move_to_collection(obj, collection):
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)


def add_marker(name, location, color, collection, radius=0.00135):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=16,
        ring_count=8,
        radius=radius,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.color = (*color, 1.0)
    obj["anksen_gauge_marker"] = True
    move_to_collection(obj, collection)
    return obj


def add_connector(name, start, end, color, collection):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.00032
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(1)
    spline.points[0].co = (*start, 1.0)
    spline.points[1].co = (*end, 1.0)
    obj = bpy.data.objects.new(name, curve)
    obj.color = (*color, 1.0)
    obj["anksen_gauge_connector"] = True
    collection.objects.link(obj)
    return obj


def add_depth_visuals(transfers, collection):
    front_color = (1.0, 0.55, 0.04)
    back_color = (0.0, 0.72, 1.0)
    connector_color = (0.95, 0.08, 0.48)
    for probe in transfers:
        for anchor in probe["anchors"]:
            if anchor["status"] != "PROVISIONAL_OWNER_REVIEW":
                continue
            stem = f'{probe["probeId"]}.{anchor["anchorName"]}'
            x = anchor["xMm"] / 1000.0
            z = anchor["zMm"] / 1000.0
            front = Vector((x, anchor["frontYMm"] / 1000.0, z))
            back = Vector((x, anchor["backYMm"] / 1000.0, z))
            add_marker(f"Gauge.Front.{stem}", front, front_color, collection)
            add_marker(f"Gauge.Back.{stem}", back, back_color, collection)
            add_connector(
                f"Gauge.Depth.{stem}",
                front,
                back,
                connector_color,
                collection,
            )


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def configure_render(output_path, camera_location, target):
    scene = bpy.context.scene
    camera_data = bpy.data.cameras.new("Gauge.Transfer.Camera")
    camera = bpy.data.objects.new("Gauge.Transfer.Camera", camera_data)
    scene.collection.objects.link(camera)
    camera.location = camera_location
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 0.225
    look_at(camera, target)
    scene.camera = camera

    try:
        scene.render.engine = "BLENDER_WORKBENCH_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "OBJECT"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "BOTH"
    scene.display.shading.show_specular_highlight = True
    scene.display.shading.background_type = "VIEWPORT"
    scene.display.shading.background_color = (0.92, 0.94, 0.97)
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(output_path)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera, do_unlink=True)
    bpy.data.cameras.remove(camera_data)


def object_summary(obj):
    dimensions = obj.dimensions.copy()
    return {
        "name": obj.name,
        "vertexCount": len(obj.data.vertices),
        "polygonCount": len(obj.data.polygons),
        "dimensionsMm": vector_mm(dimensions),
        "materialCount": len(obj.data.materials),
    }


def main():
    args = parse_args()
    baseline_path = Path(args.baseline_blend).resolve()
    proposal_path = Path(args.gauge_proposal).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    baseline_hash_before = sha256(baseline_path)
    proposal = json.loads(proposal_path.read_text(encoding="utf-8"))
    scene = bpy.context.scene
    depsgraph = bpy.context.evaluated_depsgraph_get()
    meshes = baseline_meshes()
    for obj in meshes:
        obj["anksen_baseline_immutable"] = True
        obj.color = (0.42, 0.47, 0.54, 1.0)

    transfers = []
    attempted = 0
    successful = 0
    missed = []
    for probe in proposal.get("semanticProbes", []):
        anchors = []
        for anchor in probe.get("anchors", []):
            coordinate = anchor.get("coordinate") or {}
            if coordinate.get("xMm") is None or coordinate.get("zMm") is None:
                continue
            attempted += 1
            result = transfer_anchor(
                scene,
                depsgraph,
                float(coordinate["xMm"]),
                float(coordinate["zMm"]),
            )
            result["anchorName"] = anchor["name"]
            anchors.append(result)
            if result["status"] == "PROVISIONAL_OWNER_REVIEW":
                successful += 1
            else:
                missed.append(
                    {
                        "probeId": probe["id"],
                        "anchorName": anchor["name"],
                        "xMm": result["xMm"],
                        "zMm": result["zMm"],
                    }
                )
        transfers.append(
            {
                "probeId": probe["id"],
                "semanticRole": probe["semanticRole"],
                "primitiveFamily": probe["primitiveFamily"],
                "anchors": anchors,
            }
        )

    gauge_collection = ensure_collection("ANKSEN.GaugeTransfer")
    add_depth_visuals(transfers, gauge_collection)

    copy_path = output_dir / "v15-gauge-depth-transfer.blend"
    front_path = output_dir / "v15-depth-front.png"
    right_path = output_dir / "v15-depth-right.png"
    configure_render(front_path, (0.0, -0.46, 0.09), (0.0, 0.0, 0.09))
    configure_render(right_path, (0.46, 0.0, 0.09), (0.0, 0.0, 0.09))

    bpy.ops.wm.save_as_mainfile(filepath=str(copy_path), check_existing=False)
    baseline_hash_after = sha256(baseline_path)
    baseline_preserved = baseline_hash_before == baseline_hash_after
    if not baseline_preserved:
        raise RuntimeError("V15_BASELINE_MUTATED")

    provider = next(
        (item for item in meshes if "ProviderBase" in item.name),
        None,
    )
    report = {
        "schemaVersion": 1,
        "assetId": proposal.get("assetId"),
        "status": "PROVISIONAL_OWNER_REVIEW",
        "method": "V15_RAYCAST_DEPTH_TRANSFER",
        "authority": {
            "xAndZ": "METRIC_AUTHORITATIVE_FRONT",
            "y": "PROVISIONAL_V15_BASELINE_DEPTH_PRIOR",
            "generatedSideRearViewsAreMetric": False,
            "automaticMasterOverwrite": False,
        },
        "baselineBlend": str(baseline_path),
        "baselineSha256Before": baseline_hash_before,
        "baselineSha256After": baseline_hash_after,
        "baselinePreserved": baseline_preserved,
        "semanticProbeCount": len(transfers),
        "anchorCount": attempted,
        "successfulDepthTransfers": successful,
        "missedAnchorCount": len(missed),
        "missedAnchors": missed,
        "baselineObjects": [object_summary(obj) for obj in meshes],
        "assemblyFinding": {
            "providerBaseObject": provider.name if provider else None,
            "providerBaseVertexCount": len(provider.data.vertices) if provider else None,
            "status": "FUSED_PROVIDER_MESH_DETECTED" if provider else "NO_PROVIDER_BASE_FOUND",
            "implication": (
                "Body, helmet and limb silhouettes remain fused in the provider base; "
                "future correction must rebuild named semantic parts and interfaces."
            ),
        },
        "transfers": transfers,
        "artifacts": {
            "blend": str(copy_path),
            "frontPreview": str(front_path),
            "rightPreview": str(right_path),
            "report": str(output_dir / "v15-depth-transfer-report.json"),
        },
        "constraints": [
            "V15 baseline is immutable and hash-protected.",
            "No global smoothing, voxel remesh, weld or boolean union was performed.",
            "Transferred Y depth is provisional evidence, not owner-approved metric truth.",
            "Only the generated Blender copy contains gauge visualization objects.",
        ],
        "nextGate": "OWNER_REVIEW_DEPTH_TRANSFER_AND_SELECT_SEMANTIC_PART_REBUILD",
    }
    report_path = output_dir / "v15-depth-transfer-report.json"
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
