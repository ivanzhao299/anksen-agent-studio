import argparse
import hashlib
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-blend", required=True)
    parser.add_argument("--gauge-proposal", required=True)
    parser.add_argument("--depth-report", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--part", required=True, choices=["helmet-shell"])
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


def object_summary(obj):
    return {
        "name": obj.name,
        "vertexCount": len(obj.data.vertices),
        "polygonCount": len(obj.data.polygons),
        "dimensionsMm": [round(value * 1000.0, 4) for value in obj.dimensions],
    }


def monotone_tangents(xs, ys):
    spans = [xs[index + 1] - xs[index] for index in range(len(xs) - 1)]
    slopes = [
        (ys[index + 1] - ys[index]) / spans[index]
        for index in range(len(xs) - 1)
    ]
    tangents = [slopes[0]]
    for index in range(1, len(xs) - 1):
        if slopes[index - 1] * slopes[index] <= 0.0:
            tangents.append(0.0)
            continue
        weight_left = 2.0 * spans[index] + spans[index - 1]
        weight_right = spans[index] + 2.0 * spans[index - 1]
        tangents.append(
            (weight_left + weight_right)
            / (
                weight_left / slopes[index - 1]
                + weight_right / slopes[index]
            )
        )
    tangents.append(slopes[-1])
    return tangents


def hermite(start, end, start_tangent, end_tangent, span, ratio):
    ratio2 = ratio * ratio
    ratio3 = ratio2 * ratio
    return (
        (2.0 * ratio3 - 3.0 * ratio2 + 1.0) * start
        + (ratio3 - 2.0 * ratio2 + ratio) * span * start_tangent
        + (-2.0 * ratio3 + 3.0 * ratio2) * end
        + (ratio3 - ratio2) * span * end_tangent
    )


def interpolate_sections(source_sections, crown_anchor, subdivisions=16):
    sections = sorted(source_sections, key=lambda item: item["zMm"])
    crown_point = {
        "zMm": crown_anchor["coordinate"]["zMm"],
        "leftXMm": crown_anchor["coordinate"]["xMm"] - 0.35,
        "rightXMm": crown_anchor["coordinate"]["xMm"] + 0.35,
        "widthMm": 0.7,
        "authority": "METRIC_FRONT_XZ",
        "source": "OWNER_REVIEWED_CROWN_ANCHOR",
    }
    sections.append(crown_point)
    z_values = [item["zMm"] for item in sections]
    left_values = [item["leftXMm"] for item in sections]
    right_values = [item["rightXMm"] for item in sections]
    left_tangents = monotone_tangents(z_values, left_values)
    right_tangents = monotone_tangents(z_values, right_values)
    refined = []
    for index, (start, end) in enumerate(zip(sections, sections[1:])):
        span = end["zMm"] - start["zMm"]
        for step in range(subdivisions):
            ratio = step / subdivisions
            left = hermite(
                start["leftXMm"],
                end["leftXMm"],
                left_tangents[index],
                left_tangents[index + 1],
                span,
                ratio,
            )
            right = hermite(
                start["rightXMm"],
                end["rightXMm"],
                right_tangents[index],
                right_tangents[index + 1],
                span,
                ratio,
            )
            refined.append(
                {
                    "zMm": start["zMm"] + span * ratio,
                    "leftXMm": left,
                    "rightXMm": right,
                    "widthMm": right - left,
                }
            )
    refined.append(crown_point)
    return refined


def add_crown(profile, crown_anchor, collection, center_y_mm, base_depth_mm):
    sections = interpolate_sections(profile["controlSections"], crown_anchor)
    max_half_width = max(item["widthMm"] / 2.0 for item in sections)
    vertices = []
    rings = []
    segments = 96

    for section in sections:
        center_x_mm = (section["leftXMm"] + section["rightXMm"]) / 2.0
        radius_x_mm = section["widthMm"] / 2.0
        radius_y_mm = max(
            2.4,
            base_depth_mm * math.pow(radius_x_mm / max_half_width, 0.72),
        )
        ring = []
        for index in range(segments):
            angle = math.tau * index / segments
            ring.append(len(vertices))
            vertices.append(
                (
                    (center_x_mm + math.cos(angle) * radius_x_mm) / 1000.0,
                    (center_y_mm + math.sin(angle) * radius_y_mm) / 1000.0,
                    section["zMm"] / 1000.0,
                )
            )
        rings.append(ring)

    faces = []
    for lower, upper in zip(rings, rings[1:]):
        for index in range(segments):
            next_index = (index + 1) % segments
            faces.append(
                (
                    lower[index],
                    lower[next_index],
                    upper[next_index],
                    upper[index],
                )
            )

    top_section = sections[-1]
    top_index = len(vertices)
    vertices.append(
        (
            (top_section["leftXMm"] + top_section["rightXMm"]) / 2.0 / 1000.0,
            center_y_mm / 1000.0,
            (top_section["zMm"] + 0.05) / 1000.0,
        )
    )
    for index in range(segments):
        faces.append((rings[-1][index], rings[-1][(index + 1) % segments], top_index))

    mesh = bpy.data.meshes.new("Huihui.Helmet.Crown.CandidateV1.Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Huihui.Helmet.Crown.CandidateV1", mesh)
    obj.color = (0.96, 0.55, 0.035, 1.0)
    obj["anksen_semantic_part"] = "helmet-shell"
    obj["anksen_candidate_version"] = "v1"
    obj["anksen_geometry_authority"] = "METRIC_FRONT_XZ_WITH_V15_DEPTH_PRIOR"
    collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def add_brim(
    collection,
    center_x_mm,
    center_y_mm,
    z_mm,
    outer_x_mm,
    outer_y_mm,
    inner_x_mm,
    inner_y_mm,
):
    segments = 128
    thickness_mm = 2.8
    vertices = []
    rings = {}
    for label, radius_x, radius_y, height in [
        ("outer_bottom", outer_x_mm, outer_y_mm, z_mm - thickness_mm),
        ("outer_top", outer_x_mm, outer_y_mm, z_mm),
        ("inner_bottom", inner_x_mm, inner_y_mm, z_mm - thickness_mm),
        ("inner_top", inner_x_mm, inner_y_mm, z_mm),
    ]:
        ring = []
        for index in range(segments):
            angle = math.tau * index / segments
            ring.append(len(vertices))
            vertices.append(
                (
                    (center_x_mm + math.cos(angle) * radius_x) / 1000.0,
                    (center_y_mm + math.sin(angle) * radius_y) / 1000.0,
                    height / 1000.0,
                )
            )
        rings[label] = ring

    faces = []
    smooth_faces = set()
    for index in range(segments):
        next_index = (index + 1) % segments
        faces.append(
            (
                rings["outer_bottom"][index],
                rings["outer_bottom"][next_index],
                rings["outer_top"][next_index],
                rings["outer_top"][index],
            )
        )
        smooth_faces.add(len(faces) - 1)
        faces.append(
            (
                rings["inner_bottom"][next_index],
                rings["inner_bottom"][index],
                rings["inner_top"][index],
                rings["inner_top"][next_index],
            )
        )
        smooth_faces.add(len(faces) - 1)
        faces.append(
            (
                rings["outer_top"][index],
                rings["outer_top"][next_index],
                rings["inner_top"][next_index],
                rings["inner_top"][index],
            )
        )
        faces.append(
            (
                rings["outer_bottom"][next_index],
                rings["outer_bottom"][index],
                rings["inner_bottom"][index],
                rings["inner_bottom"][next_index],
            )
        )

    mesh = bpy.data.meshes.new("Huihui.Helmet.Brim.CandidateV1.Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Huihui.Helmet.Brim.CandidateV1", mesh)
    obj.color = (0.92, 0.43, 0.02, 1.0)
    obj["anksen_semantic_part"] = "helmet-shell"
    obj["anksen_interface_operation"] = "KEEP_SEPARATE"
    obj["anksen_interface_tolerance_mm"] = 0.4
    collection.objects.link(obj)
    for index, polygon in enumerate(mesh.polygons):
        polygon.use_smooth = index in smooth_faces
    return obj


def add_interface_gauge(collection, center_x_mm, center_y_mm, radius_x_mm, radius_y_mm, z_mm):
    curve = bpy.data.curves.new("Huihui.HelmetBodyInterface.Gauge.Curve", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.00022
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    segments = 128
    spline.points.add(segments)
    for index in range(segments + 1):
        angle = math.tau * index / segments
        spline.points[index].co = (
            (center_x_mm + math.cos(angle) * radius_x_mm) / 1000.0,
            (center_y_mm + math.sin(angle) * radius_y_mm) / 1000.0,
            z_mm / 1000.0,
            1.0,
        )
    obj = bpy.data.objects.new("Huihui.HelmetBodyInterface.Gauge", curve)
    obj.color = (0.02, 0.82, 1.0, 1.0)
    obj["anksen_interface_id"] = "helmet-body-interface"
    obj["anksen_tolerance_mm"] = 0.4
    collection.objects.link(obj)
    return obj


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def configure_render(output_path, camera_location, target, ortho_scale):
    scene = bpy.context.scene
    camera_data = bpy.data.cameras.new("Semantic.Helmet.Camera")
    camera = bpy.data.objects.new("Semantic.Helmet.Camera", camera_data)
    scene.collection.objects.link(camera)
    camera.location = camera_location
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = ortho_scale
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
    scene.world.color = (0.91, 0.94, 0.98)
    scene.display.shading.background_type = "WORLD"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(output_path)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera, do_unlink=True)
    bpy.data.cameras.remove(camera_data)


def boundary_edge_count(obj):
    counts = {}
    for polygon in obj.data.polygons:
        for edge_key in polygon.edge_keys:
            counts[edge_key] = counts.get(edge_key, 0) + 1
    return sum(1 for count in counts.values() if count == 1)


def main():
    args = parse_args()
    baseline_path = Path(args.baseline_blend).resolve()
    proposal_path = Path(args.gauge_proposal).resolve()
    depth_report_path = Path(args.depth_report).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    baseline_hash_before = sha256(baseline_path)
    proposal = json.loads(proposal_path.read_text(encoding="utf-8"))
    depth_report = json.loads(depth_report_path.read_text(encoding="utf-8"))
    profile = next(
        item for item in proposal.get("profiles", []) if item["id"] == "helmet-front-profile"
    )
    probe = next(
        item for item in proposal.get("semanticProbes", []) if item["id"] == "helmet-shell"
    )
    transfer = next(
        item for item in depth_report.get("transfers", []) if item["probeId"] == "helmet-shell"
    )
    crown_anchor = next(
        item for item in probe["anchors"] if item["name"] == "crown"
    )
    brim_front = next(
        item for item in transfer["anchors"] if item["anchorName"] == "brim-front"
    )
    interface = next(
        item
        for item in json.loads(
            Path(args.gauge_proposal)
            .resolve()
            .with_name("local-patch-work-order.json")
            .read_text(encoding="utf-8")
        ).get("interfaces", [])
        if item["id"] == "helmet-body-interface"
    )

    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.hide_render = True

    collection = ensure_collection("ANKSEN.SemanticParts.Helmet.CandidateV1")
    sections = sorted(profile["controlSections"], key=lambda item: item["zMm"])
    base = sections[0]
    center_x_mm = (base["leftXMm"] + base["rightXMm"]) / 2.0
    radius_x_mm = base["widthMm"] / 2.0
    center_y_mm = float(brim_front["centerYMm"])
    depth_gauge_mm = float(probe["depthGauge"]["halfExtentMm"])

    crown = add_crown(profile, crown_anchor, collection, center_y_mm, depth_gauge_mm)
    brim = add_brim(
        collection,
        center_x_mm,
        center_y_mm,
        base["zMm"],
        radius_x_mm + 5.8,
        depth_gauge_mm + 5.2,
        radius_x_mm - interface["toleranceMm"],
        depth_gauge_mm - interface["toleranceMm"],
    )
    interface_gauge = add_interface_gauge(
        collection,
        center_x_mm,
        center_y_mm,
        radius_x_mm - interface["toleranceMm"],
        depth_gauge_mm - interface["toleranceMm"],
        base["zMm"] - 1.4,
    )
    candidate_objects = [crown, brim]
    for obj in candidate_objects:
        obj.hide_render = False
        obj.hide_set(False)

    blend_path = output_dir / "helmet-shell-v1.blend"
    glb_path = output_dir / "helmet-shell-v1.glb"
    front_path = output_dir / "helmet-front.png"
    right_path = output_dir / "helmet-right.png"
    target = (center_x_mm / 1000.0, center_y_mm / 1000.0, 0.153)
    configure_render(front_path, (target[0], -0.32, target[2]), target, 0.14)
    configure_render(right_path, (0.32, target[1], target[2]), target, 0.14)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in candidate_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = crown
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
    )
    interface_gauge.hide_render = False
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), check_existing=False)

    baseline_hash_after = sha256(baseline_path)
    if baseline_hash_before != baseline_hash_after:
        raise RuntimeError("V15_BASELINE_MUTATED")

    report = {
        "schemaVersion": 1,
        "assetId": proposal.get("assetId"),
        "partId": args.part,
        "status": "PROVISIONAL_OWNER_REVIEW",
        "method": "SEMANTIC_PARAMETRIC_HELMET_GAUGE_FIT",
        "baselineBlend": str(baseline_path),
        "baselineSha256Before": baseline_hash_before,
        "baselineSha256After": baseline_hash_after,
        "baselinePreserved": True,
        "geometryAuthority": {
            "frontXAndZ": "METRIC_AUTHORITATIVE_FRONT_PROFILE",
            "depthY": "PROVISIONAL_V15_DEPTH_PRIOR",
            "automaticMasterOverwrite": False,
        },
        "profileSections": profile["controlSections"],
        "depthGauge": probe["depthGauge"],
        "objects": [object_summary(obj) for obj in candidate_objects],
        "generatedProfileSectionCount": len(
            interpolate_sections(profile["controlSections"], crown_anchor)
        ),
        "topology": {
            "crownBoundaryEdges": boundary_edge_count(crown),
            "brimBoundaryEdges": boundary_edge_count(brim),
            "expectedOpenCrownBoundary": True,
            "expectedClosedBrim": True,
        },
        "interface": {
            "id": interface["id"],
            "operation": interface["operation"],
            "toleranceMm": interface["toleranceMm"],
            "preserveBoundary": interface["preserveBoundary"],
            "partsRemainSeparate": True,
        },
        "artifacts": {
            "blend": str(blend_path),
            "glb": str(glb_path),
            "frontPreview": str(front_path),
            "rightPreview": str(right_path),
            "report": str(output_dir / "helmet-geometry-report.json"),
        },
        "constraints": [
            "V15 remains immutable and hash-protected.",
            "Crown and brim remain separate semantic objects.",
            "Existing branding is excluded from shell review and will be rebuilt as its own semantic part.",
            "No global smoothing, voxel remesh, weld or boolean union was used.",
            "Depth remains provisional until metric side and rear references are approved.",
        ],
        "nextGate": "OWNER_REVIEW_HELMET_FRONT_RIGHT_AND_INTERFACE",
    }
    (output_dir / "helmet-geometry-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
