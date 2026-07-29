"""Render orthographic transparent silhouettes at the canonical eight angles."""

import argparse
import math
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--mesh", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--resolution-x", type=int, default=768)
    parser.add_argument("--resolution-y", type=int, default=820)
    return parser.parse_args(argv)


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def world_bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
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
    bpy.ops.import_scene.gltf(filepath=str(mesh_path))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not objects:
        raise RuntimeError("No mesh object was imported")
    silhouette = bpy.data.materials.new("Silhouette")
    silhouette.diffuse_color = (1.0, 1.0, 1.0, 1.0)
    for obj in objects:
        obj.data.materials.clear()
        obj.data.materials.append(silhouette)

    minimum, maximum = world_bounds(objects)
    center = (minimum + maximum) / 2
    extent = maximum - minimum
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = extent.z * 1.08
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "FLAT"
    scene.display.shading.color_type = "SINGLE"
    scene.display.shading.single_color = (1.0, 1.0, 1.0)
    scene.display.shading.show_shadows = False
    scene.display.shading.show_cavity = False
    scene.render.film_transparent = True
    scene.render.resolution_x = args.resolution_x
    scene.render.resolution_y = args.resolution_y
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"

    radius = max(extent.x, extent.y) * 3
    for angle in (0, 45, 90, 135, 180, 225, 270, 315):
        theta = math.radians(angle)
        camera.location = (
            center.x + radius * math.sin(theta),
            center.y - radius * math.cos(theta),
            center.z,
        )
        look_at(camera, center)
        scene.render.filepath = str(output_dir / f"silhouette-{angle:03d}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
