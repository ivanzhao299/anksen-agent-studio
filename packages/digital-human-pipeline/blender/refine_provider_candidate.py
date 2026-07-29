"""Refine a provider mesh into a reversible, branded printable asset package."""

import argparse
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree


def parse_args(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--mesh", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--asset-id", default="huihui-printable-v3")
    parser.add_argument("--target-height-mm", type=float, default=180.0)
    parser.add_argument("--surface-subdivision-level", type=int, default=1)
    parser.add_argument(
        "--surface-method",
        choices=("voxel", "catmull-clark", "relax-only"),
        default="voxel",
    )
    parser.add_argument(
        "--surface-profile",
        choices=("uniform", "feature-preserving"),
        default="feature-preserving",
    )
    parser.add_argument("--feature-angle-degrees", type=float, default=60.0)
    parser.add_argument("--feature-protection-rings", type=int, default=1)
    return parser.parse_args(argv)


def material(name, base, roughness=0.5, metallic=0.0):
    item = bpy.data.materials.new(name)
    item.diffuse_color = (*base, 1.0)
    item.use_nodes = True
    shader = next(node for node in item.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*base, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return item


def world_bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    return minimum, maximum


def select_only(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]


def apply_modifier(obj, modifier):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def remove_small_loose_components(obj, minimum_faces=100):
    """Remove microscopic voxel islands while preserving all substantive bodies."""
    original_name = obj.name
    select_only([obj])
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")

    pieces = [
        item
        for item in bpy.context.selected_objects
        if item.type == "MESH"
    ]
    if len(pieces) <= 1:
        obj.select_set(False)
        return obj, 0

    retained = [
        item
        for item in pieces
        if len(item.data.polygons) >= minimum_faces
    ]
    if not retained:
        retained = [max(pieces, key=lambda item: len(item.data.polygons))]
    removed = [item for item in pieces if item not in retained]
    for item in removed:
        bpy.data.objects.remove(item, do_unlink=True)

    select_only(retained)
    bpy.context.view_layer.objects.active = retained[0]
    if len(retained) > 1:
        bpy.ops.object.join()
    result = bpy.context.view_layer.objects.active
    result.name = original_name
    result.select_set(False)
    return result, len(removed)


def capture_source_feature_samples(obj, angle_degrees):
    """Capture intentional-looking source ridges before topology-changing remesh."""
    mesh = obj.data
    edge_faces = [[] for _ in mesh.edges]
    edge_lookup = {
        tuple(sorted(edge.vertices)): edge.index
        for edge in mesh.edges
    }
    for polygon in mesh.polygons:
        for edge_key in polygon.edge_keys:
            edge_faces[edge_lookup[tuple(sorted(edge_key))]].append(polygon.index)

    angle_radians = math.radians(angle_degrees)
    feature_edges = []
    samples = []
    for edge in mesh.edges:
        linked_faces = edge_faces[edge.index]
        is_boundary = len(linked_faces) != 2
        is_material_boundary = (
            len(linked_faces) == 2
            and mesh.polygons[linked_faces[0]].material_index
            != mesh.polygons[linked_faces[1]].material_index
        )
        face_angle = (
            mesh.polygons[linked_faces[0]].normal.angle(
                mesh.polygons[linked_faces[1]].normal
            )
            if len(linked_faces) == 2
            else math.pi
        )
        if not (is_boundary or is_material_boundary or face_angle >= angle_radians):
            continue
        start = mesh.vertices[edge.vertices[0]].co.copy()
        end = mesh.vertices[edge.vertices[1]].co.copy()
        feature_edges.append(edge.index)
        samples.extend(
            (
                start,
                start.lerp(end, 0.25),
                start.lerp(end, 0.5),
                start.lerp(end, 0.75),
                end,
            )
        )
    return samples, {
        "sourceEdges": len(mesh.edges),
        "featureEdges": len(feature_edges),
        "featureSamples": len(samples),
        "angleDegrees": angle_degrees,
    }


def build_feature_fairing_group(
    obj,
    samples,
    hard_radius,
    feather_radius,
    protection_rings,
    name,
):
    """Build a soft fairing mask that locks source ridges and nearby junctions."""
    group = obj.vertex_groups.new(name=name)
    if not samples:
        group.add(
            [vertex.index for vertex in obj.data.vertices],
            1.0,
            "REPLACE",
        )
        return group, {vertex.index: 1.0 for vertex in obj.data.vertices}, {
            "protectedVertices": 0,
            "featheredVertices": 0,
            "fairingVertices": len(obj.data.vertices),
            "hardRadiusMm": hard_radius * 1000,
            "featherRadiusMm": feather_radius * 1000,
            "protectionRings": protection_rings,
        }

    tree = KDTree(len(samples))
    for index, point in enumerate(samples):
        tree.insert(point, index)
    tree.balance()

    weights = {}
    protected = set()
    feathered = 0
    for vertex in obj.data.vertices:
        _, _, distance = tree.find(vertex.co)
        if distance <= hard_radius:
            weight = 0.0
            protected.add(vertex.index)
        elif distance < feather_radius:
            normalized = (distance - hard_radius) / (
                feather_radius - hard_radius
            )
            weight = normalized * normalized * (3.0 - 2.0 * normalized)
            feathered += 1
        else:
            weight = 1.0
        weights[vertex.index] = weight

    adjacency = {vertex.index: set() for vertex in obj.data.vertices}
    for edge in obj.data.edges:
        left, right = edge.vertices
        adjacency[left].add(right)
        adjacency[right].add(left)
    frontier = set(protected)
    for _ in range(max(0, protection_rings)):
        frontier = {
            neighbor
            for vertex_index in frontier
            for neighbor in adjacency[vertex_index]
            if neighbor not in protected
        }
        protected.update(frontier)
    for vertex_index in protected:
        weights[vertex_index] = 0.0

    fairing_vertices = []
    for vertex_index, weight in weights.items():
        if weight >= 0.001:
            group.add([vertex_index], weight, "REPLACE")
            fairing_vertices.append(vertex_index)
    return group, weights, {
        "protectedVertices": len(protected),
        "featheredVertices": feathered,
        "fairingVertices": len(fairing_vertices),
        "hardRadiusMm": hard_radius * 1000,
        "featherRadiusMm": feather_radius * 1000,
        "protectionRings": protection_rings,
    }


def rounded_box(name, location, scale, item, bevel=0.002):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("Manufacturing bevel", "BEVEL")
    modifier.width = bevel
    modifier.segments = 5
    apply_modifier(obj, modifier)
    obj.data.materials.append(item)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def flattened_sphere(name, location, scale, item, segments=96, rings=64):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(item)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def apply_conformance(obj, target, thickness, outward_offset, projection_limit, bevel):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(target, depsgraph)
    target_inverse = target.matrix_world.inverted()
    target_direction = (
        target_inverse.to_3x3() @ Vector((0.0, 1.0, 0.0))
    ).normalized()
    target_normal_matrix = target.matrix_world.to_3x3()
    object_inverse = obj.matrix_world.inverted()
    ray_hits = 0
    ray_misses = 0
    conformed_vertices = {}
    for vertex in obj.data.vertices:
        world_origin = obj.matrix_world @ vertex.co
        target_origin = target_inverse @ world_origin
        location, normal, _, _ = tree.ray_cast(
            target_origin,
            target_direction,
            projection_limit,
        )
        if location is None:
            ray_misses += 1
            continue
        ray_hits += 1
        world_normal = (target_normal_matrix @ normal).normalized()
        if world_normal.y > 0.0:
            world_normal.negate()
        world_location = target.matrix_world @ location
        conformed_vertices[vertex.index] = object_inverse @ (
            world_location + world_normal * outward_offset
        )

    source_materials = list(obj.data.materials)
    source_faces = [tuple(polygon.vertices) for polygon in obj.data.polygons]
    kept_faces = [
        face
        for face in source_faces
        if all(vertex_index in conformed_vertices for vertex_index in face)
    ]
    if not kept_faces:
        raise RuntimeError(f"{obj.name}: conformance removed every source face")

    used_vertex_indices = sorted(
        {vertex_index for face in kept_faces for vertex_index in face}
    )
    index_map = {
        source_index: target_index
        for target_index, source_index in enumerate(used_vertex_indices)
    }
    clipped_mesh = bpy.data.meshes.new(f"{obj.name}.Conformed")
    clipped_mesh.from_pydata(
        [
            tuple(conformed_vertices[source_index])
            for source_index in used_vertex_indices
        ],
        [],
        [
            tuple(index_map[source_index] for source_index in face)
            for face in kept_faces
        ],
    )
    clipped_mesh.update()
    source_mesh = obj.data
    obj.data = clipped_mesh
    for source_material in source_materials:
        obj.data.materials.append(source_material)
    bpy.data.meshes.remove(source_mesh)

    obj["conformance_ray_hits"] = ray_hits
    obj["conformance_ray_misses"] = ray_misses
    obj["conformance_source_faces"] = len(source_faces)
    obj["conformance_dropped_faces"] = len(source_faces) - len(kept_faces)

    modifier = obj.modifiers.new("Embedded printable relief", "SOLIDIFY")
    modifier.thickness = thickness
    modifier.offset = -1.0
    modifier.use_even_offset = True
    modifier.use_quality_normals = True
    modifier.use_rim = True
    apply_modifier(obj, modifier)

    modifier = obj.modifiers.new("Relief edge radius", "BEVEL")
    modifier.width = bevel
    modifier.segments = 4
    apply_modifier(obj, modifier)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def conformed_rectangle(
    name,
    target,
    location,
    half_width,
    half_height,
    item,
    thickness,
    outward_offset,
    projection_limit,
    bevel,
    columns=24,
    rows=10,
):
    vertices = []
    for row in range(rows + 1):
        z = location[2] - half_height + (2.0 * half_height * row / rows)
        for column in range(columns + 1):
            x = location[0] - half_width + (2.0 * half_width * column / columns)
            vertices.append((x, location[1], z))
    faces = []
    stride = columns + 1
    for row in range(rows):
        for column in range(columns):
            lower_left = row * stride + column
            lower_right = lower_left + 1
            upper_left = lower_left + stride
            upper_right = upper_left + 1
            # Winding points toward -Y so solidification grows into the body.
            faces.append((lower_left, lower_right, upper_right, upper_left))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(item)
    return apply_conformance(
        obj,
        target,
        thickness,
        outward_offset,
        projection_limit,
        bevel,
    )


def conformed_ellipse(
    name,
    target,
    location,
    radius_x,
    radius_z,
    item,
    thickness,
    outward_offset,
    projection_limit,
    bevel,
    sectors=96,
    rings=7,
):
    vertices = [(location[0], location[1], location[2])]
    for ring in range(1, rings + 1):
        ratio = ring / rings
        for sector in range(sectors):
            angle = 2.0 * math.pi * sector / sectors
            vertices.append(
                (
                    location[0] + radius_x * ratio * math.cos(angle),
                    location[1],
                    location[2] + radius_z * ratio * math.sin(angle),
                )
            )
    faces = []
    for sector in range(sectors):
        current = 1 + sector
        following = 1 + ((sector + 1) % sectors)
        faces.append((0, following, current))
    for ring in range(1, rings):
        inner_start = 1 + (ring - 1) * sectors
        outer_start = 1 + ring * sectors
        for sector in range(sectors):
            inner_current = inner_start + sector
            inner_following = inner_start + ((sector + 1) % sectors)
            outer_current = outer_start + sector
            outer_following = outer_start + ((sector + 1) % sectors)
            faces.append(
                (
                    inner_current,
                    inner_following,
                    outer_following,
                    outer_current,
                )
            )
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(item)
    return apply_conformance(
        obj,
        target,
        thickness,
        outward_offset,
        projection_limit,
        bevel,
    )


def conformed_ellipse_patch(
    name,
    target,
    location,
    radius_x,
    radius_z,
    item,
    thickness,
    outward_offset,
    projection_limit,
    bevel,
    sectors=96,
    rings=8,
    center_ratio=0.16,
):
    """Build a pole-free curved medallion with a crisp independent perimeter.

    A triangle fan concentrates every cap edge at one center vertex and becomes
    a visible starburst after projection onto a convex shell. This topology
    uses a small central ngon plus concentric quad rings, keeping curvature
    changes distributed and leaving the outer loop available as a hard edge.
    """
    vertices = []
    ratios = [
        center_ratio + (1.0 - center_ratio) * ring / (rings - 1)
        for ring in range(rings)
    ]
    for ratio in ratios:
        for sector in range(sectors):
            angle = 2.0 * math.pi * sector / sectors
            vertices.append(
                (
                    location[0] + radius_x * ratio * math.cos(angle),
                    location[1],
                    location[2] + radius_z * ratio * math.sin(angle),
                )
            )

    # Winding points toward -Y so solidification grows into the body.
    faces = [tuple(reversed(range(sectors)))]
    for ring in range(rings - 1):
        inner_start = ring * sectors
        outer_start = (ring + 1) * sectors
        for sector in range(sectors):
            inner_current = inner_start + sector
            inner_following = inner_start + ((sector + 1) % sectors)
            outer_current = outer_start + sector
            outer_following = outer_start + ((sector + 1) % sectors)
            faces.append(
                (
                    inner_current,
                    inner_following,
                    outer_following,
                    outer_current,
                )
            )

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(item)
    result = apply_conformance(
        obj,
        target,
        thickness,
        outward_offset,
        projection_limit,
        bevel,
    )
    result["topology"] = "central-ngon-plus-concentric-quad-rings"
    result["semantic_class"] = "HARD_SURFACE_RELIEF"
    result["attachment_mode"] = "surface-conformed-inward-overlap"
    return result


def embossed_disc(name, location, radius, depth, item, vertices=128):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=(math.radians(90), 0.0, 0.0),
    )
    obj = bpy.context.object
    obj.name = name
    modifier = obj.modifiers.new("Manufacturing edge", "BEVEL")
    modifier.width = min(depth * 0.45, radius * 0.08)
    modifier.segments = 5
    apply_modifier(obj, modifier)
    obj.data.materials.append(item)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def curve_tube(name, points, radius, item):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 16
    curve.bevel_depth = radius
    curve.bevel_resolution = 6
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(item)
    select_only([obj])
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def text_mesh(name, body, location, size, depth, item):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = body
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = size
    curve.extrude = depth
    curve.bevel_depth = depth * 0.18
    curve.bevel_resolution = 3
    font_path = Path("/System/Library/Fonts/STHeiti Light.ttc")
    if font_path.exists():
        curve.font = bpy.data.fonts.load(str(font_path))
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (math.radians(90), 0.0, 0.0)
    obj.data.materials.append(item)
    select_only([obj])
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    return obj


