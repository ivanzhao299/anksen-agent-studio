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
AUTHORED_HEIGHT_MM = 183.0
FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"


def parse_args():
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--reference", required=True)
    parser.add_argument("--brand-reference", required=True)
    parser.add_argument("--height-mm", type=float, default=MODEL_HEIGHT_MM)
    parser.add_argument("--voxel-mm", type=float, default=0.45)
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
    large_noise.inputs["Scale"].default_value = 0.13
    large_noise.inputs["Detail"].default_value = 7.0
    large_noise.inputs["Roughness"].default_value = 0.72
    large_noise.inputs["Distortion"].default_value = 0.12

    fine_noise = nodes.new("ShaderNodeTexNoise")
    fine_noise.inputs["Scale"].default_value = 0.72
    fine_noise.inputs["Detail"].default_value = 4.0
    fine_noise.inputs["Roughness"].default_value = 0.82

    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "FLOAT"
    mix.inputs[0].default_value = 0.72
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = rgba("#494A45")
    ramp.color_ramp.elements[1].color = rgba("#A49F91")
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.24
    bump.inputs["Distance"].default_value = 0.7

    links.new(large_noise.outputs["Fac"], mix.inputs[2])
    links.new(fine_noise.outputs["Fac"], mix.inputs[3])
    links.new(mix.outputs["Result"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
    links.new(mix.outputs["Result"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return item


def coated_material(name, dark_color, light_color, metallic=0.1, roughness=0.35):
    item = material(name, light_color, metallic, roughness)
    nodes = item.node_tree.nodes
    links = item.node_tree.links
    shader = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 0.42
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


def mark(obj, group, structural=True):
    obj["print_group"] = group
    obj["print_structural"] = structural
    return obj


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
            (12.4, 8.5, 13.0),
            yellow,
            "yellow",
            96,
            48,
        )
    ]
    x, y, z = palm
    if raised:
        finger_data = [
            ((x - 7.0, y - 1.0, z + 4.0), (x - 8.8, y - 1.2, z + 18.5), 3.8),
            ((x - 2.5, y - 1.5, z + 6.0), (x - 2.8, y - 1.8, z + 21.0), 4.0),
            ((x + 2.7, y - 1.5, z + 6.0), (x + 3.2, y - 1.8, z + 20.0), 4.0),
            ((x + 7.0, y - 1.0, z + 4.0), (x + 8.8, y - 1.2, z + 17.0), 3.8),
            ((x + 8.8, y - 3.0, z - 1.5), (x + 16.2, y - 4.0, z + 4.5), 4.1),
        ]
    else:
        finger_data = [
            ((x - 6.5, y - 2.0, z - 1.0), (x - 7.5, y - 2.5, z - 7.5), 4.5),
            ((x - 2.0, y - 2.5, z - 2.0), (x - 2.4, y - 3.0, z - 9.0), 4.6),
            ((x + 2.8, y - 2.5, z - 2.0), (x + 3.2, y - 3.0, z - 8.5), 4.5),
            ((x + 7.0, y - 1.5, z), (x + 8.0, y - 2.0, z - 6.0), 4.3),
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
        (0, -43.7, 160.3),
        (50.0, 3.2, 18.0),
        3.0,
        materials["navy"],
        "branding",
    )
    plate.rotation_euler.x = math.radians(-7.0)
    objects.append(plate)
    label = text_mesh(
        "huihui.helmet.brand_text",
        "水泥二厂",
        (0, -46.1, 160.5),
        7.3,
        0.85,
        materials["white"],
        "branding",
    )
    label.rotation_euler.x += math.radians(-7.0)
    objects.append(label)
    for x in (-21.5, 21.5):
        for z in (154.5, 166.3):
            objects.append(
                sphere(
                    f"huihui.helmet.brand_rivet.{x}.{z}",
                    (x, -46.0, z),
                    (1.2, 0.9, 1.2),
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
    front_y = -42.2
    for index, (x, height) in enumerate(((-6.5, 9.0), (0.0, 13.0), (6.5, 10.5))):
        objects.append(
            rounded_cube(
                f"huihui.chest.silo.{index}",
                (x, front_y - 2.0, 70.5 + height * 0.5),
                (4.4, 2.4, height),
                1.0,
                navy,
                "branding",
            )
        )
        objects.append(
            sphere(
                f"huihui.chest.silo_cap.{index}",
                (x, front_y - 3.4, 70.5 + height),
                (2.5, 1.0, 1.2),
                brass,
                "branding",
                48,
                24,
            )
        )

    gear_center = (8.5, front_y - 2.2, 75.0)
    for index in range(10):
        angle = math.radians(index * 36.0)
        x = gear_center[0] + math.cos(angle) * 8.5
        z = gear_center[2] + math.sin(angle) * 8.5
        tooth = rounded_cube(
            f"huihui.chest.gear_tooth.{index}",
            (x, front_y, z),
            (3.0, 2.0, 4.3),
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
                (2.0, front_y - 3.4, 82.0),
                (8.5, front_y - 3.4, 84.5),
                (15.5, front_y - 3.4, 81.0),
                (17.0, front_y - 3.4, 74.0),
                (13.0, front_y - 3.4, 68.5),
            ],
            1.35,
            brass,
            "branding",
        )
    )
    objects.append(
        curve_tube(
            "huihui.chest.wave",
            [
                (-13.0, front_y - 3.5, 64.5),
                (-4.0, front_y - 3.5, 68.0),
                (5.0, front_y - 3.5, 66.2),
                (13.5, front_y - 3.5, 69.0),
            ],
            1.25,
            brass,
            "branding",
        )
    )
    objects.append(
        text_mesh(
            "huihui.chest.brand_text",
            "水泥二厂",
            (0.0, front_y - 3.5, 51.5),
            4.8,
            0.75,
            navy,
            "branding",
        )
    )
    return objects


def create_huihui(materials):
    objects = []
    concrete = materials["concrete"]
    yellow = materials["yellow"]
    yellow_dark = materials["yellow_dark"]
    rubber = materials["rubber"]
    screen = materials["screen"]
    white = materials["white"]
    sole = materials["sole"]

    # The proportions are locked to the approved old Huihui silhouette:
    # 58% of visible height is the round body/head mass, limbs are short, and boots are oversized.
    objects.append(sphere("huihui.body", (0, 0, 91.0), (56.5, 43.5, 58.5), concrete, "concrete"))
    objects.extend(create_concrete_aggregate(materials))
    objects.append(
        sphere(
            "huihui.face",
            (0, -40.8, 113.0),
            (42.5, 5.6, 27.0),
            screen,
            "dark",
        )
    )
    objects.append(sphere("huihui.eye.left", (-17.0, -46.0, 116.0), (6.2, 1.55, 11.0), white, "white"))
    objects.append(sphere("huihui.eye.right", (17.0, -46.0, 116.0), (6.2, 1.55, 11.0), white, "white"))
    objects.append(
        curve_tube(
            "huihui.mouth",
            [
                (-9.5, -46.7, 101.0),
                (-6.0, -47.1, 97.7),
                (0.0, -47.4, 96.2),
                (6.0, -47.1, 97.7),
                (9.5, -46.7, 101.0),
            ],
            1.9,
            white,
            "white",
        )
    )

    for side, x in (("left", -57.0), ("right", 57.0)):
        objects.append(
            cylinder(
                f"huihui.ear.{side}",
                (x, -2.0, 111.0),
                12.5,
                10.0,
                rubber,
                "dark",
                rotation=(0, math.radians(90), 0),
            )
        )
        objects.append(
            cylinder(
                f"huihui.ear_cap.{side}",
                (x + (-5.0 if side == "left" else 5.0), -2.0, 111.0),
                7.7,
                3.0,
                yellow_dark,
                "yellow",
                rotation=(0, math.radians(90), 0),
            )
        )

    objects.append(sphere("huihui.helmet.brim", (0, -1.5, 149.0), (61.0, 46.5, 5.5), yellow, "yellow"))
    objects.append(sphere("huihui.helmet.dome", (0, 2.5, 159.0), (55.0, 42.5, 24.5), yellow, "yellow"))
    objects.append(
        rounded_cube(
            "huihui.helmet.ridge",
            (0, 5.0, 176.0),
            (14.0, 38.0, 7.0),
            3.5,
            yellow,
            "yellow",
        )
    )
    objects.extend(create_helmet_brand(materials))

    # Short, articulated arms. The right arm is the greeting pose from the approved reference.
    objects.extend(capsule("huihui.arm.left.upper", (-54.0, -1.0, 102.0), (-65.0, -3.0, 85.0), 7.9, rubber, "dark"))
    objects.extend(capsule("huihui.arm.left.lower", (-65.0, -3.0, 85.0), (-66.5, -5.0, 70.0), 7.4, rubber, "dark"))
    objects.extend(create_hand("huihui.hand.left", (-67.0, -6.0, 61.0), False, materials))

    objects.extend(capsule("huihui.arm.right.upper", (54.0, -1.0, 105.0), (64.0, -3.0, 119.0), 7.9, rubber, "dark"))
    objects.extend(capsule("huihui.arm.right.lower", (64.0, -3.0, 119.0), (69.0, -4.0, 131.0), 7.4, rubber, "dark"))
    objects.extend(create_hand("huihui.hand.right", (70.0, -5.0, 139.0), True, materials))

    # Short legs and oversized boots are identity-defining, not generic humanoid proportions.
    for side, x in (("left", -22.0), ("right", 22.0)):
        objects.append(
            cylinder(
                f"huihui.leg.{side}",
                (x, 0.0, 35.0),
                8.2,
                25.0,
                rubber,
                "dark",
            )
        )
        objects.append(
            sphere(
                f"huihui.boot_toe.{side}",
                (x, -10.0, 17.0),
                (23.0, 29.0, 15.0),
                yellow,
                "yellow",
            )
        )
        objects.append(
            rounded_cube(
                f"huihui.boot_ankle.{side}",
                (x, 1.0, 28.5),
                (36.0, 35.0, 17.0),
                6.0,
                yellow_dark,
                "yellow",
            )
        )
        objects.append(
            rounded_cube(
                f"huihui.boot_sole.{side}",
                (x, -8.0, 4.8),
                (46.0, 57.0, 8.5),
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
    return base


def look_at(camera, target):
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_render(materials):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1600
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.4

    world = bpy.data.worlds.new("Studio world") if scene.world is None else scene.world
    scene.world = world
    world.use_nodes = True
    background = next(
        (node for node in world.node_tree.nodes if node.type == "BACKGROUND"),
        None,
    )
    if background is None:
        background = world.node_tree.nodes.new("ShaderNodeBackground")
    background.inputs["Color"].default_value = rgba("#6E7780")
    background.inputs["Strength"].default_value = 0.72

    bpy.ops.mesh.primitive_plane_add(size=700, location=(0, 20, -3.1))
    ground = bpy.context.object
    ground.name = "preview.ground"
    assign(ground, material("Warm studio floor", "#4B4944", 0.0, 0.76))

    for name, location, energy, size, tint in [
        ("Key", (-170, -210, 260), 18000, 130, (1.0, 0.80, 0.60)),
        ("Fill", (170, -80, 180), 12000, 110, (0.58, 0.76, 1.0)),
        ("Rim", (20, 160, 240), 15000, 100, (1.0, 0.92, 0.74)),
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
    sun.data.energy = 1.45
    sun.data.angle = math.radians(8.0)

    bpy.ops.object.camera_add(location=(235, -390, 145))
    camera = bpy.context.object
    camera.name = "preview.camera"
    camera.data.lens = 65
    look_at(camera, (0, 0, 88))
    scene.camera = camera
    return camera


def render_views(output, camera):
    scene = bpy.context.scene
    views = {
        "front": ((0, -430, 106), (0, 0, 88)),
        "three-quarter": ((235, -390, 145), (0, 0, 88)),
        "side": ((430, -12, 112), (0, 0, 88)),
        "back": ((0, 430, 112), (0, 0, 88)),
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


def export_assets(output, model_objects, base, voxel_size):
    for obj in model_objects + [base]:
        if obj.type == "MESH":
            apply_all_modifiers(obj)

    select_only(model_objects)
    bpy.ops.export_scene.gltf(
        filepath=str(output / "huihui-printable-color.glb"),
        export_format="GLB",
        export_animations=False,
        use_selection=True,
        export_apply=True,
    )

    structural = [obj for obj in model_objects if obj.get("print_structural", True)]
    unified_no_base = voxel_union(structural, "huihui.print.unified.no_base", voxel_size)
    export_stl(output / "stl" / "huihui-unified-180mm.stl", [unified_no_base])
    no_base_report = mesh_report(unified_no_base)

    unified_with_base = voxel_union(structural + [base], "huihui.print.unified.with_base", voxel_size)
    export_stl(output / "stl" / "huihui-unified-with-base-180mm.stl", [unified_with_base])
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

    unified_no_base.hide_render = True
    unified_no_base.hide_viewport = True
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

    materials = make_materials()
    model_objects = create_huihui(materials)
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
    )
    bpy.ops.wm.save_as_mainfile(filepath=str(output / "huihui-printable-master.blend"))

    report = {
        "schemaVersion": 1,
        "assetId": "huihui-printable-v1",
        "status": "PASS"
        if with_base_report["nonManifoldEdges"] == 0 and with_base_report["boundaryEdges"] == 0
        else "REVIEW_REQUIRED",
        "reference": str(Path(args.reference).resolve()),
        "brandReference": str(Path(args.brand_reference).resolve()),
        "modelHeightMm": args.height_mm,
        "voxelResolutionMm": round(args.voxel_mm * scale_factor, 3),
        "identityLock": {
            "body": "old-approved rounded concrete egg body",
            "limbs": "short articulated arms and legs",
            "boots": "oversized safety-yellow boots",
            "pose": "right-hand greeting pose",
            "helmetMark": "水泥二厂",
            "chestMark": "silo + gear + wave + 水泥二厂",
        },
        "manufacturing": {
            "minimumRaisedDetailMm": 0.85,
            "minimumFingerDiameterMm": 6.8,
            "recommendedResinLayerMm": 0.03,
            "recommendedFdmLayerMm": 0.12,
            "recommendedFdmNozzleMm": 0.4,
            "requiresSupport": True,
            "supportZones": ["raised right hand", "helmet brim", "chin/face panel", "left glove"],
            "solidModel": True,
        },
        "unifiedNoBase": no_base_report,
        "unifiedWithBase": with_base_report,
        "partFiles": group_files,
        "qualityBoundary": (
            "High-resolution printable reconstruction from approved front/turnaround artwork. "
            "Final tooling or mass production still requires a physical proof print and dimensional sign-off."
        ),
    }
    (output / "printability-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("PRINTABILITY_REPORT=" + json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
