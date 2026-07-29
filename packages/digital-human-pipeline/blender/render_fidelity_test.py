import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--stills-only", action="store_true")
    return parser.parse_args(values)


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def color(value):
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) / 255.0 for index in (0, 2, 4)) + (1.0,)


def make_material(name, base, metallic=0.0, roughness=0.45):
    item = bpy.data.materials.new(name)
    item.use_nodes = True
    node = item.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = base
    node.inputs["Metallic"].default_value = metallic
    node.inputs["Roughness"].default_value = roughness
    return item


def concrete_material():
    item = make_material("Huihui concrete", color("#77766D"), 0.0, 0.72)
    nodes = item.node_tree.nodes
    links = item.node_tree.links
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 18
    noise.inputs["Detail"].default_value = 5
    noise.inputs["Roughness"].default_value = 0.75
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = color("#343633")
    ramp.color_ramp.elements[1].color = color("#77756C")
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.24
    bump.inputs["Distance"].default_value = 0.08
    principled = nodes.get("Principled BSDF")
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], principled.inputs["Base Color"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    return item


def image_material(name, path):
    item = bpy.data.materials.new(name)
    item.use_nodes = True
    nodes = item.node_tree.nodes
    links = item.node_tree.links
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(path), check_existing=True)
    texture.interpolation = "Linear"
    principled = nodes.get("Principled BSDF")
    principled.inputs["Roughness"].default_value = 1.0
    principled.inputs["Specular IOR Level"].default_value = 0.0
    links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    links.new(texture.outputs["Color"], principled.inputs["Emission Color"])
    principled.inputs["Emission Strength"].default_value = 0.18
    return item


def apply(obj, material):
    obj.data.materials.append(material)


def smooth(obj):
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def parent(obj, target):
    bpy.context.view_layer.update()
    matrix = obj.matrix_world.copy()
    obj.parent = target
    obj.matrix_world = matrix