def front_surface_y(obj, target_z, band, half_width):
    candidates = []
    for vertex in obj.data.vertices:
        point = obj.matrix_world @ vertex.co
        if abs(point.z - target_z) <= band and abs(point.x) <= half_width:
            candidates.append(point.y)
    return min(candidates) if candidates else min(
        (obj.matrix_world @ vertex.co).y for vertex in obj.data.vertices
    )


def front_surface_point(obj, world_x, world_z, projection_start_y, projection_limit):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(obj, depsgraph)
    inverse = obj.matrix_world.inverted()
    origin = inverse @ Vector((world_x, projection_start_y, world_z))
    direction = (inverse.to_3x3() @ Vector((0.0, 1.0, 0.0))).normalized()
    location, normal, _, _ = tree.ray_cast(origin, direction, projection_limit)
    if location is None:
        raise RuntimeError(
            f"{obj.name}: no front surface at x={world_x:.6f}, z={world_z:.6f}"
        )
    world_normal = (obj.matrix_world.to_3x3() @ normal).normalized()
    if world_normal.y > 0.0:
        world_normal.negate()
    return obj.matrix_world @ location, world_normal


def export_stl(path, objects):
    select_only(objects)
    bpy.ops.wm.stl_export(
        filepath=str(path),
        export_selected_objects=True,
        apply_modifiers=True,
    )


