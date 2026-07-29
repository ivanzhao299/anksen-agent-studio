import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def args_after_double_dash():
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--turntables-only", action="store_true")
    return parser.parse_args(values)


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def hex_color(value):
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) / 255.0 for index in (0, 2, 4)) + (1.0,)


def material(name, color, metallic=0.0, roughness=0.45, emission=None, emission_strength=0.0):
    item = bpy.data.materials.new(name)
    item.diffuse_color = color
    item.use_nodes = True
    principled = item.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    if emission is not None:
        principled.inputs["Emission Color"].default_value = emission
        principled.inputs["Emission Strength"].default_value = emission_strength
    return item


def apply_material(obj, mat):
    if obj.data and hasattr(obj.data, "materials"):
        obj.data.materials.append(mat)


def smooth(obj):
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def add_empty(name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.location = location
    if parent:
        parent_keep_transform(obj, parent)
    return obj


def parent_keep_transform(obj, parent):
    matrix = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = matrix


def add_cube(name, location, scale, mat, bevel=0.08, parent=None):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Soft edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    apply_material(obj, mat)
    if parent:
        parent_keep_transform(obj, parent)
    return obj


def add_sphere(name, location, scale, mat, parent=None, segments=32, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    smooth(obj)
    apply_material(obj, mat)
    if parent:
        parent_keep_transform(obj, parent)
    return obj


def add_cylinder(name, location, radius, depth, mat, parent=None, rotation=(0, 0, 0), vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    smooth(obj)
    apply_material(obj, mat)
    if parent:
        parent_keep_transform(obj, parent)
    return obj


def add_torus(name, location, major_radius, minor_radius, mat, parent=None, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=40,
        minor_segments=12,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    smooth(obj)
    apply_material(obj, mat)
    if parent:
        parent_keep_transform(obj, parent)
    return obj


def add_mouth(name, location, parent, mat, scale=1.0):
    width = 0.22 * scale
    height = 0.035 * scale
    vertices = [(-width, 0, -height), (width, 0, -height), (width, 0, height), (-width, 0, height)]
    mesh = bpy.data.meshes.new(f"{name}.mesh")
    mesh.from_pydata(vertices, [], [(0, 1, 2, 3)])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    parent_keep_transform(obj, parent)
    apply_material(obj, mat)
    obj.shape_key_add(name="Basis")
    shapes = {
        "AI": (1.0, 3.6),
        "E": (1.2, 2.15),
        "EE": (1.5, 1.5),
        "O": (0.55, 4.2),
        "U": (0.45, 3.2),
        "MBP": (1.0, 0.15),
        "FV": (1.15, 0.65),
        "L": (0.9, 2.4),
        "WQ": (0.6, 2.6),
    }
    for shape_name, (x_scale, z_scale) in shapes.items():
        key = obj.shape_key_add(name=shape_name)
        for index, vertex in enumerate(key.data):
            basis = vertices[index]
            vertex.co.x = basis[0] * x_scale
            vertex.co.z = basis[2] * z_scale
    return obj


def limb_control(name, pivot, length, radius, mat, parent):
    control = add_empty(name, pivot, parent)
    local_center = (0, 0, -length / 2)
    add_cylinder(
        f"{name}.segment",
        tuple(Vector(pivot) + Vector(local_center)),
        radius,
        length,
        mat,
        parent=control,
    )
    return control


def create_common_rig(asset_id, origin):
    root = add_empty(f"{asset_id}.root", origin)
    root["asset_id"] = asset_id
    root["rig_version"] = "anksen-hierarchy-rig-v1"
    return {
        "root": root,
        "controls": {},
        "mouth": None,
        "collection": bpy.context.collection,
    }


def create_robot(asset, materials, origin):
    asset_id = asset["assetId"]
    rig = create_common_rig(asset_id, origin)
    root = rig["root"]
    concrete, yellow, dark, face, white = (
        materials["concrete"],
        materials["yellow"],
        materials["dark"],
        materials["face"],
        materials["white"],
    )
    body = add_sphere(f"{asset_id}.body", (origin[0], origin[1], 1.35), (0.72, 0.55, 0.82), concrete, root)
    add_torus(f"{asset_id}.waist", (origin[0], origin[1], 1.16), 0.55, 0.055, dark, root)
    head_control = add_empty(f"{asset_id}.head.ctrl", (origin[0], origin[1], 2.18), root)
    rig["controls"]["head"] = head_control
    add_sphere(f"{asset_id}.head", (origin[0], origin[1], 2.18), (0.68, 0.52, 0.54), concrete, head_control)
    add_cube(f"{asset_id}.screen", (origin[0], origin[1] - 0.48, 2.18), (0.46, 0.035, 0.29), face, 0.13, head_control)
    for x in (-0.19, 0.19):
        add_sphere(f"{asset_id}.eye.{x}", (origin[0] + x, origin[1] - 0.525, 2.25), (0.055, 0.025, 0.085), white, head_control)
    rig["mouth"] = add_mouth(f"{asset_id}.mouth", (origin[0], origin[1] - 0.535, 2.05), head_control, white, 0.75)
    add_cylinder(f"{asset_id}.helmet", (origin[0], origin[1], 2.62), 0.72, 0.22, yellow, root)
    add_sphere(f"{asset_id}.helmet.dome", (origin[0], origin[1], 2.68), (0.63, 0.52, 0.26), yellow, root)
    for side, x in (("L", -0.78), ("R", 0.78)):
        control = limb_control(f"{asset_id}.arm.{side}", (origin[0] + x, origin[1], 1.72), 0.82, 0.11, yellow, root)
        rig["controls"][f"arm.{side}"] = control
        add_sphere(f"{asset_id}.hand.{side}", (origin[0] + x, origin[1], 0.88), (0.15, 0.15, 0.15), yellow, control)
    for side, x in (("L", -0.32), ("R", 0.32)):
        control = limb_control(f"{asset_id}.leg.{side}", (origin[0] + x, origin[1], 0.75), 0.55, 0.12, dark, root)
        rig["controls"][f"leg.{side}"] = control
        add_cube(f"{asset_id}.boot.{side}", (origin[0] + x, origin[1] - 0.08, 0.16), (0.22, 0.34, 0.14), yellow, 0.1, root)
    return rig


def create_boy(asset, materials, origin):
    asset_id = asset["assetId"]
    rig = create_common_rig(asset_id, origin)
    root = rig["root"]
    skin, hair, denim, scarf, white, dark = (
        materials["skin"],
        materials["hair"],
        materials["denim"],
        materials["scarf"],
        materials["white"],
        materials["dark"],
    )
    add_cube(f"{asset_id}.torso", (origin[0], origin[1], 1.35), (0.42, 0.27, 0.55), denim, 0.18, root)
    add_cube(f"{asset_id}.bib", (origin[0], origin[1] - 0.285, 1.48), (0.28, 0.035, 0.28), materials["blue"], 0.04, root)
    head_control = add_empty(f"{asset_id}.head.ctrl", (origin[0], origin[1], 2.25), root)
    rig["controls"]["head"] = head_control
    add_sphere(f"{asset_id}.head", (origin[0], origin[1], 2.25), (0.58, 0.48, 0.62), skin, head_control)
    for x in (-0.18, 0.18):
        add_sphere(f"{asset_id}.eye.{x}", (origin[0] + x, origin[1] - 0.465, 2.33), (0.055, 0.025, 0.09), dark, head_control)
    rig["mouth"] = add_mouth(f"{asset_id}.mouth", (origin[0], origin[1] - 0.49, 2.1), head_control, dark, 0.85)
    for index, (x, z, scale) in enumerate(
        [(-0.42, 2.64, 0.24), (-0.18, 2.78, 0.3), (0.1, 2.81, 0.26), (0.38, 2.66, 0.22)]
    ):
        add_sphere(f"{asset_id}.hair.{index}", (origin[0] + x, origin[1] + 0.02, z), (scale, 0.22, scale), hair, root)
    add_torus(f"{asset_id}.scarf", (origin[0], origin[1], 1.78), 0.37, 0.09, scarf, root)
    for side, x in (("L", -0.55), ("R", 0.55)):
        control = limb_control(f"{asset_id}.arm.{side}", (origin[0] + x, origin[1], 1.62), 0.82, 0.09, skin, root)
        rig["controls"][f"arm.{side}"] = control
        add_sphere(f"{asset_id}.hand.{side}", (origin[0] + x, origin[1], 0.76), (0.12, 0.12, 0.12), skin, control)
    for side, x in (("L", -0.22), ("R", 0.22)):
        control = limb_control(f"{asset_id}.leg.{side}", (origin[0] + x, origin[1], 0.86), 0.66, 0.12, denim, root)
        rig["controls"][f"leg.{side}"] = control
        add_cube(f"{asset_id}.shoe.{side}", (origin[0] + x, origin[1] - 0.1, 0.14), (0.19, 0.32, 0.13), materials["orange"], 0.08, root)
    return rig


def create_mixer(asset, materials, origin):
    asset_id = asset["assetId"]
    rig = create_common_rig(asset_id, origin)
    root = rig["root"]
    white, orange, blue, dark = materials["white"], materials["orange"], materials["blue"], materials["dark"]
    body_control = add_empty(f"{asset_id}.body.ctrl", (origin[0], origin[1], 1.3), root)
    rig["controls"]["body"] = body_control
    add_sphere(f"{asset_id}.drum", (origin[0], origin[1], 1.35), (0.78, 0.56, 0.72), white, body_control)
    add_torus(f"{asset_id}.band", (origin[0], origin[1], 1.35), 0.65, 0.12, orange, body_control, rotation=(math.radians(90), 0, 0))
    for x in (-0.22, 0.22):
        add_sphere(f"{asset_id}.eye.{x}", (origin[0] + x, origin[1] - 0.53, 1.52), (0.07, 0.025, 0.1), dark, body_control)
    rig["mouth"] = add_mouth(f"{asset_id}.mouth", (origin[0], origin[1] - 0.56, 1.25), body_control, dark, 1.0)
    for side, x in (("L", -0.56), ("R", 0.56)):
        add_cylinder(
            f"{asset_id}.wheel.{side}",
            (origin[0] + x, origin[1], 0.42),
            0.27,
            0.18,
            dark,
            root,
            rotation=(0, math.radians(90), 0),
        )
    add_cube(f"{asset_id}.chassis", (origin[0], origin[1], 0.5), (0.64, 0.4, 0.12), blue, 0.08, root)
    for side, x in (("L", -0.82), ("R", 0.82)):
        control = limb_control(f"{asset_id}.arm.{side}", (origin[0] + x, origin[1], 1.48), 0.68, 0.08, blue, root)
        rig["controls"][f"arm.{side}"] = control
    return rig


def create_tower(asset, materials, origin):
    asset_id = asset["assetId"]
    rig = create_common_rig(asset_id, origin)
    root = rig["root"]
    brick, scarf, skin, white, dark = (
        materials["brick"],
        materials["scarf"],
        materials["skin"],
        materials["white"],
        materials["dark"],
    )
    add_cylinder(f"{asset_id}.tower", (origin[0], origin[1], 1.25), 0.66, 2.25, brick, root)
    head_control = add_empty(f"{asset_id}.head.ctrl", (origin[0], origin[1], 2.08), root)
    rig["controls"]["head"] = head_control
    for x in (-0.2, 0.2):
        add_torus(
            f"{asset_id}.glasses.{x}",
            (origin[0] + x, origin[1] - 0.65, 2.24),
            0.15,
            0.035,
            dark,
            head_control,
            rotation=(math.radians(90), 0, 0),
        )
        add_sphere(f"{asset_id}.eye.{x}", (origin[0] + x, origin[1] - 0.66, 2.24), (0.04, 0.02, 0.06), dark, head_control)
    add_sphere(f"{asset_id}.nose", (origin[0], origin[1] - 0.7, 2.05), (0.12, 0.08, 0.11), skin, head_control)
    for x in (-0.13, 0.13):
        add_sphere(f"{asset_id}.moustache.{x}", (origin[0] + x, origin[1] - 0.7, 1.93), (0.22, 0.055, 0.1), white, head_control)
    rig["mouth"] = add_mouth(f"{asset_id}.mouth", (origin[0], origin[1] - 0.71, 1.82), head_control, dark, 0.7)
    add_torus(f"{asset_id}.scarf", (origin[0], origin[1], 1.55), 0.58, 0.1, scarf, root)
    add_cylinder(f"{asset_id}.roof", (origin[0], origin[1], 2.52), 0.78, 0.2, dark, root)
    for side, x in (("L", -0.77), ("R", 0.77)):
        control = limb_control(f"{asset_id}.arm.{side}", (origin[0] + x, origin[1], 1.62), 0.72, 0.09, skin, root)
        rig["controls"][f"arm.{side}"] = control
    return rig


def create_character(asset, materials, origin):
    archetype = asset["archetype"]
    if archetype == "robot":
        return create_robot(asset, materials, origin)
    if archetype == "boy":
        return create_boy(asset, materials, origin)
    if archetype == "mixer":
        return create_mixer(asset, materials, origin)
    if archetype == "water-tower":
        return create_tower(asset, materials, origin)
    raise ValueError(f"Unsupported archetype: {archetype}")


def create_factory_scene(scene_manifest, materials):
    layout = scene_manifest["layout"]
    width = layout["width"]
    depth = layout["depth"]
    add_cube("scene.ground", (0, 2, -0.22), (width / 2, depth / 2, 0.2), materials["ground"], 0.02)
    add_cube("scene.walkway", (0, -1, -0.01), (width / 2 - 1, 2.2, 0.04), materials["walkway"], 0.03)
    for index in range(layout.get("buildingCount", 3)):
        x = -7 + index * 6.8
        add_cube(
            f"scene.building.{index}",
            (x, 5.5 + (index % 2) * 1.3, 2.1),
            (2.5, 1.6, 2.1 + index * 0.35),
            materials["building"],
            0.12,
        )
        for window_index in range(4):
            add_cube(
                f"scene.building.{index}.window.{window_index}",
                (x - 1.5 + window_index, 3.88 + (index % 2) * 1.3, 2.2),
                (0.28, 0.025, 0.55),
                materials["window"],
                0.02,
            )
    for index in range(layout.get("siloCount", 3)):
        x = 3.2 + index * 2.2
        add_cylinder(f"scene.silo.{index}", (x, 6.2, 3.0), 0.9, 5.8, materials["silo"])
        add_cylinder(f"scene.silo.cap.{index}", (x, 6.2, 6.0), 1.0, 0.2, materials["dark"])
    pipe = add_cylinder(
        "scene.memory-pipe",
        (0.7, -0.3, 1.05),
        0.13,
        8.0,
        materials["pipe"],
        rotation=(0, math.radians(90), 0),
    )
    add_torus("scene.memory-joint", (0.7, -0.3, 1.05), 0.26, 0.07, materials["memory"], rotation=(0, math.radians(90), 0))
    for index in range(9):
        add_sphere(
            f"scene.memory-node.{index}",
            (-3.2 + index * 0.95, -0.3, 1.05),
            (0.055, 0.055, 0.055),
            materials["memory"],
        )
    for index, x in enumerate((-8.0, -5.5, 7.8)):
        add_cylinder(f"scene.tree.trunk.{index}", (x, 7.8, 0.9), 0.18, 1.8, materials["wood"])
        add_sphere(f"scene.tree.crown.{index}", (x, 7.8, 2.2), (1.1, 0.9, 1.2), materials["green"])
    return {"pipe": pipe}


def set_linear_interpolation(obj):
    if not obj.animation_data or not obj.animation_data.action:
        return
    for curve in obj.animation_data.action.fcurves:
        for point in curve.keyframe_points:
            point.interpolation = "BEZIER"


def keyframe_transform(obj, frame, location=None, rotation=None, scale=None):
    if location is not None:
        obj.location = location
        obj.keyframe_insert("location", frame=frame)
    if rotation is not None:
        obj.rotation_euler = rotation
        obj.keyframe_insert("rotation_euler", frame=frame)
    if scale is not None:
        obj.scale = scale
        obj.keyframe_insert("scale", frame=frame)


def frame_at(seconds, fps):
    return max(1, int(round(seconds * fps)) + 1)


def animate_visemes(rig, tracks, fps):
    mouth = rig["mouth"]
    if mouth is None or mouth.data.shape_keys is None:
        return
    shape_names = [name for name in mouth.data.shape_keys.key_blocks.keys() if name != "Basis"]
    for track in tracks:
        for event in track["visemes"]:
            frame = frame_at(event["time"], fps)
            for name in shape_names:
                key = mouth.data.shape_keys.key_blocks.get(name)
                key.value = event["value"] if name == event["viseme"] else 0.0
                key.keyframe_insert("value", frame=frame)
    action = mouth.data.shape_keys.animation_data.action if mouth.data.shape_keys.animation_data else None
    if action:
        for curve in action.fcurves:
            for point in curve.keyframe_points:
                point.interpolation = "BEZIER"


def animate_performance(rigs, story):
    fps = story["fps"]
    end_frame = frame_at(story["duration"], fps)
    erbao = rigs.get("erbao")
    huihui = rigs.get("huihui")
    xiaoban = rigs.get("xiaoban")
    grandpa = rigs.get("grandpa")
    if erbao:
        root = erbao["root"]
        base = root.location.copy()
        keyframe_transform(root, frame_at(0, fps), location=(base.x - 5.2, base.y, base.z))
        keyframe_transform(root, frame_at(2.4, fps), location=(base.x, base.y, base.z))
        keyframe_transform(root, frame_at(3.2, fps), location=(base.x + 0.3, base.y, base.z))
        for step in range(7):
            frame = frame_at(0.25 + step * 0.33, fps)
            swing = math.radians(28 if step % 2 == 0 else -28)
            erbao["controls"]["arm.L"].rotation_euler.y = swing
            erbao["controls"]["arm.R"].rotation_euler.y = -swing
            erbao["controls"]["leg.L"].rotation_euler.y = -swing * 0.7
            erbao["controls"]["leg.R"].rotation_euler.y = swing * 0.7
            for name in ("arm.L", "arm.R", "leg.L", "leg.R"):
                erbao["controls"][name].keyframe_insert("rotation_euler", frame=frame)
        keyframe_transform(erbao["controls"]["arm.R"], frame_at(3.0, fps), rotation=(0, math.radians(-15), math.radians(-75)))
    if huihui:
        root = huihui["root"]
        base = root.location.copy()
        keyframe_transform(root, frame_at(0, fps), location=(base.x + 3.0, base.y + 1.2, base.z))
        keyframe_transform(root, frame_at(3.5, fps), location=(base.x + 3.0, base.y + 1.2, base.z))
        keyframe_transform(root, frame_at(5.0, fps), location=(base.x, base.y, base.z))
        keyframe_transform(root, frame_at(6.2, fps), location=(base.x, base.y, base.z - 0.35))
        for index in range(5):
            frame = frame_at(5.9 + index * 0.28, fps)
            angle = math.radians(38 if index % 2 == 0 else -20)
            keyframe_transform(huihui["controls"]["arm.R"], frame, rotation=(angle, 0, math.radians(24)))
    if xiaoban:
        root = xiaoban["root"]
        base = root.location.copy()
        keyframe_transform(root, frame_at(0, fps), location=(base.x + 5.5, base.y + 0.3, base.z))
        keyframe_transform(root, frame_at(7.0, fps), location=(base.x + 5.5, base.y + 0.3, base.z))
        keyframe_transform(root, frame_at(8.5, fps), location=(base.x, base.y, base.z))
        for index in range(4):
            frame = frame_at(8.6 + index * 0.32, fps)
            keyframe_transform(
                xiaoban["controls"]["body"],
                frame,
                rotation=(0, 0, math.radians(5 if index % 2 == 0 else -5)),
            )
    if grandpa:
        root = grandpa["root"]
        base = root.location.copy()
        keyframe_transform(root, frame_at(0, fps), location=(base.x + 4.0, base.y + 2.0, base.z))
        keyframe_transform(root, frame_at(10.0, fps), location=(base.x + 4.0, base.y + 2.0, base.z))
        keyframe_transform(root, frame_at(11.4, fps), location=(base.x, base.y, base.z))
        keyframe_transform(grandpa["controls"]["arm.R"], frame_at(11.8, fps), rotation=(0, 0, math.radians(-10)))
        keyframe_transform(grandpa["controls"]["arm.R"], frame_at(12.6, fps), rotation=(math.radians(15), 0, math.radians(-105)))
        keyframe_transform(grandpa["controls"]["arm.R"], end_frame, rotation=(math.radians(6), 0, math.radians(-55)))
    for rig in rigs.values():
        for control in [rig["root"], *rig["controls"].values()]:
            set_linear_interpolation(control)


def look_at(camera, target):
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def keyframe_camera(camera, frame, location, target, lens):
    camera.location = location
    look_at(camera, target)
    camera.data.lens = lens
    camera.keyframe_insert("location", frame=frame)
    camera.keyframe_insert("rotation_euler", frame=frame)
    camera.data.keyframe_insert("lens", frame=frame)


def animate_camera(camera, story):
    fps = story["fps"]
    keyframe_camera(camera, frame_at(0, fps), (9.5, -16.5, 6.4), (0, 0.6, 1.45), 48)
    keyframe_camera(camera, frame_at(3.2, fps), (4.4, -11.8, 4.1), (0, 0.2, 1.5), 56)
    keyframe_camera(camera, frame_at(6.5, fps), (2.8, -8.2, 3.0), (0.8, -0.1, 1.3), 65)
    keyframe_camera(camera, frame_at(9.6, fps), (-0.8, -6.3, 2.35), (0.6, -0.15, 1.15), 72)
    keyframe_camera(camera, frame_at(11.0, fps), (-7.5, -11.0, 3.2), (-0.2, 0.5, 1.45), 50)
    keyframe_camera(camera, frame_at(story["duration"], fps), (8.8, -15.8, 6.0), (0, 1.1, 1.6), 44)
    set_linear_interpolation(camera)


def create_lighting(materials):
    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new("Digital Human World")
        bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.045, 0.075, 0.12, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.28
    bpy.ops.object.light_add(type="SUN", location=(4, -6, 10))
    sun = bpy.context.object
    sun.name = "lighting.sun"
    sun.data.energy = 2.4
    sun.data.angle = math.radians(18)
    sun.rotation_euler = (math.radians(28), math.radians(-22), math.radians(-28))
    bpy.ops.object.light_add(type="AREA", location=(-4, -5, 7))
    key = bpy.context.object
    key.name = "lighting.key"
    key.data.energy = 1100
    key.data.shape = "DISK"
    key.data.size = 6
    key.data.color = (0.62, 0.82, 1.0)
    look_at(key, (0, 1, 1.2))
    bpy.ops.object.light_add(type="AREA", location=(6, 3, 5))
    rim = bpy.context.object
    rim.name = "lighting.rim"
    rim.data.energy = 950
    rim.data.size = 5
    rim.data.color = (1.0, 0.62, 0.23)
    look_at(rim, (0, 0, 1.5))


def configure_scene(story, output_root):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = story["resolution"]["width"]
    scene.render.resolution_y = story["resolution"]["height"]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.ffmpeg.format = "MPEG4"
    scene.render.ffmpeg.codec = "H264"
    scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
    scene.render.ffmpeg.ffmpeg_preset = "GOOD"
    scene.render.fps = story["fps"]
    scene.frame_start = 1
    scene.frame_end = frame_at(story["duration"], story["fps"])
    scene.render.filepath = str(output_root / "visual.mp4")
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGB"
    scene.view_settings.look = "AgX - Medium High Contrast"


def export_scene(output_root, rigs):
    master = output_root / "digital-human-master.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(master))
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=str(output_root / "scene.glb"), export_format="GLB", export_animations=True)
    for asset_id, rig in rigs.items():
        bpy.ops.object.select_all(action="DESELECT")
        rig["root"].select_set(True)
        for obj in bpy.context.scene.objects:
            ancestor = obj.parent
            while ancestor:
                if ancestor == rig["root"]:
                    obj.select_set(True)
                    break
                ancestor = ancestor.parent
        bpy.context.view_layer.objects.active = rig["root"]
        bpy.ops.export_scene.gltf(
            filepath=str(output_root / f"character-{asset_id}.glb"),
            export_format="GLB",
            use_selection=True,
            export_animations=True,
        )


def render_turntables(scene, camera, rigs, output_root):
    original_camera = scene.camera
    turntable_camera = camera.copy()
    turntable_camera.data = camera.data.copy()
    turntable_camera.name = "turntable.camera"
    turntable_camera.animation_data_clear()
    scene.collection.objects.link(turntable_camera)
    scene.camera = turntable_camera
    original_path = scene.render.filepath
    original_format = scene.render.image_settings.file_format
    original_x = scene.render.resolution_x
    original_y = scene.render.resolution_y
    original_frame = scene.frame_current
    original_hidden = {obj.name: obj.hide_render for obj in scene.objects}
    scene.render.image_settings.file_format = "PNG"
    scene.render.resolution_x = 480
    scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.frame_set(1)

    def descendants(root):
        members = {root}
        for obj in scene.objects:
            ancestor = obj.parent
            while ancestor:
                if ancestor == root:
                    members.add(obj)
                    break
                ancestor = ancestor.parent
        return members

    rig_members = {asset_id: descendants(rig["root"]) for asset_id, rig in rigs.items()}
    index = 0
    for asset_id, rig in rigs.items():
        visible_members = rig_members[asset_id]
        animation_state = {}
        for obj in visible_members:
            action = obj.animation_data.action if obj.animation_data else None
            animation_state[obj.name] = (action, obj.rotation_euler.copy())
            if action is not None:
                obj.animation_data.action = None
            if obj.type == "EMPTY" and obj != rig["root"]:
                obj.rotation_euler = (0, 0, 0)
        for obj in scene.objects:
            if obj.type in {"LIGHT", "CAMERA"}:
                obj.hide_render = False
            else:
                obj.hide_render = obj not in visible_members

        bounds = []
        for obj in visible_members:
            if obj.type != "MESH":
                continue
            bounds.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
        minimum = Vector(tuple(min(point[axis] for point in bounds) for axis in range(3)))
        maximum = Vector(tuple(max(point[axis] for point in bounds) for axis in range(3)))
        center = (minimum + maximum) * 0.5
        extent = maximum - minimum
        radius = max(extent.x, extent.y, extent.z) * 2.15
        camera_height = center.z + extent.z * 0.08
        for angle_index in range(8):
            angle = math.radians(angle_index * 45)
            turntable_camera.location = (
                center.x + math.sin(angle) * radius,
                center.y - math.cos(angle) * radius,
                camera_height,
            )
            look_at(turntable_camera, center)
            turntable_camera.data.lens = 58
            scene.render.filepath = str(output_root / f"turntable-{index:03d}.png")
            bpy.ops.render.render(write_still=True)
            index += 1
        for obj in visible_members:
            action, rotation = animation_state[obj.name]
            obj.rotation_euler = rotation
            if action is not None:
                if obj.animation_data is None:
                    obj.animation_data_create()
                obj.animation_data.action = action
    for obj in scene.objects:
        obj.hide_render = original_hidden[obj.name]
    scene.render.filepath = original_path
    scene.render.image_settings.file_format = original_format
    scene.render.resolution_x = original_x
    scene.render.resolution_y = original_y
    scene.frame_set(original_frame)
    scene.camera = original_camera
    camera_data = turntable_camera.data
    bpy.data.objects.remove(turntable_camera, do_unlink=True)
    bpy.data.cameras.remove(camera_data, do_unlink=True)


def load_viseme_tracks(project_root):
    tracks_by_speaker = {}
    manifest_path = project_root / "generated/visemes/manifest.json"
    manifest = read_json(manifest_path)
    for item in manifest["tracks"]:
        track = read_json(item["output"])
        tracks_by_speaker.setdefault(track["speaker"], []).append(track)
    return tracks_by_speaker


def main():
    arguments = args_after_double_dash()
    project_root = Path(arguments.project).resolve()
    output_root = Path(arguments.output).resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    characters = read_json(project_root / "characters.json")
    if arguments.turntables_only:
        bpy.ops.wm.open_mainfile(filepath=str(output_root / "digital-human-master.blend"))
        rigs = {
            asset["assetId"]: {"root": bpy.data.objects[f"{asset['assetId']}.root"]}
            for asset in characters
        }
        camera = bpy.data.objects["shot.camera"]
        bpy.context.scene.camera = camera
        render_turntables(bpy.context.scene, camera, rigs, output_root)
        return

    scene_manifest = read_json(project_root / "scene.json")
    story = read_json(project_root / "story.json")
    tracks = load_viseme_tracks(project_root)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials = {
        "concrete": material("Concrete", (0.34, 0.33, 0.29, 1), roughness=0.78),
        "yellow": material("Safety yellow", (0.96, 0.56, 0.06, 1), metallic=0.12, roughness=0.3),
        "dark": material("Graphite", (0.025, 0.035, 0.05, 1), metallic=0.25, roughness=0.25),
        "face": material("Face screen", (0.008, 0.012, 0.018, 1), metallic=0.15, roughness=0.16),
        "white": material("Warm white", (0.93, 0.92, 0.85, 1), roughness=0.35, emission=(0.93, 0.92, 0.85, 1), emission_strength=0.08),
        "skin": material("Skin", (0.82, 0.48, 0.3, 1), roughness=0.48),
        "hair": material("Hair", (0.075, 0.035, 0.018, 1), roughness=0.4),
        "denim": material("Denim", (0.055, 0.2, 0.34, 1), roughness=0.65),
        "scarf": material("Scarf", (0.63, 0.12, 0.055, 1), roughness=0.6),
        "blue": material("Factory blue", (0.025, 0.3, 0.52, 1), metallic=0.18, roughness=0.34),
        "orange": material("Work orange", (0.92, 0.3, 0.045, 1), roughness=0.42),
        "brick": material("Brick", (0.46, 0.14, 0.06, 1), roughness=0.78),
        "ground": material("Ground", (0.08, 0.105, 0.12, 1), roughness=0.76),
        "walkway": material("Walkway", (0.18, 0.22, 0.23, 1), roughness=0.62),
        "building": material("Factory wall", (0.28, 0.34, 0.36, 1), metallic=0.04, roughness=0.72),
        "window": material("Window", (0.03, 0.12, 0.2, 1), metallic=0.4, roughness=0.18),
        "silo": material("Silo", (0.43, 0.47, 0.45, 1), metallic=0.56, roughness=0.32),
        "pipe": material("Pipe", (0.09, 0.13, 0.15, 1), metallic=0.68, roughness=0.28),
        "memory": material("Memory light", (0.08, 0.75, 1.0, 1), metallic=0.18, roughness=0.18, emission=(0.03, 0.55, 1.0, 1), emission_strength=4.5),
        "wood": material("Wood", (0.16, 0.07, 0.025, 1), roughness=0.8),
        "green": material("Green", (0.045, 0.24, 0.12, 1), roughness=0.7),
    }

    create_factory_scene(scene_manifest, materials)
    create_lighting(materials)
    positions = {
        "erbao": (-2.7, -0.3, 0),
        "huihui": (0.1, 0.0, 0),
        "xiaoban": (2.7, -0.05, 0),
        "grandpa": (5.4, 1.0, 0),
    }
    rigs = {}
    for index, asset in enumerate(characters):
        origin = positions.get(asset["assetId"], (-3 + index * 2.2, 0, 0))
        rigs[asset["assetId"]] = create_character(asset, materials, origin)

    configure_scene(story, output_root)
    bpy.ops.object.camera_add(location=(9.5, -16.5, 6.4))
    camera = bpy.context.object
    camera.name = "shot.camera"
    bpy.context.scene.camera = camera
    animate_camera(camera, story)
    animate_performance(rigs, story)
    for speaker, speaker_tracks in tracks.items():
        if speaker in rigs:
            animate_visemes(rigs[speaker], speaker_tracks, story["fps"])

    export_scene(output_root, rigs)
    render_turntables(bpy.context.scene, camera, rigs, output_root)
    bpy.context.scene.render.filepath = str(output_root / "visual.mp4")
    bpy.ops.render.render(animation=True)


if __name__ == "__main__":
    main()
