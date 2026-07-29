"""Render neutral clay validation views for an imported reconstruction mesh."""

import argparse
import math
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--mesh", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--resolution", type=int, default=1024)
    parser.add_argument("--preserve-materials", action="store_true")
    parser.add_argument("--prefix", default="huihui-v3-clay")
    return parser.parse_args(argv)


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def make_material(name, base, roughness):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*base, 1.0)
    material.use_nodes = True
    shader = next(
        node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"
    )
    shader.inputs["Base Color"].default_value = (*base, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = 0.0
    return material


def world_bounds(objects):
    points = [
        obj.matrix_world @ Vector(corner)
        for obj in objects
        for corner in obj.bound_box
    ]
    minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    return minimum, maximum


def main():
    separator = list(__import__("sys").argv).index("--")
    args = parse_args(__import__("sys").argv[separator + 1 :])
    mesh_path = Path(args.mesh).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    if mesh_path.suffix.lower() in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(mesh_path))
    else:
        bpy.ops.wm.stl_import(filepath=str(mesh_path))

    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not mesh_objects:
        raise RuntimeError("No mesh object was imported")
    clay = make_material("Neutral validation clay", (0.42, 0.45, 0.50), 0.55)
    for obj in mesh_objects:
        if not args.preserve_materials:
            obj.data.materials.clear()
            obj.data.materials.append(clay)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True

    bpy.context.view_layer.update()
    minimum, maximum = world_bounds(mesh_objects)
    initial_extent = maximum - minimum
    # Normalize every asset to the same review height. Area-light energy is
    # distance-sensitive, so keeping a 180 mm model next to lights tuned for a
    # 1.8 m character would destroy material and surface-detail evidence.
    scale_factor = 1.8 / max(initial_extent)
    if abs(scale_factor - 1.0) > 1e-5:
        for obj in mesh_objects:
            obj.scale = tuple(component * scale_factor for component in obj.scale)
            obj.location = tuple(component * scale_factor for component in obj.location)
        bpy.context.view_layer.update()
        minimum, maximum = world_bounds(mesh_objects)
    center = (minimum + maximum) / 2
    extent = maximum - minimum

    bpy.ops.mesh.primitive_plane_add(size=max(extent.x, extent.y) * 4, location=(center.x, center.y, minimum.z))
    plane = bpy.context.object
    plane.data.materials.append(make_material("Ground", (0.12, 0.14, 0.17), 0.72))

    world = bpy.context.scene.world or bpy.data.worlds.new("Validation World")
    bpy.context.scene.world = world
    world.use_nodes = True
    background = next(node for node in world.node_tree.nodes if node.type == "BACKGROUND")
    background.inputs["Color"].default_value = (0.035, 0.045, 0.065, 1.0)
    background.inputs["Strength"].default_value = 0.35

    bpy.ops.object.light_add(
        type="AREA",
        location=(center.x - extent.x * 1.5, center.y - extent.y * 2.0, maximum.z + extent.z),
    )
    key = bpy.context.object
    key.data.energy = 360
    key.data.shape = "DISK"
    key.data.size = max(extent.x, extent.y) * 1.5
    look_at(key, center)
    bpy.ops.object.light_add(
        type="AREA",
        location=(center.x + extent.x * 1.4, center.y - extent.y, center.z + extent.z * 0.4),
    )
    fill = bpy.context.object
    fill.data.energy = 220
    fill.data.size = max(extent.x, extent.y)
    look_at(fill, center)
    bpy.ops.object.light_add(
        type="AREA",
        location=(center.x, center.y + extent.y * 1.8, maximum.z + extent.z * 0.3),
    )
    rim = bpy.context.object
    rim.data.energy = 280
    rim.data.size = max(extent.x, extent.y)
    look_at(rim, center)

    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = max(extent.z * 1.18, extent.x * 1.2)
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = args.resolution
    scene.render.resolution_y = args.resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"

    radius = max(extent.x, extent.y) * 3
    for angle in (0, 45, 90, 135, 180, 225, 270, 315):
        theta = math.radians(angle)
        camera.location = (
            center.x + radius * math.sin(theta),
            center.y - radius * math.cos(theta),
            center.z + extent.z * 0.03,
        )
        look_at(camera, center)
        scene.render.filepath = str(output_dir / f"{args.prefix}-{angle:03d}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