def main():
    separator = list(__import__("sys").argv).index("--")
    args = parse_args(__import__("sys").argv[separator + 1 :])
    mesh_path = Path(args.mesh).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(mesh_path))
    imported = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(imported) != 1:
        raise RuntimeError(f"Expected one provider mesh, received {len(imported)}")
    base = imported[0]
    base.name = "Huihui.ProviderBase.Refined"

    minimum, maximum = world_bounds([base])
    original_extent = maximum - minimum
    target_height_m = args.target_height_mm / 1000.0
    scale = target_height_m / original_extent.z
    base.scale = (scale, scale, scale)
    bpy.context.view_layer.update()
    minimum, maximum = world_bounds([base])
    base.location.z -= minimum.z
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    base.select_set(True)
    bpy.context.view_layer.objects.active = base
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    base.select_set(False)

    pre_smooth_minimum, pre_smooth_maximum = world_bounds([base])
    pre_smooth_extent = pre_smooth_maximum - pre_smooth_minimum
    surface_profile = args.surface_profile
    feature_angle_degrees = max(20.0, min(args.feature_angle_degrees, 120.0))
    feature_protection_rings = max(0, min(args.feature_protection_rings, 5))
    source_feature_samples, source_feature_report = capture_source_feature_samples(
        base,
        feature_angle_degrees,
    )
    source_feature_group = None
    source_feature_weights = {
        vertex.index: 1.0
        for vertex in base.data.vertices
    }
    source_feature_protection = None
    if surface_profile == "feature-preserving":
        source_feature_group, source_feature_weights, source_feature_protection = (
            build_feature_fairing_group(
                base,
                source_feature_samples,
                hard_radius=target_height_m / 380 * 0.45,
                feather_radius=target_height_m / 380 * 1.5,
                protection_rings=0,
                name="Source hard feature protection",
            )
        )

    body_group = base.vertex_groups.new(name="Torso surface relaxation")
    weighted = []
    for vertex in base.data.vertices:
        point = base.matrix_world @ vertex.co
        normalized_height = (point.z - pre_smooth_minimum.z) / pre_smooth_extent.z
        normalized_x = abs(point.x - (pre_smooth_minimum.x + pre_smooth_maximum.x) * 0.5) / pre_smooth_extent.x
        normalized_depth = (point.y - pre_smooth_minimum.y) / pre_smooth_extent.y
        if 0.23 <= normalized_height <= 0.72 and normalized_x <= 0.34:
            height_falloff = min(
                1.0,
                (normalized_height - 0.20) / 0.12,
                (0.76 - normalized_height) / 0.12,
            )
            width_falloff = min(1.0, max(0.0, (0.39 - normalized_x) / 0.12))
            depth_weight = 0.86 if 0.12 <= normalized_depth <= 0.88 else 0.55
            weight = max(
                0.0,
                height_falloff
                * width_falloff
                * depth_weight
                * source_feature_weights[vertex.index],
            )
            if weight < 0.08:
                continue
            weighted.append((vertex.index, weight))
    for vertex_index, weight in weighted:
        body_group.add([vertex_index], weight, "REPLACE")

    if weighted:
        modifier = base.modifiers.new("Selective torso surface relaxation", "SMOOTH")
        modifier.factor = 0.24
        modifier.iterations = 6
        modifier.vertex_group = body_group.name
        apply_modifier(base, modifier)

    modifier = base.modifiers.new("Micro surface relaxation", "LAPLACIANSMOOTH")
    modifier.iterations = 3
    modifier.lambda_factor = 0.024
    modifier.lambda_border = 0.0
    modifier.use_volume_preserve = True
    if source_feature_group is not None:
        modifier.vertex_group = source_feature_group.name
    apply_modifier(base, modifier)

    subdivision_level = max(0, min(args.surface_subdivision_level, 2))
    surface_method = args.surface_method
    surface_voxel_size = None
    if subdivision_level and surface_method == "voxel":
        target_voxels = 260 if subdivision_level == 1 else 380
        surface_voxel_size = target_height_m / target_voxels
        modifier = base.modifiers.new("Continuous curved surface reconstruction", "REMESH")
        modifier.mode = "VOXEL"
        modifier.voxel_size = surface_voxel_size
        modifier.adaptivity = 0.0
        modifier.use_remove_disconnected = True
        modifier.threshold = 1.0
        modifier.use_smooth_shade = True
        apply_modifier(base, modifier)
    elif subdivision_level and surface_method == "catmull-clark":
        modifier = base.modifiers.new("True curved surface subdivision", "SUBSURF")
        modifier.subdivision_type = "CATMULL_CLARK"
        modifier.levels = subdivision_level
        modifier.render_levels = subdivision_level
        modifier.show_only_control_edges = False
        apply_modifier(base, modifier)

    surface_smoothing = None
    regional_smoothing = []
    post_feature_protection = None
    post_feature_weights = {
        vertex.index: 1.0
        for vertex in base.data.vertices
    }
    if subdivision_level and surface_method == "voxel":
        fairing_group = None
        if surface_profile == "feature-preserving":
            fairing_group, post_feature_weights, post_feature_protection = (
                build_feature_fairing_group(
                    base,
                    source_feature_samples,
                    hard_radius=surface_voxel_size * 0.9,
                    feather_radius=surface_voxel_size * 2.5,
                    protection_rings=feature_protection_rings,
                    name="Reconstructed hard feature protection",
                )
            )
        modifier = base.modifiers.new("Broad curvature fairing", "SMOOTH")
        modifier.factor = (
            0.58
            if subdivision_level == 2 and surface_profile == "feature-preserving"
            else 0.70
            if subdivision_level == 2
            else 0.42
            if surface_profile == "feature-preserving"
            else 0.48
        )
        modifier.iterations = (
            14
            if subdivision_level == 2 and surface_profile == "feature-preserving"
            else 20
            if subdivision_level == 2
            else 10
            if surface_profile == "feature-preserving"
            else 12
        )
        modifier.use_x = True
        modifier.use_y = True
        modifier.use_z = True
        if fairing_group is not None:
            modifier.vertex_group = fairing_group.name
        surface_smoothing = {
            "method": "classic-neighbor-curvature-fairing",
            "factor": modifier.factor,
            "iterations": modifier.iterations,
            "vertexGroup": fairing_group.name if fairing_group is not None else None,
        }
        apply_modifier(base, modifier)

        fairing_minimum, fairing_maximum = world_bounds([base])
        fairing_extent = fairing_maximum - fairing_minimum
        fairing_center_x = (fairing_minimum.x + fairing_maximum.x) * 0.5
        fairing_regions = [
            {
                "name": "Legacy chest relief semantic rebuild",
                "heightMin": 0.31,
                "heightMax": 0.48,
                "halfWidth": 0.18,
                "heightFeather": 0.035,
                "widthFeather": 0.035,
                "depthMax": 0.30,
                "depthFeather": 0.08,
                "featureOverride": True,
                "factor": 0.88,
                "iterations": 110,
            },
            {
                "name": "Torso shell curvature fairing",
                "heightMin": 0.18,
                "heightMax": 0.76,
                "halfWidth": 0.39,
                "heightFeather": 0.08,
                "widthFeather": 0.08,
                "factor": (
                    0.82
                    if subdivision_level == 2
                    and surface_profile == "feature-preserving"
                    else 0.96
                    if subdivision_level == 2
                    else 0.62
                    if surface_profile == "feature-preserving"
                    else 0.70
                ),
                "iterations": (
                    80
                    if subdivision_level == 2
                    and surface_profile == "feature-preserving"
                    else 120
                    if subdivision_level == 2
                    else 34
                    if surface_profile == "feature-preserving"
                    else 44
                ),
                "featureOverride": False,
            },
            {
                "name": "Helmet shell curvature fairing",
                "heightMin": 0.70,
                "heightMax": 1.0,
                "halfWidth": 0.34,
                "heightFeather": 0.05,
                "widthFeather": 0.06,
                "factor": (
                    0.55
                    if subdivision_level == 2
                    and surface_profile == "feature-preserving"
                    else 0.80
                    if subdivision_level == 2
                    else 0.40
                    if surface_profile == "feature-preserving"
                    else 0.52
                ),
                "iterations": (
                    36
                    if subdivision_level == 2
                    and surface_profile == "feature-preserving"
                    else 64
                    if subdivision_level == 2
                    else 18
                    if surface_profile == "feature-preserving"
                    else 24
                ),
                "featureOverride": False,
            },
        ]
        for region in fairing_regions:
            group = base.vertex_groups.new(name=region["name"])
            region_vertices = []
            for vertex in base.data.vertices:
                point = base.matrix_world @ vertex.co
                normalized_height = (
                    point.z - fairing_minimum.z
                ) / fairing_extent.z
                normalized_x = abs(
                    point.x - fairing_center_x
                ) / fairing_extent.x
                normalized_depth = (
                    point.y - fairing_minimum.y
                ) / fairing_extent.y
                height_distance = min(
                    normalized_height - region["heightMin"],
                    region["heightMax"] - normalized_height,
                )
                width_distance = region["halfWidth"] - normalized_x
                if height_distance < 0.0 or width_distance < 0.0:
                    continue
                depth_weight = 1.0
                if region.get("depthMax") is not None:
                    if normalized_depth > region["depthMax"]:
                        continue
                    depth_weight = min(
                        1.0,
                        (
                            region["depthMax"] - normalized_depth
                        )
                        / region["depthFeather"],
                    )
                height_weight = min(
                    1.0,
                    height_distance / region["heightFeather"],
                )
                width_weight = min(
                    1.0,
                    width_distance / region["widthFeather"],
                )
                # Cubic smoothstep prevents a hard vertex-group boundary from
                # becoming a visible ring after high-iteration fairing.
                height_weight = height_weight * height_weight * (
                    3.0 - 2.0 * height_weight
                )
                width_weight = width_weight * width_weight * (
                    3.0 - 2.0 * width_weight
                )
                depth_weight = depth_weight * depth_weight * (
                    3.0 - 2.0 * depth_weight
                )
                feature_weight = (
                    1.0
                    if region.get("featureOverride")
                    else post_feature_weights[vertex.index]
                )
                weight = (
                    height_weight
                    * width_weight
                    * depth_weight
                    * feature_weight
                )
                if weight >= 0.02:
                    region_vertices.append((vertex.index, weight))
            if region_vertices:
                for vertex_index, weight in region_vertices:
                    group.add([vertex_index], weight, "REPLACE")
                modifier = base.modifiers.new(region["name"], "SMOOTH")
                modifier.factor = region["factor"]
                modifier.iterations = region["iterations"]
                modifier.vertex_group = group.name
                modifier.use_x = True
                modifier.use_y = True
                modifier.use_z = True
                apply_modifier(base, modifier)
            regional_smoothing.append(
                {
                    "region": region["name"],
                    "vertices": len(region_vertices),
                    "factor": region["factor"],
                    "iterations": region["iterations"],
                    "heightFeather": region["heightFeather"],
                    "widthFeather": region["widthFeather"],
                    "depthMax": region.get("depthMax"),
                    "featureOverride": region.get("featureOverride", False),
                }
            )
    elif subdivision_level and surface_method == "catmull-clark":
        modifier = base.modifiers.new(
            "Post subdivision curvature relaxation",
            "LAPLACIANSMOOTH",
        )
        modifier.iterations = 2
        modifier.lambda_factor = 0.012
        modifier.lambda_border = 0.0
        modifier.use_volume_preserve = True
        surface_smoothing = {
            "method": "volume-preserving-laplacian",
            "factor": modifier.lambda_factor,
            "iterations": modifier.iterations,
        }
        apply_modifier(base, modifier)

    removed_loose_components = 0
    if subdivision_level and surface_method == "voxel":
        base, removed_loose_components = remove_small_loose_components(base)

    post_smooth_minimum, post_smooth_maximum = world_bounds([base])
    post_smooth_extent = post_smooth_maximum - post_smooth_minimum
    base.scale = tuple(
        pre_smooth_extent[axis] / post_smooth_extent[axis]
        if post_smooth_extent[axis] > 0
        else 1.0
        for axis in range(3)
    )
    bpy.context.view_layer.update()
    minimum, maximum = world_bounds([base])
    base.location.z -= minimum.z
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    base.select_set(True)
    bpy.context.view_layer.objects.active = base
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    base.select_set(False)
    base.data.shade_smooth()
    if surface_profile == "feature-preserving":
        base.data.set_sharp_from_angle(angle=math.radians(feature_angle_degrees))

    cement = material("Cement shell", (0.34, 0.31, 0.27), 0.72)
    yellow = material("Safety yellow", (0.92, 0.53, 0.06), 0.34)
    black = material("Face screen", (0.018, 0.024, 0.030), 0.22)
    ivory = material("Face light", (0.96, 0.93, 0.84), 0.32)
    blue = material("Factory blue", (0.025, 0.17, 0.27), 0.34, 0.08)
    gold = material("Factory gold", (0.76, 0.48, 0.12), 0.32, 0.45)
    sole = material("Sole rubber", (0.035, 0.032, 0.030), 0.84)
    base.data.materials.clear()
    for item in (cement, yellow, sole):
        base.data.materials.append(item)
    minimum, maximum = world_bounds([base])
    extent = maximum - minimum
    for polygon in base.data.polygons:
        center = base.matrix_world @ polygon.center
        normalized_height = (center.z - minimum.z) / extent.z
        if normalized_height > 0.78:
            polygon.material_index = 1
        elif normalized_height < 0.055:
            polygon.material_index = 2
        elif normalized_height < 0.19:
            polygon.material_index = 1
        else:
            polygon.material_index = 0

    face_z = minimum.z + extent.z * 0.66
    face_y = front_surface_y(base, face_z, extent.z * 0.08, extent.x * 0.28)
    projection_start_y = minimum.y - extent.y * 0.08
    projection_limit = extent.y * 0.35
    relief_thickness = max(0.0008, extent.y * 0.008)
    relief_offset = max(0.00018, extent.y * 0.0018)
    screen = conformed_ellipse(
        "Huihui.FaceScreen",
        base,
        (0.0, projection_start_y, face_z),
        extent.x * 0.275,
        extent.z * 0.132,
        black,
        relief_thickness,
        relief_offset,
        projection_limit,
        max(0.00025, extent.y * 0.0025),
    )
    eye_z = face_z + extent.z * 0.018
    eye_scale = (extent.x * 0.032, extent.y * 0.012, extent.z * 0.052)
    left_eye_surface, _ = front_surface_point(
        base,
        -extent.x * 0.095,
        eye_z,
        projection_start_y,
        projection_limit,
    )
    right_eye_surface, _ = front_surface_point(
        base,
        extent.x * 0.095,
        eye_z,
        projection_start_y,
        projection_limit,
    )
    left_eye = flattened_sphere(
        "Huihui.Face.Eye.Left",
        (
            -extent.x * 0.095,
            left_eye_surface.y - eye_scale[1] * 0.25,
            eye_z,
        ),
        eye_scale,
        ivory,
        64,
        48,
    )
    right_eye = flattened_sphere(
        "Huihui.Face.Eye.Right",
        (
            extent.x * 0.095,
            right_eye_surface.y - eye_scale[1] * 0.25,
            eye_z,
        ),
        eye_scale,
        ivory,
        64,
        48,
    )
    mouth_coordinates = [
        (-extent.x * 0.055, face_z - extent.z * 0.055),
        (0.0, face_z - extent.z * 0.075),
        (extent.x * 0.055, face_z - extent.z * 0.055),
    ]
    mouth_radius = extent.z * 0.006
    mouth = curve_tube(
        "Huihui.Face.Mouth",
        [
            (
                x,
                front_surface_point(
                    base,
                    x,
                    z,
                    projection_start_y,
                    projection_limit,
                )[0].y
                - mouth_radius * 0.25,
                z,
            )
            for x, z in mouth_coordinates
        ],
        mouth_radius,
        ivory,
    )

    helmet_z = minimum.z + extent.z * 0.895
    helmet_y = front_surface_y(base, helmet_z, extent.z * 0.035, extent.x * 0.30)
    helmet_plate = conformed_rectangle(
        "Huihui.Helmet.BrandPlate",
        base,
        (0.0, projection_start_y, helmet_z),
        extent.x * 0.135,
        extent.z * 0.026,
        blue,
        relief_thickness,
        relief_offset,
        projection_limit,
        max(0.00022, extent.y * 0.0022),
    )
    helmet_surface, _ = front_surface_point(
        base,
        0.0,
        helmet_z,
        projection_start_y,
        projection_limit,
    )
    helmet_detail_y = helmet_surface.y - max(0.00008, extent.y * 0.0007)
    helmet_text = text_mesh(
        "Huihui.Helmet.BrandText",
        "水泥二厂",
        (0.0, helmet_detail_y, helmet_z),
        extent.z * 0.026,
        extent.y * 0.0024,
        ivory,
    )
    # Tiny corner rivets sit outside the helmet's valid front projection on the
    # provider mesh and create fragile floating islands at print scale.
    helmet_rivets = []

    chest_z = minimum.z + extent.z * 0.39
    chest_badge_depth = relief_thickness * 1.20
    chest_plate = conformed_ellipse_patch(
        "Huihui.Chest.BrandMedallion",
        base,
        (0.0, projection_start_y, chest_z),
        extent.x * 0.115,
        extent.z * 0.104,
        blue,
        chest_badge_depth,
        max(0.00014, relief_offset * 0.65),
        projection_limit,
        max(0.00018, extent.y * 0.0018),
    )
    tower_objects = []
    for index, (x_offset, height) in enumerate(
        ((-0.050, 0.050), (0.0, 0.073), (0.050, 0.044))
    ):
        tower_x = extent.x * x_offset
        tower_z = chest_z + extent.z * (0.012 + height * 0.35)
        tower_surface, _ = front_surface_point(
            base,
            tower_x,
            tower_z,
            projection_start_y,
            projection_limit,
        )
        tower_objects.append(
            rounded_box(
                f"Huihui.Chest.FactoryTower.{index + 1}",
                (
                    tower_x,
                    tower_surface.y - extent.y * 0.0005,
                    tower_z,
                ),
                (
                    extent.x * 0.018,
                    extent.y * 0.0025,
                    extent.z * height * 0.35,
                ),
                blue,
                extent.z * 0.003,
            )
        )
    chest_wave_coordinates = [
        (-extent.x * 0.070, chest_z - extent.z * 0.020),
        (0.0, chest_z - extent.z * 0.032),
        (extent.x * 0.070, chest_z - extent.z * 0.020),
    ]
    chest_wave_radius = extent.z * 0.0035
    chest_wave = curve_tube(
        "Huihui.Chest.FactoryWave",
        [
            (
                x,
                front_surface_point(
                    base,
                    x,
                    z,
                    projection_start_y,
                    projection_limit,
                )[0].y
                - chest_wave_radius * 0.25,
                z,
            )
            for x, z in chest_wave_coordinates
        ],
        chest_wave_radius,
        gold,
    )

    detail_objects = [
        screen,
        left_eye,
        right_eye,
        mouth,
        helmet_plate,
        helmet_text,
        *helmet_rivets,
        chest_plate,
        *tower_objects,
        chest_wave,
    ]
    for obj in detail_objects:
        obj["asset_id"] = args.asset_id
        obj["manufacturing_role"] = "detail_part"
    base["asset_id"] = args.asset_id
    base["manufacturing_role"] = "watertight_base"

    blend_path = output_dir / f"{args.asset_id}-refined.blend"
    glb_path = output_dir / f"{args.asset_id}-refined.glb"
    base_stl_path = output_dir / f"{args.asset_id}-base.stl"
    assembly_stl_path = output_dir / f"{args.asset_id}-assembly.stl"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    select_only([base, *detail_objects])
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
    )
    export_stl(base_stl_path, [base])
    export_stl(assembly_stl_path, [base, *detail_objects])

    final_minimum, final_maximum = world_bounds([base, *detail_objects])
    report = {
        "schemaVersion": 1,
        "assetId": args.asset_id,
        "status": "REFINED_CANDIDATE_READY",
        "sourceMesh": str(mesh_path),
        "targetHeightMm": args.target_height_mm,
        "base": {
            "vertices": len(base.data.vertices),
            "faces": len(base.data.polygons),
            "selectiveRelaxationVertices": len(weighted),
            "surfaceSubdivisionLevel": subdivision_level,
            "surfaceMethod": surface_method,
            "surfaceProfile": surface_profile,
            "featurePreservation": {
                "angleDegrees": feature_angle_degrees,
                "source": source_feature_report,
                "sourceProtection": source_feature_protection,
                "reconstructedProtection": post_feature_protection,
                "normalShading": "smooth faces with explicit sharp edges above the feature angle",
                "limitation": "provider source is one connected mesh without semantic material partitions; protected ridges are geometric evidence, not inferred part labels",
            },
            "surfaceVoxelSizeMm": (
                surface_voxel_size * 1000 if surface_voxel_size is not None else None
            ),
            "removedLooseComponents": removed_loose_components,
            "surfaceSmoothing": surface_smoothing,
            "regionalSmoothing": regional_smoothing,
            "surfaceRefinement": (
                "voxel continuity reconstruction plus feature-protected regional curvature fairing"
                if surface_method == "voxel"
                and surface_profile == "feature-preserving"
                else "voxel continuity reconstruction plus measured broad curvature fairing"
                if surface_method == "voxel"
                else "Catmull-Clark subdivision plus volume-preserving curvature relaxation"
                if surface_method == "catmull-clark"
                else "volume-preserving curvature relaxation"
            ),
            "role": "watertight_base",
        },
        "details": {
            "count": len(detail_objects),
            "roles": [
                "face screen",
                "eyes",
                "smile",
                "helmet brand",
                "chest factory mark",
            ],
            "manufacturing": "surface-conformed relief shells with inward printable overlap; preserve as separate parts for multicolor printing or DCC",
            "integration": {
                "conformedParts": [
                    "face screen",
                    "helmet brand plate",
                ],
                "rigidParts": [],
                "rebuiltParts": ["chest medallion"],
                "reliefThicknessMm": relief_thickness * 1000,
                "outwardOffsetMm": relief_offset * 1000,
                "style": "BVH ray-conformed relief shells with pole-free quad-ring chest topology and printable inward overlap",
                "projectionEvidence": {
                    obj.name: {
                        "rayHits": int(obj.get("conformance_ray_hits", 0)),
                        "rayMisses": int(obj.get("conformance_ray_misses", 0)),
                        "sourceFaces": int(
                            obj.get("conformance_source_faces", 0)
                        ),
                        "droppedFaces": int(
                            obj.get("conformance_dropped_faces", 0)
                        ),
                    }
                    for obj in (screen, helmet_plate, chest_plate)
                },
            },
        },
        "boundsMeters": {
            "minimum": list(final_minimum),
            "maximum": list(final_maximum),
            "extents": list(final_maximum - final_minimum),
        },
        "artifacts": {
            "blend": str(blend_path),
            "glb": str(glb_path),
            "baseStl": str(base_stl_path),
            "assemblyStl": str(assembly_stl_path),
        },
        "reversible": True,
        "sourceProviderMeshModifiedInPlace": False,
    }
    (output_dir / "refinement-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("REFINEMENT_REPORT=" + json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
