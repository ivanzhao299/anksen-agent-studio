"""Inspect imported mesh topology for assembly and printability evidence."""

import argparse
import json
from pathlib import Path

import bmesh
import bpy


def parse_args(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--mesh", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args(argv)


def connected_component_sizes(editable):
    unseen = set(editable.verts)
    sizes = []
    while unseen:
        start = unseen.pop()
        stack = [start]
        size = 0
        while stack:
            vertex = stack.pop()
            size += 1
            for edge in vertex.link_edges:
                neighbor = edge.other_vert(vertex)
                if neighbor in unseen:
                    unseen.remove(neighbor)
                    stack.append(neighbor)
        sizes.append(size)
    return sorted(sizes, reverse=True)


def topology_analysis(mesh):
    editable = bmesh.new()
    editable.from_mesh(mesh)
    source_vertices = len(editable.verts)
    points = [vertex.co for vertex in editable.verts]
    if points:
        diagonal = max(
            (max(point[axis] for point in points) - min(point[axis] for point in points))
            for axis in range(3)
        )
    else:
        diagonal = 0
    weld_distance = max(diagonal * 1e-7, 1e-9)
    bmesh.ops.remove_doubles(
        editable,
        verts=list(editable.verts),
        dist=weld_distance,
    )
    component_sizes = connected_component_sizes(editable)
    report = {
        "sourceVertices": source_vertices,
        "weldedVertices": len(editable.verts),
        "duplicateVertexRatio": round(
            ((source_vertices - len(editable.verts)) / source_vertices)
            if source_vertices
            else 0,
            6,
        ),
        "weldDistance": weld_distance,
        "componentSizes": component_sizes,
        "boundaryEdges": sum(1 for edge in editable.edges if len(edge.link_faces) == 1),
        "nonManifoldEdges": sum(1 for edge in editable.edges if not edge.is_manifold),
    }
    editable.free()
    return report


def main():
    separator = list(__import__("sys").argv).index("--")
    args = parse_args(__import__("sys").argv[separator + 1 :])
    mesh_path = Path(args.mesh).resolve()
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    if mesh_path.suffix.lower() in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(mesh_path))
    elif mesh_path.suffix.lower() == ".stl":
        bpy.ops.wm.stl_import(filepath=str(mesh_path))
    else:
        raise RuntimeError(f"Unsupported mesh format: {mesh_path.suffix}")

    objects = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    if not objects:
        raise RuntimeError("No mesh object was imported")

    object_reports = []
    all_component_sizes = []
    total_vertices = 0
    total_welded_vertices = 0
    total_polygons = 0
    total_boundary_edges = 0
    total_non_manifold_edges = 0
    for item in objects:
        topology = topology_analysis(item.data)
        component_sizes = topology.pop("componentSizes")
        total_vertices += len(item.data.vertices)
        total_welded_vertices += topology["weldedVertices"]
        total_polygons += len(item.data.polygons)
        total_boundary_edges += topology["boundaryEdges"]
        total_non_manifold_edges += topology["nonManifoldEdges"]
        all_component_sizes.extend(component_sizes)
        object_reports.append(
            {
                "name": item.name,
                "vertices": len(item.data.vertices),
                "polygons": len(item.data.polygons),
                "materialSlots": len(item.material_slots),
                "connectedComponents": len(component_sizes),
                "largestComponentVertices": component_sizes[0] if component_sizes else 0,
                **topology,
            }
        )

    all_component_sizes.sort(reverse=True)
    report = {
        "schemaVersion": 1,
        "status": "PASS",
        "mesh": str(mesh_path),
        "meshObjects": len(objects),
        "connectedComponents": len(all_component_sizes),
        "sourceVertices": total_vertices,
        "weldedVertices": total_welded_vertices,
        "duplicateVertexRatio": round(
            ((total_vertices - total_welded_vertices) / total_vertices)
            if total_vertices
            else 0,
            6,
        ),
        "polygons": total_polygons,
        "materialSlots": sum(len(item.material_slots) for item in objects),
        "largestComponentVertexRatio": round(
            (all_component_sizes[0] / total_welded_vertices)
            if total_welded_vertices
            else 0,
            6,
        ),
        "boundaryEdges": total_boundary_edges,
        "nonManifoldEdges": total_non_manifold_edges,
        "assemblyInterpretation": (
            "SEPARATE_OBJECTS"
            if len(objects) > 1
            else "ONE_OBJECT_MULTIPLE_SHELLS"
            if len(all_component_sizes) > 1
            else "SINGLE_FUSED_SHELL"
        ),
        "objects": object_reports,
    }
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
