import argparse
import json
import math
import random
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


MODEL_HEIGHT_MM = 180.0
AUTHORED_HEIGHT_MM = 181.0
FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"


def parse_args():
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--reference", required=True)
    parser.add_argument("--brand-reference", required=True)
    parser.add_argument("--height-mm", type=float, default=MODEL_HEIGHT_MM)
    parser.add_argument("--voxel-mm", type=float, default=0.45)
    parser.add_argument("--spec")
    parser.add_argument("--asset-id", default="huihui-parametric-v1")
    parser.add_argument(
        "--weld-method",
        choices=("assembly-only", "voxel-preview"),
        default="assembly-only",
    )
    return parser.parse_args(values)


def rgba(hex_value):
    value = hex_value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) / 255.0 for index in (0, 2, 4)) + (1.0,)


def material(name, base_color, metallic=0.0, roughness=0.45):
    item = bpy.data.materials.new(name)
    item.use_nodes = True
    shader = next(
        (node for node in item.node_tree.nodes if node.type == "BSDF_PRINCIPLED"),
        None,
    )
    if shader is None:
        shader = item.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Base Color"].default_value = rgba(base_color)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return item


def concrete_material():
    item = material("Cast concrete", "#77746B", 0.0, 0.72)
    nodes = item.node_tree.nodes
    links = item.node_tree.links
    shader = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)

    large_noise = nodes.new("ShaderNodeTexNoise")
    large_noise.inputs["Scale"].default_value = 5.2
    large_noise.inputs["Detail"].default_value = 6.0
    large_noise.inputs["Roughness"].default_value = 0.72
    large_noise.inputs["Distortion"].default_value = 0.12

    fine_noise = nodes.new("ShaderNodeTexNoise")
    fine_noise.inputs["Scale"].default_value = 34.0
    fine_noise.inputs["Detail"].default_value = 4.0
    fine_noise.inputs["Roughness"].default_value = 0.82

    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.22
    ramp.color_ramp.elements[0].color = rgba("#474742")
    ramp.color_ramp.elements[1].position = 0.82
    ramp.color_ramp.elements[1].color = rgba("#A29B8A")
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.34
    bump.inputs["Distance"].default_value = 0.34

    links.new(large_noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
    links.new(fine_noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return item


def coated_material(name, dark_color, light_color, metallic=0.1, roughness=0.35):
    item = material(name, light_color, metallic, roughness)
    nodes = item.node_tree.nodes
    links = item.node_tree.links
    shader = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 7.5
    noise.inputs["Detail"].default_value = 5.0
    noise.inputs["Roughness"].default_value = 0.72
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.28
    ramp.color_ramp.elements[0].color = rgba(dark_color)
    ramp.color_ramp.elements[1].position = 0.78
    ramp.color_ramp.elements[1].color = rgba(light_color)
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.11
    bump.inputs["Distance"].default_value = 0.22
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return item


def assign(obj, item):
    if obj.type == "MESH":
        obj.data.materials.append(item)
    elif obj.type in {"CURVE", "FONT"}:
        obj.data.materials.append(item)


def semantic_descriptor(name):
    rules = (
        ("huihui.body", ("body", "BODY", "ELLIPSOID", "KEEP_SEPARATE", "SMOOTH_ORGANIC")),
        ("huihui.face", ("face", "FACE", "ROUNDED_PRISM", "CONTROLLED_OVERLAP", "CONTROLLED_FILLET")),
        ("huihui.eye", ("face", "FACE", "ELLIPSOID", "RELIEF_ATTACH", "SMOOTH_ORGANIC")),
        ("huihui.mouth", ("face", "FACE", "CURVE_TUBE", "RELIEF_ATTACH", "SMOOTH_ORGANIC")),
        ("huihui.helmet", ("helmet", "HELMET", "COMPOSITE", "CONTROLLED_OVERLAP", "PRESERVE")),
        ("huihui.ear", ("ears", "EAR", "CYLINDER", "CONTROLLED_OVERLAP", "PRESERVE")),
        ("huihui.arm", ("arms", "ARM", "CAPSULE", "EXACT_BOOLEAN_UNION", "SMOOTH_ORGANIC")),
        ("huihui.hand", ("hands", "HAND", "COMPOSITE", "EXACT_BOOLEAN_UNION", "CONTROLLED_FILLET")),
        ("huihui.leg", ("legs", "LEG", "CYLINDER", "EXACT_BOOLEAN_UNION", "SMOOTH_ORGANIC")),
        ("huihui.boot", ("boots", "BOOT", "COMPOSITE", "EXACT_BOOLEAN_UNION", "PRESERVE")),
        ("huihui.chest", ("branding", "BRANDING", "RELIEF", "RELIEF_ATTACH", "PRESERVE")),
    )
    for prefix, descriptor in rules:
        if name.startswith(prefix):
            return descriptor
    return ("auxiliary", "BRANDING", "COMPOSITE", "KEEP_SEPARATE", "PRESERVE")


def mark(obj, group, structural=True):
    part_id, semantic_role, shape_family, join_policy, hard_edge_policy = semantic_descriptor(obj.name)
    obj["print_group"] = group
    obj["print_structural"] = structural
    obj["semantic_part"] = part_id
    obj["semantic_role"] = semantic_role
    obj["shape_family"] = shape_family
    obj["join_policy"] = join_policy
    obj["hard_edge_policy"] = hard_edge_policy
    return obj


def spec_value(spec, section, key, default):
    if not isinstance(spec, dict):
        return default
    value = spec.get(section, {}).get(key, default)
    if isinstance(default, tuple):
        if not isinstance(value, list) or len(value) != len(default):
            return default
        return tuple(float(item) for item in value)
    return value


def smooth(obj):
    if obj.type != "MESH":
        return
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def apply_all_modifiers(obj):
    if obj.type != "MESH":
        return
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def sphere(name, location, scale, item, group, segments=128, rings=64):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    smooth(obj)
    assign(obj, item)
    return mark(obj, group)


def rounded_cube(name, location, dimensions, radius, item, group):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = obj.modifiers.new("Manufacturing fillet", "BEVEL")
    bevel.width = radius
    bevel.segments = 8
    bevel.limit_method = "ANGLE"
    assign(obj, item)
    apply_all_modifiers(obj)
    smooth(obj)
    return mark(obj, group)


def rounded_rect_prism(
    name,
    location,
    width,
    height,
    depth,
    radius,
    item,
    group,
    corner_segments=10,
    wrap_depth=0.0,
):
    """Build a rounded-rectangle prism in the X/Z plane with its depth on Y."""
    radius = min(radius, width * 0.5, height * 0.5)
    x_radius = width * 0.5 - radius
    z_radius = height * 0.5 - radius
    outline = []
    for center_x, center_z, start_angle in (
        (x_radius, z_radius, 0.0),
        (-x_radius, z_radius, 90.0),
        (-x_radius, -z_radius, 180.0),
        (x_radius, -z_radius, 270.0),
    ):
        for index in range(corner_segments + 1):
            angle = math.radians(start_angle + index * 90.0 / corner_segments)
            outline.append(
                (
                    center_x + math.cos(angle) * radius,
                    center_z + math.sin(angle) * radius,
                )
            )

    y_front = -depth * 0.5
    y_back = depth * 0.5
    def wrap(x):
        return wrap_depth * (abs(x) / (width * 0.5)) ** 2

    vertices = (
        [(x, y_front + wrap(x), z) for x, z in outline]
        + [(x, y_back + wrap(x), z) for x, z in outline]
    )
    count = len(outline)
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    for index in range(count):
        next_index = (index + 1) % count
        faces.append((index, next_index, next_index + count, index + count))

    mesh = bpy.data.meshes.new(f"{name}.mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    bevel = obj.modifiers.new("Screen edge roll", "BEVEL")
    bevel.width = 1.15
    bevel.segments = 5
    assign(obj, item)
    apply_all_modifiers(obj)
    smooth(obj)
    return mark(obj, group)


def hardhat_dome(name, location, radii, item, group, segments=128, rings=36):
    """Closed upper ellipsoid, used instead of the v1 full-ellipsoid bowler/UFO helmet."""
    rx, ry, rz = radii
    vertices = []
    for ring in range(rings + 1):
        theta = (math.pi * 0.5) * ring / rings
        sin_theta = math.sin(theta)
        cos_theta = math.cos(theta)
        for segment in range(segments):
            phi = math.tau * segment / segments
            vertices.append(
                (
                    rx * sin_theta * math.cos(phi),
                    ry * sin_theta * math.sin(phi),
                    rz * cos_theta,
                )
            )
    bottom_center_index = len(vertices)
    vertices.append((0.0, 0.0, 0.0))
    faces = []
    for ring in range(rings):
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            current = ring * segments + segment
            next_ring = (ring + 1) * segments + segment
            faces.append(
                (
                    current,
                    ring * segments + next_segment,
                    (ring + 1) * segments + next_segment,
                    next_ring,
                )
            )
    last_ring = rings * segments
    for segment in range(segments):
        faces.append(
            (
                bottom_center_index,
                last_ring + (segment + 1) % segments,
                last_ring + segment,
            )
        )
    mesh = bpy.data.meshes.new(f"{name}.mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    assign(obj, item)
    smooth(obj)
    return mark(obj, group)


def cylinder(name, location, radius, depth, item, group, rotation=(0, 0, 0), vertices=128):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    bevel = obj.modifiers.new("Edge softening", "BEVEL")
    bevel.width = min(radius * 0.16, 1.2)
    bevel.segments = 5
    assign(obj, item)
    apply_all_modifiers(obj)
    smooth(obj)
    return mark(obj, group)


def cylinder_between(name, start, end, radius, item, group, vertices=96):
    start_v = Vector(start)
    end_v = Vector(end)
    direction = end_v - start_v
    obj = cylinder(
        name,
        (start_v + end_v) * 0.5,
        radius,
        direction.length,
        item,
        group,
        vertices=vertices,
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    bpy.context.view_layer.update()
    return obj


def capsule(name, start, end, radius, item, group):
    parts = [
        cylinder_between(f"{name}.shaft", start, end, radius, item, group),
        sphere(f"{name}.start", start, (radius, radius, radius), item, group, 64, 32),
        sphere(f"{name}.end", end, (radius, radius, radius), item, group, 64, 32),
    ]
    return parts


def curve_tube(name, points, radius, item, group, cyclic=False):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 8
    curve.bevel_depth = radius
    curve.bevel_resolution = 6
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    assign(obj, item)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.select_set(False)
    smooth(obj)
    return mark(obj, group)


def text_mesh(name, body, location, size, depth, item, group, align="CENTER"):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = body
    curve.align_x = align
    curve.align_y = "CENTER"
    curve.size = size
    curve.extrude = depth
    curve.bevel_depth = min(depth * 0.18, 0.2)
    curve.bevel_resolution = 3
    if Path(FONT_PATH).exists():
        curve.font = bpy.data.fonts.load(FONT_PATH, check_existing=True)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (math.radians(90), 0, 0)
    assign(obj, item)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.select_set(False)
    return mark(obj, group, structural=True)


def make_materials():
    return {
        "concrete": concrete_material(),
        "aggregate_dark": material("Dark aggregate", "#393A35", 0.0, 0.86),
        "aggregate_warm": material("Warm aggregate", "#9A8062", 0.0, 0.82),
        "yellow": coated_material("Safety yellow paint", "#A96608", "#F2B82D", 0.18, 0.29),
        "yellow_dark": coated_material("Safety yellow shade", "#784A08", "#C47A0B", 0.12, 0.42),
        "rubber": coated_material("Industrial rubber", "#171918", "#333532", 0.06, 0.68),
        "screen": material("Polished face screen", "#050708", 0.52, 0.09),
        "white": material("Warm face white", "#F6F4EA", 0.0, 0.23),
        "navy": material("Brand navy enamel", "#12324A", 0.24, 0.25),
        "brass": material("Brushed brass", "#B98A3B", 0.78, 0.27),
        "sole": material("Boot sole", "#24231F", 0.0, 0.76),
        "base": material("Display base", "#151B20", 0.25, 0.34),
    }


def create_hand(prefix, palm, raised, materials):
    yellow = materials["yellow"]
    objects = [
        sphere(
            f"{prefix}.palm",
            palm,
            (11.8, 9.2, 12.0),
            yellow,
            "yellow",
            96,
            48,
        )
    ]
    x, y, z = palm
    if raised:
        finger_data = [
            ((x - 6.7, y - 0.8, z + 4.0), (x - 7.8, y - 1.0, z + 14.5), 4.35),
            ((x - 2.3, y - 1.2, z + 5.0), (x - 2.5, y - 1.4, z + 17.0), 4.55),
            ((x + 2.4, y - 1.2, z + 5.0), (x + 2.7, y - 1.4, z + 16.5), 4.5),
            ((x + 6.6, y - 0.8, z + 3.8), (x + 7.7, y - 1.0, z + 14.0), 4.3),
            ((x + 8.2, y - 2.0, z - 1.8), (x + 14.3, y - 2.8, z + 2.8), 4.55),
        ]
    else:
        finger_data = [
            ((x - 6.2, y - 1.5, z - 0.5), (x - 7.0, y - 2.0, z - 6.5), 4.8),
            ((x - 1.9, y - 2.0, z - 1.2), (x - 2.1, y - 2.4, z - 7.6), 4.9),
            ((x + 2.7, y - 2.0, z - 1.2), (x + 3.0, y - 2.4, z - 7.2), 4.8),
            ((x + 6.5, y - 1.2, z), (x + 7.2, y - 1.7, z - 5.4), 4.6),
        ]
    for index, (start, end, radius) in enumerate(finger_data):
        objects.extend(capsule(f"{prefix}.finger.{index}", start, end, radius, yellow, "yellow"))
    return objects


def create_concrete_aggregate(materials):
    random.seed(20260727)
    objects = []
    # Raised aggregate flecks are shallow enough to print at 180 mm while preserving the cast-concrete identity.
    for index in range(92):
        angle = random.uniform(math.radians(208), math.radians(332))
        latitude = random.uniform(math.radians(48), math.radians(136))
        x = 55.0 * math.sin(latitude) * math.cos(angle)
        y = 42.0 * math.sin(latitude) * math.sin(angle) - 0.35
        z = 91.0 + 57.0 * math.cos(latitude)
        if z > 130.0 or z < 46.0 or abs(x) > 49.0:
            continue
        radius = random.uniform(0.55, 1.45)
        fleck = sphere(
            f"huihui.concrete.aggregate.{index}",
            (x, y, z),
            (radius, 0.55, radius * random.uniform(0.65, 1.15)),
            materials["aggregate_dark"] if index % 3 else materials["aggregate_warm"],
            "concrete",
            32,
            16,
        )
        fleck["surface_detail"] = True
        objects.append(fleck)
    return objects


def create_helmet_brand(materials):
    objects = []
    plate = rounded_cube(
        "huihui.helmet.brand_plate",
        (0, -41.8, 157.8),
        (44.0, 3.0, 15.5),
        3.0,
        materials["navy"],
        "branding",
    )
    plate.rotation_euler.x = math.radians(-8.0)
    objects.append(plate)
    label = text_mesh(
        "huihui.helmet.brand_text",
        "水泥二厂",
        (0, -44.0, 158.0),
        6.5,
        0.8,
        materials["white"],
        "branding",
    )
    label.rotation_euler.x += math.radians(-8.0)
    objects.append(label)
    for x in (-18.5, 18.5):
        for z in (153.0, 163.0):
            objects.append(
                sphere(
                    f"huihui.helmet.brand_rivet.{x}.{z}",
                    (x, -44.5, z),
                    (1.0, 0.75, 1.0),
                    materials["brass"],
                    "branding",
                    48,
                    24,
                )
            )
    return objects


def create_chest_brand(materials):
    objects = []
    navy = materials["navy"]
    brass = materials["brass"]
    front_y = -44.2
    for index, (x, height) in enumerate(((-5.7, 8.0), (0.0, 11.5), (5.7, 9.2))):
        objects.append(
            rounded_cube(
                f"huihui.chest.silo.{index}",
                (x, front_y - 1.0, 72.0 + height * 0.5),
                (3.8, 2.0, height),
                1.0,
                navy,
                "branding",
            )
        )
        objects.append(
            sphere(
                f"huihui.chest.silo_cap.{index}",
                (x, front_y - 2.1, 72.0 + height),
                (2.15, 0.8, 1.0),
                brass,
                "branding",
                48,
                24,
            )
        )

    gear_center = (7.6, front_y - 1.0, 76.0)
    for index in range(10):
        angle = math.radians(index * 36.0)
        x = gear_center[0] + math.cos(angle) * 7.5
        z = gear_center[2] + math.sin(angle) * 7.5
        tooth = rounded_cube(
            f"huihui.chest.gear_tooth.{index}",
            (x, front_y, z),
            (2.5, 1.8, 3.8),
            0.5,
            brass,
            "branding",
        )
        tooth.rotation_euler.y = -angle
        objects.append(tooth)
    objects.append(
        curve_tube(
            "huihui.chest.gear_arc",
            [
                (1.8, front_y - 2.2, 82.2),
                (7.6, front_y - 2.2, 84.3),
                (13.7, front_y - 2.2, 81.2),
                (15.0, front_y - 2.2, 75.0),
                (11.6, front_y - 2.2, 70.0),
            ],
            1.1,
            brass,
            "branding",
        )
    )
    objects.append(
        curve_tube(
            "huihui.chest.wave",
            [
                (-11.5, front_y - 2.3, 66.0),
                (-3.5, front_y - 2.3, 69.0),
                (4.5, front_y - 2.3, 67.5),
                (12.0, front_y - 2.3, 70.0),
            ],
            1.05,
            brass,
            "branding",
        )
    )
    objects.append(
        text_mesh(
            "huihui.chest.brand_text",
            "水泥二厂",
            (0.0, front_y - 2.4, 57.0),
            4.2,
            0.7,
            navy,
            "branding",
        )
    )
    return objects


def create_huihui(materials, geometry_spec=None):
    objects = []
    concrete = materials["concrete"]
    yellow = materials["yellow"]
    yellow_dark = materials["yellow_dark"]
    rubber = materials["rubber"]
    screen = materials["screen"]
    white = materials["white"]
    sole = materials["sole"]

    # V2 locks silhouette before surface detail. The body is wider and lower than v1,
    # matching the original chubby collectible rather than a generic spherical robot.
    body = sphere(
        "huihui.body",
        spec_value(geometry_spec, "body", "center", (0, 1.0, 91.5)),
        spec_value(geometry_spec, "body", "scale", (62.5, 47.0, 58.5)),
        concrete,
        "concrete",
    )
    concrete_texture = bpy.data.textures.new("Huihui concrete micro relief", type="VORONOI")
    concrete_texture.noise_scale = 3.6
    displacement = body.modifiers.new("Cast concrete micro relief", "DISPLACE")
    displacement.texture = concrete_texture
    displacement.strength = 0.42
    displacement.mid_level = 0.54
    objects.append(body)
    face_center = spec_value(geometry_spec, "face", "center", (0, -45.0, 114.5))
    face_dimensions = spec_value(geometry_spec, "face", "dimensions", (83.0, 6.2, 49.0))
    objects.append(
        rounded_rect_prism(
            "huihui.face",
            face_center,
            face_dimensions[0],
            face_dimensions[2],
            face_dimensions[1],
            float(spec_value(geometry_spec, "face", "radius", 14.0)),
            screen,
            "dark",
        )
    )
    objects.append(sphere("huihui.eye.left", (-17.0, -49.0, 117.0), (5.8, 1.45, 10.5), white, "white"))
    objects.append(sphere("huihui.eye.right", (17.0, -49.0, 117.0), (5.8, 1.45, 10.5), white, "white"))
    objects.append(
        curve_tube(
            "huihui.mouth",
            [
                (-8.8, -49.8, 102.0),
                (-5.6, -50.1, 99.0),
                (0.0, -50.3, 97.8),
                (5.6, -50.1, 99.0),
                (8.8, -49.8, 102.0),
            ],
            1.65,
            white,
            "white",
        )
    )

    ear_center = spec_value(geometry_spec, "ears", "center", (0, 0.0, 111.0))
    ear_dimensions = spec_value(geometry_spec, "ears", "dimensions", (142.0, 18.0, 23.0))
    ear_x = ear_dimensions[0] * 0.5 - ear_dimensions[1] * 0.5
    for side, x in (("left", -ear_x), ("right", ear_x)):
        objects.append(
            cylinder(
                f"huihui.ear.{side}",
                (x, ear_center[1], ear_center[2]),
                ear_dimensions[2] * 0.5,
                ear_dimensions[1] * 0.5,
                rubber,
                "dark",
                rotation=(0, math.radians(90), 0),
            )
        )
        objects.append(
            cylinder(
                f"huihui.ear_cap.{side}",
                (x + (-4.7 if side == "left" else 4.7), ear_center[1], ear_center[2]),
                6.9,
                2.8,
                yellow_dark,
                "yellow",
                rotation=(0, math.radians(90), 0),
            )
        )

    helmet_center = spec_value(geometry_spec, "helmet", "center", (0, 1.5, 146.0))
    helmet_dimensions = spec_value(geometry_spec, "helmet", "dimensions", (117.0, 88.0, 61.0))
    objects.append(
        sphere(
            "huihui.helmet.brim",
            (helmet_center[0], helmet_center[1] - 3.0, helmet_center[2] + 1.0),
            (helmet_dimensions[0] * 0.5, helmet_dimensions[1] * 0.5, 4.0),
            yellow,
            "yellow",
        )
    )
    objects.append(
        hardhat_dome(
            "huihui.helmet.dome",
            helmet_center,
            (
                helmet_dimensions[0] * 0.466,
                helmet_dimensions[1] * 0.472,
                helmet_dimensions[2] * 0.5,
            ),
            yellow,
            "yellow",
        )
    )
    objects.append(
        rounded_cube(
            "huihui.helmet.ridge",
            (0, 4.0, 173.5),
            (10.0, 48.0, 6.0),
            2.8,
            yellow,
            "yellow",
        )
    )
    objects.extend(create_helmet_brand(materials))

    # Short, articulated arms. The right arm is the greeting pose from the approved reference.
    objects.extend(capsule("huihui.arm.left.upper", (-59.0, -1.0, 104.0), (-65.0, -3.0, 91.5), 8.0, rubber, "dark"))
    objects.extend(capsule("huihui.arm.left.lower", (-65.0, -3.0, 91.5), (-65.0, -5.0, 80.5), 7.5, rubber, "dark"))
    objects.extend(create_hand("huihui.hand.left", (-65.0, -6.0, 72.5), False, materials))

    objects.extend(capsule("huihui.arm.right.upper", (59.0, -1.0, 105.0), (64.5, -3.0, 116.0), 8.0, rubber, "dark"))
    objects.extend(capsule("huihui.arm.right.lower", (64.5, -3.0, 116.0), (67.0, -4.0, 126.0), 7.5, rubber, "dark"))
    objects.extend(create_hand("huihui.hand.right", (67.5, -5.5, 135.0), True, materials))

    # Short legs and oversized boots are identity-defining, not generic humanoid proportions.
    leg_center = spec_value(geometry_spec, "legs", "center", (0, 1.0, 36.5))
    leg_dimensions = spec_value(geometry_spec, "legs", "dimensions", (61.0, 18.0, 18.0))
    boot_center = spec_value(geometry_spec, "boots", "center", (0, -8.0, 17.0))
    boot_dimensions = spec_value(geometry_spec, "boots", "dimensions", (92.0, 56.0, 34.0))
    leg_x = max(10.0, (leg_dimensions[0] - leg_dimensions[1]) * 0.5)
    for side, x in (("left", -leg_x), ("right", leg_x)):
        objects.append(
            cylinder(
                f"huihui.leg.{side}",
                (x, leg_center[1], leg_center[2]),
                leg_dimensions[1] * 0.472,
                leg_dimensions[2],
                rubber,
                "dark",
            )
        )
        objects.append(
            sphere(
                f"huihui.boot_toe.{side}",
                (x, boot_center[1] - 2.0, boot_center[2]),
                (
                    boot_dimensions[0] * 0.266,
                    boot_dimensions[1] * 0.527,
                    boot_dimensions[2] * 0.456,
                ),
                yellow,
                "yellow",
            )
        )
        objects.append(
            rounded_cube(
                f"huihui.boot_ankle.{side}",
                (x, 0.0, 28.5),
                (37.5, 34.0, 15.0),
                5.5,
                yellow_dark,
                "yellow",
            )
        )
        objects.append(
            rounded_cube(
                f"huihui.boot_sole.{side}",
                (x, -8.0, 4.8),
                (48.0, 56.0, 8.5),
                4.0,
                sole,
                "dark",
            )
        )
        for lace_index in range(2):
            objects.append(
                rounded_cube(
                    f"huihui.boot_lace.{side}.{lace_index}",
                    (x, -36.0, 22.0 + lace_index * 4.0),
                    (23.0, 2.0, 2.2),
                    0.8,
                    rubber,
                    "dark",
                )
            )

    objects.extend(create_chest_brand(materials))
    return objects


def create_base(materials):
    base = rounded_cube(
        "huihui.display_base",
        (0, 2.0, 0.0),
        (126.0, 94.0, 6.0),
        3.0,
        materials["base"],
        "base",
    )
    base["optional_print_part"] = True
    base["semantic_part"] = "base"
    base["semantic_role"] = "BASE"
    base["shape_family"] = "ROUNDED_PRISM"
    base["join_policy"] = "KEEP_SEPARATE"
    base["hard_edge_policy"] = "PRESERVE"
    return base


def look_at(camera, target):
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_render(materials):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 1600
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.05

    world = bpy.data.worlds.new("Studio world") if scene.world is None else scene.world
    scene.world = world
    world.use_nodes = True
    background = next(
        (node for node in world.node_tree.nodes if node.type == "BACKGROUND"),
        None,
    )
    if background is None:
        background = world.node_tree.nodes.new("ShaderNodeBackground")
    background.inputs["Color"].default_value = rgba("#B8BCC0")
    background.inputs["Strength"].default_value = 0.82

    bpy.ops.mesh.primitive_plane_add(size=700, location=(0, 20, -3.1))
    ground = bpy.context.object
    ground.name = "preview.ground"
    assign(ground, material("Neutral studio floor", "#AAA9A4", 0.0, 0.78))

    for name, location, energy, size, tint in [
        ("Key", (-170, -210, 260), 13000, 130, (1.0, 0.88, 0.72)),
        ("Fill", (170, -80, 180), 9000, 110, (0.70, 0.83, 1.0)),
        ("Rim", (20, 160, 240), 11000, 100, (1.0, 0.94, 0.80)),
    ]:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = tint
        look_at(light, (0, 0, 90))

    bpy.ops.object.light_add(type="SUN", location=(-120, -180, 260))
    sun = bpy.context.object
    sun.name = "Preview sun"
    sun.rotation_euler = (math.radians(24), math.radians(-18), math.radians(-28))
    sun.data.energy = 1.0
    sun.data.angle = math.radians(8.0)

    bpy.ops.object.camera_add(location=(0, -430, 100))
    camera = bpy.context.object
    camera.name = "preview.camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 205.0
    look_at(camera, (0, 0, 90))
    scene.camera = camera
    return camera


def render_views(output, camera):
    scene = bpy.context.scene
    views = {
        "front": ((0, -430, 96), (0, 0, 90)),
        "three-quarter": ((300, -300, 118), (0, 0, 90)),
        "side": ((430, 0, 96), (0, 0, 90)),
        "back": ((0, 430, 96), (0, 0, 90)),
    }
    for name, (location, target) in views.items():
        camera.location = location
        look_at(camera, target)
        scene.render.filepath = str(output / "previews" / f"huihui-{name}.png")
        bpy.ops.render.render(write_still=True)


def select_only(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]


def export_stl(path, objects):
    select_only(objects)
    if hasattr(bpy.ops.wm, "stl_export"):
        bpy.ops.wm.stl_export(
            filepath=str(path),
            export_selected_objects=True,
            apply_modifiers=True,
            ascii_format=False,
        )
    else:
        bpy.ops.export_mesh.stl(filepath=str(path), use_selection=True, use_mesh_modifiers=True)


def duplicate_join(objects, name):
    duplicates = []
    for source in objects:
        if source.type != "MESH":
            continue
        duplicate = source.copy()
        duplicate.data = source.data.copy()
        duplicate.animation_data_clear()
        bpy.context.collection.objects.link(duplicate)
        duplicates.append(duplicate)
    select_only(duplicates)
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return joined


def voxel_union(objects, name, voxel_size):
    joined = duplicate_join(objects, name)
    joined.data.remesh_voxel_size = voxel_size
    joined.data.remesh_voxel_adaptivity = 0.0
    bpy.context.view_layer.objects.active = joined
    joined.select_set(True)
    bpy.ops.object.voxel_remesh()
    smooth(joined)
    return joined


def mesh_report(obj):
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    non_manifold = [edge for edge in bm.edges if not edge.is_manifold]
    boundary = [edge for edge in bm.edges if edge.is_boundary]
    volume = abs(bm.calc_volume(signed=True))
    bm.free()
    return {
        "vertices": len(mesh.vertices),
        "faces": len(mesh.polygons),
        "nonManifoldEdges": len(non_manifold),
        "boundaryEdges": len(boundary),
        "volumeMm3": round(volume, 2),
        "dimensionsMm": [round(value, 2) for value in obj.dimensions],
    }


def assembly_manifest(asset_id, model_objects, base, weld_method):
    items = []
    for obj in model_objects + [base]:
        if obj.type != "MESH":
            continue
        items.append(
            {
                "objectName": obj.name,
                "semanticPart": obj.get("semantic_part", "auxiliary"),
                "semanticRole": obj.get("semantic_role", "BRANDING"),
                "shapeFamily": obj.get("shape_family", "COMPOSITE"),
                "joinPolicy": obj.get("join_policy", "KEEP_SEPARATE"),
                "hardEdgePolicy": obj.get("hard_edge_policy", "PRESERVE"),
                "printGroup": obj.get("print_group"),
                "structural": bool(obj.get("print_structural", True)),
                "locationMm": [round(value, 4) for value in obj.location],
                "dimensionsMm": [round(value, 4) for value in obj.dimensions],
            }
        )
    semantic_parts = sorted({item["semanticPart"] for item in items})
    return {
        "schemaVersion": 1,
        "assetId": asset_id,
        "constructionMode": "GEOMETRY_FIRST",
        "authoritativeMaster": "SEMANTIC_PART_ASSEMBLY",
        "weldMethod": weld_method,
        "globalVoxelMasterForbidden": True,
        "manufacturingUnionStatus": "DEFERRED_EXACT_BOOLEAN_AND_PHYSICAL_PROOF",
        "objectCount": len(items),
        "semanticPartCount": len(semantic_parts),
        "semanticParts": semantic_parts,
        "parts": items,
    }


def export_assets(output, model_objects, base, voxel_size, asset_id, weld_method):
    for obj in model_objects + [base]:
        if obj.type == "MESH":
            apply_all_modifiers(obj)

    select_only(model_objects)
    bpy.ops.export_scene.gltf(
        filepath=str(output / f"{asset_id}-semantic-assembly.glb"),
        export_format="GLB",
        export_animations=False,
        use_selection=True,
        export_apply=True,
    )

    structural = [obj for obj in model_objects if obj.get("print_structural", True)]
    no_base_report = None
    with_base_report = None
    unified_no_base = None
    unified_with_base = None
    if weld_method == "voxel-preview":
        unified_no_base = voxel_union(structural, "huihui.preview.voxel.no_base", voxel_size)
        export_stl(output / "stl" / f"{asset_id}-voxel-preview.stl", [unified_no_base])
        no_base_report = mesh_report(unified_no_base)

        unified_with_base = voxel_union(structural + [base], "huihui.preview.voxel.with_base", voxel_size)
        export_stl(output / "stl" / f"{asset_id}-voxel-preview-with-base.stl", [unified_with_base])
        with_base_report = mesh_report(unified_with_base)

    groups = {}
    for obj in model_objects + [base]:
        group = obj.get("print_group")
        if group:
            groups.setdefault(group, []).append(obj)
    group_files = {}
    for index, group in enumerate(("concrete", "yellow", "dark", "white", "branding", "base"), start=1):
        objects = groups.get(group, [])
        if not objects:
            continue
        path = output / "stl" / "parts" / f"{index:02d}-{group}.stl"
        export_stl(path, objects)
        group_files[group] = str(path.relative_to(output))

    manifest = assembly_manifest(asset_id, model_objects, base, weld_method)
    (output / "semantic-assembly-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    if unified_no_base is not None:
        unified_no_base.hide_render = True
        unified_no_base.hide_viewport = True
    if unified_with_base is not None:
        unified_with_base.hide_render = True
        unified_with_base.hide_viewport = True
    return no_base_report, with_base_report, group_files


def main():
    args = parse_args()
    output = Path(args.output).resolve()
    (output / "previews").mkdir(parents=True, exist_ok=True)
    (output / "stl" / "parts").mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "MILLIMETERS"
    scene.unit_settings.scale_length = 0.001

    workflow = {}
    if args.spec:
        workflow = json.loads(Path(args.spec).resolve().read_text(encoding="utf-8"))
    geometry_spec = workflow.get("geometrySpec", {})
    materials = make_materials()
    model_objects = create_huihui(materials, geometry_spec)
    base = create_base(materials)
    camera = setup_render(materials)

    # Geometry is authored at the approved 180 mm master size. Scale is only used for alternate editions.
    scale_factor = args.height_mm / AUTHORED_HEIGHT_MM
    if abs(scale_factor - 1.0) > 1e-6:
        for obj in model_objects + [base]:
            obj.location *= scale_factor
            obj.scale *= scale_factor
            bpy.context.view_layer.update()

    render_views(output, camera)
    no_base_report, with_base_report, group_files = export_assets(
        output,
        model_objects,
        base,
        args.voxel_mm * scale_factor,
        args.asset_id,
        args.weld_method,
    )
    bpy.ops.wm.save_as_mainfile(filepath=str(output / f"{args.asset_id}-semantic-master.blend"))

    report = {
        "schemaVersion": 1,
        "assetId": args.asset_id,
        "status": "PARAMETRIC_BASELINE_REVIEW_REQUIRED"
        if args.weld_method == "assembly-only"
        else (
            "PREVIEW_READY"
            if with_base_report
            and with_base_report["nonManifoldEdges"] == 0
            and with_base_report["boundaryEdges"] == 0
            else "REVIEW_REQUIRED"
        ),
        "reference": str(Path(args.reference).resolve()),
        "brandReference": str(Path(args.brand_reference).resolve()),
        "modelHeightMm": args.height_mm,
        "voxelResolutionMm": round(args.voxel_mm * scale_factor, 3),
        "constructionMode": "GEOMETRY_FIRST",
        "authoritativeMaster": "SEMANTIC_PART_ASSEMBLY",
        "manufacturingUnionStatus": "DEFERRED_EXACT_BOOLEAN_AND_PHYSICAL_PROOF",
        "globalVoxelMasterForbidden": True,
        "weldMethod": args.weld_method,
        "qualityGates": {
            "semanticPartSeparation": "PASS",
            "globalVoxelMasterRejected": "PASS",
            "multiviewSilhouetteCalibration": "REVIEW_REQUIRED",
            "jointInterfaceInspection": "REVIEW_REQUIRED",
            "hardFeatureRetention": "REVIEW_REQUIRED",
            "exactManufacturingUnion": "HOLD",
            "slicerReview": "HOLD",
            "physicalProof": "HOLD",
        },
        "identityLock": {
            "body": "old-approved extra-wide low concrete egg body",
            "limbs": "short thick articulated arms and legs",
            "boots": "oversized heavy safety-yellow construction boots",
            "pose": "right-hand greeting pose",
            "face": "integrated rounded-rectangle face screen, not an oval",
            "helmet": "compact construction hardhat dome and brim, not a full ellipsoid",
            "helmetMark": "水泥二厂",
            "chestMark": "silo + gear + wave + 水泥二厂",
        },
        "manufacturing": {
            "minimumRaisedDetailMm": 0.85,
            "minimumFingerDiameterMm": 8.6,
            "recommendedResinLayerMm": 0.03,
            "recommendedFdmLayerMm": 0.12,
            "recommendedFdmNozzleMm": 0.4,
            "requiresSupport": True,
            "supportZones": ["raised right hand", "helmet brim", "chin/face panel", "left glove"],
            "solidModel": True,
        },
        "voxelPreviewNoBase": no_base_report,
        "voxelPreviewWithBase": with_base_report,
        "partFiles": group_files,
        "qualityBoundary": (
            "Geometry-first semantic assembly. The Blend and GLB retain named parts and controlled "
            "interfaces as the authoritative master. A voxel output, when explicitly requested, is "
            "only a fit/print preview. Final tooling requires exact manufacturing union, slicer review, "
            "physical proof print and dimensional sign-off."
        ),
    }
    (output / "printability-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("PRINTABILITY_REPORT=" + json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