def empty(name, location, parent_object=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    if parent_object:
        parent(obj, parent_object)
    return obj


def sphere(name, location, scale, material, parent_object=None, segments=48, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    smooth(obj)
    apply(obj, material)
    if parent_object:
        parent(obj, parent_object)
    return obj


def cube(name, location, scale, material, bevel=0.08, parent_object=None):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("Rounded", "BEVEL")
    modifier.width = bevel
    modifier.segments = 5
    apply(obj, material)
    if parent_object:
        parent(obj, parent_object)
    return obj


def cylinder(name, location, radius, depth, material, rotation=(0, 0, 0), parent_object=None):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=48, radius=radius, depth=depth, location=location, rotation=rotation
    )
    obj = bpy.context.object
    obj.name = name
    smooth(obj)
    apply(obj, material)
    if parent_object:
        parent(obj, parent_object)
    return obj


def torus(name, location, major, minor, material, rotation=(0, 0, 0), parent_object=None):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=64,
        minor_segments=20,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    smooth(obj)
    apply(obj, material)
    if parent_object:
        parent(obj, parent_object)
    return obj


def text_object(name, body, location, size, material, parent_object=None):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = body
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = size
    curve.extrude = 0.025
    curve.bevel_depth = 0.006
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (math.radians(90), 0, 0)
    apply(obj, material)
    if parent_object:
        parent(obj, parent_object)
    return obj


def create_mouth(root, material):
    mouth = cube("huihui.mouth", (0, -0.572, 2.06), (0.15, 0.018, 0.026), material, 0.025, root)
    mouth.shape_key_add(name="Basis")
    for name, x_scale, z_scale in [
        ("AI", 1.0, 3.0),
        ("E", 1.35, 1.8),
        ("O", 0.55, 3.6),
        ("U", 0.45, 2.8),
        ("MBP", 1.0, 0.12),
    ]:
        key = mouth.shape_key_add(name=name)
        for vertex in key.data:
            vertex.co.x *= x_scale
            vertex.co.z *= z_scale
    return mouth


def create_huihui(manifest):
    concrete = concrete_material()
    yellow = make_material("Safety yellow", color("#E49A00"), 0.08, 0.40)
    dark = make_material("Rubber dark", color("#25241F"), 0.15, 0.52)
    screen = make_material("Face screen", color("#090C0D"), 0.4, 0.14)
    white = make_material("Face white", color("#F8F7E8"), 0.0, 0.26)

    root = empty("huihui.root", (0, 0, 0))
    sphere("huihui.body", (0, 0, 1.24), (0.69, 0.55, 0.72), concrete, root)
    for index, height in enumerate((0.105, 0.145, 0.095)):
        cube(
            f"huihui.badge.silo.{index}",
            ((index - 1) * 0.07, -0.584, 1.2 + (height - 0.095) * 0.5),
            (0.024, 0.014, height),
            dark,
            0.008,
            root,
        )
    cube("huihui.badge.ribbon", (0, -0.586, 1.08), (0.13, 0.014, 0.018), yellow, 0.012, root)

    head = empty("huihui.head.ctrl", (0, 0, 2.02), root)
    sphere("huihui.head", (0, 0, 2.02), (0.62, 0.50, 0.48), concrete, head)
    cube("huihui.screen", (0, -0.492, 2.02), (0.43, 0.038, 0.255), screen, 0.105, head)
    eyes = []
    for side, x in (("L", -0.2), ("R", 0.2)):
        eye = sphere(f"huihui.eye.{side}", (x, -0.537, 2.10), (0.056, 0.018, 0.086), white, head)
        eyes.append(eye)
        cylinder(
            f"huihui.ear.{side}",
            (0.635 if side == "R" else -0.635, 0, 2.03),
            0.17,
            0.12,
            dark,
            rotation=(0, math.radians(90), 0),
            parent_object=head,
        )
        cylinder(
            f"huihui.ear.yellow.{side}",
            (0.70 if side == "R" else -0.70, 0, 2.03),
            0.105,
            0.055,
            yellow,
            rotation=(0, math.radians(90), 0),
            parent_object=head,
        )
    mouth = create_mouth(head, white)

    cylinder("huihui.helmet.brim", (0, -0.03, 2.47), 0.69, 0.13, yellow, parent_object=head)
    sphere("huihui.helmet.dome", (0, 0, 2.55), (0.59, 0.49, 0.26), yellow, head)
    cube("huihui.helmet.rib", (0, -0.02, 2.69), (0.075, 0.45, 0.085), yellow, 0.04, head)
    cube("huihui.helmet.brand-plate", (0, -0.57, 2.56), (0.24, 0.028, 0.09), dark, 0.025, head)
    for index, height in enumerate((0.045, 0.065, 0.04)):
        cube(
            f"huihui.helmet.brand-silo.{index}",
            ((index - 1) * 0.055, -0.605, 2.56 + (height - 0.04) * 0.5),
            (0.017, 0.012, height),
            white,
            0.005,
            head,
        )

    controls = {"root": root, "head": head, "mouth": mouth, "eyes": eyes}
    for side, x in (("L", -0.79), ("R", 0.79)):
        shoulder = empty(f"huihui.arm.{side}.ctrl", (x, 0, 1.57), root)
        cylinder(f"huihui.arm.{side}.upper", (x, 0, 1.30), 0.12, 0.54, yellow, parent_object=shoulder)
        glove = sphere(f"huihui.glove.{side}", (x, -0.02, 0.96), (0.19, 0.17, 0.18), yellow, shoulder)
        for finger in range(3):
            sphere(
                f"huihui.finger.{side}.{finger}",
                (x + (finger - 1) * 0.072, -0.04, 0.84),
                (0.045, 0.045, 0.11),
                yellow,
                shoulder,
                segments=24,
                rings=12,
            )
        controls[f"arm.{side}"] = shoulder
        controls[f"glove.{side}"] = glove
    for side, x in (("L", -0.31), ("R", 0.31)):
        leg = empty(f"huihui.leg.{side}.ctrl", (x, 0, 0.72), root)
        cylinder(f"huihui.leg.{side}", (x, 0, 0.46), 0.12, 0.5, dark, parent_object=leg)
        cube(f"huihui.boot.{side}", (x, -0.12, 0.15), (0.23, 0.35, 0.15), yellow, 0.12, leg)
        controls[f"leg.{side}"] = leg

    root["reference_image"] = manifest["referenceAssets"]["identitySheet"]
    root["identity_features"] = json.dumps(manifest["identityFeatures"], ensure_ascii=False)
    return controls


def create_scene_plate(scene_manifest, project_root):
    reference = project_root / scene_manifest["reconstruction"]["referenceFrame"]
    depth_path = project_root / scene_manifest["reconstruction"]["depthMap"]
    plate_material = image_material("Cement factory scene plate", reference)
    depth_image = bpy.data.images.load(str(depth_path), check_existing=True)
    bpy.ops.mesh.primitive_plane_add(
        size=2,
        location=(0, 4.9, 2.75),
        rotation=(math.radians(90), 0, 0),
    )
    plate = bpy.context.object
    plate.name = "scene.reconstructed.reference-plate"
    plate.scale = (9.4, 6.3, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply(plate, plate_material)

    shadow_material = make_material("Contact shadow", color("#111311"), 0.0, 1.0)
    shadow_material.diffuse_color = (0.02, 0.025, 0.02, 0.30)
    shadow_node = shadow_material.node_tree.nodes.get("Principled BSDF")
    shadow_node.inputs["Alpha"].default_value = 0.28
    shadow_material.surface_render_method = "DITHERED"
    sphere(
        "scene.contact-shadow",
        (0, 0.08, 0.05),
        (0.78, 0.38, 0.025),
        shadow_material,
        segments=64,
        rings=16,
    )

    plate["reconstruction_mode"] = scene_manifest["reconstruction"]["mode"]
    plate["depth_map"] = scene_manifest["reconstruction"]["depthMap"]
    plate["depth_resolution"] = f"{depth_image.size[0]}x{depth_image.size[1]}"
    plate["projection_policy"] = "source-frame-safe-backplate; depth-guided camera motion"
    return plate


def frame_at(seconds, fps):
    return max(1, round(seconds * fps) + 1)


def key(obj, data_path, frame):
    obj.keyframe_insert(data_path, frame=frame)


def animate_huihui(rig, story):
    fps = story["fps"]
    root = rig["root"]
    head = rig["head"]
    arm = rig["arm.R"]
    root.location = (0, 0, 0)
    key(root, "location", frame_at(0, fps))
    root.location = (0, -0.04, 0.025)
    key(root, "location", frame_at(2.8, fps))
    root.location = (0, 0, 0)
    key(root, "location", frame_at(story["duration"], fps))

    for second, angle in [(0, -4), (1.4, 4), (3.0, -2), (4.6, 3), (6.0, 0)]:
        head.rotation_euler = (0, math.radians(angle), math.radians(angle * 0.3))
        key(head, "rotation_euler", frame_at(second, fps))

    for second, angle in [
        (0, 0),
        (0.65, -145),
        (1.2, -130),
        (1.7, -155),
        (2.2, -132),
        (2.75, -150),
        (3.4, -140),
        (4.2, 0),
        (6.0, 0),
    ]:
        arm.rotation_euler = (0, math.radians(angle), 0)
        key(arm, "rotation_euler", frame_at(second, fps))

    for eye in rig["eyes"]:
        base_scale = eye.scale.copy()
        for second, scale_z in [
            (0, 1.0),
            (1.05, 1.0),
            (1.10, 0.08),
            (1.17, 1.0),
            (3.55, 1.0),
            (3.60, 0.08),
            (3.67, 1.0),
            (6.0, 1.0),
        ]:
            eye.scale = (base_scale.x, base_scale.y, base_scale.z * scale_z)
            key(eye, "scale", frame_at(second, fps))

    mouth = rig["mouth"]
    if mouth.data.shape_keys:
        for block in mouth.data.shape_keys.key_blocks:
            if block.name == "Basis":
                continue
            for second in (0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.6, 4.2, 4.8, 5.4, 6.0):
                block.value = 0.0
                block.keyframe_insert("value", frame=frame_at(second, fps))
        sequence = [("AI", 0.7), ("O", 1.15), ("E", 1.65), ("MBP", 2.05), ("AI", 2.45), ("U", 2.9), ("E", 3.35), ("O", 3.8), ("AI", 4.25)]
        for name, second in sequence:
            block = mouth.data.shape_keys.key_blocks.get(name)
            if not block:
                continue
            block.value = 0.0
            block.keyframe_insert("value", frame=frame_at(second - 0.1, fps))
            block.value = 1.0
            block.keyframe_insert("value", frame=frame_at(second, fps))
            block.value = 0.0
            block.keyframe_insert("value", frame=frame_at(second + 0.14, fps))


def look_at(camera, target):
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_camera(story):
    bpy.ops.object.camera_add(location=(0.85, -8.8, 2.70))
    camera = bpy.context.object
    camera.name = "shot.camera"
    camera.data.lens = 58
    look_at(camera, (0, 0.15, 1.40))
    camera.keyframe_insert("location", frame=frame_at(0, story["fps"]))
    camera.keyframe_insert("rotation_euler", frame=frame_at(0, story["fps"]))
    camera.location = (0.70, -8.55, 2.66)
    look_at(camera, (0, 0.15, 1.42))
    camera.keyframe_insert("location", frame=frame_at(story["duration"], story["fps"]))
    camera.keyframe_insert("rotation_euler", frame=frame_at(story["duration"], story["fps"]))
    bpy.context.scene.camera = camera


def setup_lighting():
    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new("Reference scene world")
        bpy.context.scene.world = world
    world.color = (0.16, 0.17, 0.18)
    bpy.ops.object.light_add(type="AREA", location=(-3.5, -4.0, 6.0))
    key_light = bpy.context.object
    key_light.data.energy = 1250
    key_light.data.shape = "DISK"
    key_light.data.size = 5.0
    key_light.data.color = (1.0, 0.88, 0.68)
    key_light.rotation_euler = (math.radians(28), 0, math.radians(-25))
    bpy.ops.object.light_add(type="AREA", location=(4.5, -1.0, 4.2))
    fill = bpy.context.object
    fill.data.energy = 850
    fill.data.size = 4.0
    fill.data.color = (0.55, 0.75, 1.0)


def configure(story, output):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = story["resolution"]["width"]
    scene.render.resolution_y = story["resolution"]["height"]
    scene.render.resolution_percentage = 100
    scene.render.fps = story["fps"]
    scene.frame_start = 1
    scene.frame_end = frame_at(story["duration"], story["fps"])
    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.ffmpeg.format = "MPEG4"
    scene.render.ffmpeg.codec = "H264"
    scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
    scene.render.ffmpeg.ffmpeg_preset = "GOOD"
    scene.render.filepath = str(output / "visual.mp4")
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.film_transparent = False


def render_stills(scene, output):
    original = scene.render.filepath
    original_format = scene.render.image_settings.file_format
    scene.render.image_settings.file_format = "PNG"
    for name, frame in [("fidelity-start", 1), ("fidelity-action", scene.frame_end // 2), ("fidelity-end", scene.frame_end)]:
        scene.frame_set(frame)
        scene.render.filepath = str(output / f"{name}.png")
        bpy.ops.render.render(write_still=True)
    scene.render.filepath = original
    scene.render.image_settings.file_format = original_format


def main():
    args = parse_args()
    project_root = Path(args.project).resolve()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    character = read_json(project_root / "characters.json")[0]
    scene_manifest = read_json(project_root / "scene.json")
    story = read_json(project_root / "story.json")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    create_scene_plate(scene_manifest, project_root)
    rig = create_huihui(character)
    animate_huihui(rig, story)
    setup_camera(story)
    setup_lighting()
    configure(story, output)
    bpy.ops.wm.save_as_mainfile(filepath=str(output / "huihui-fidelity-scene.blend"))
    bpy.ops.export_scene.gltf(
        filepath=str(output / "huihui-fidelity-character.glb"),
        export_format="GLB",
        export_animations=True,
        use_selection=False,
    )
    render_stills(bpy.context.scene, output)
    if not args.stills_only:
        bpy.context.scene.frame_set(1)
        bpy.context.scene.render.filepath = str(output / "visual.mp4")
        bpy.ops.render.render(animation=True)

    report = {
        "schemaVersion": 1,
        "status": "PASS",
        "pipeline": "reference-constrained-digital-human-v2",
        "character": character["assetId"],
        "identityFeatures": character["identityFeatures"],
        "sceneReconstruction": scene_manifest["reconstruction"],
        "duration": story["duration"],
        "fps": story["fps"],
        "frames": bpy.context.scene.frame_end,
    }
    (output / "render-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
