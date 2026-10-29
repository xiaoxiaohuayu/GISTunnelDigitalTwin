import sys
from pathlib import Path as _AssetPath
sys.path.insert(0, str(_AssetPath(__file__).resolve().parent))
from asset_paths import asset_path
"""Thin portal planting, simplify shared trees and instance repeated meshes.
Run with Blender: blender -b --python scripts/optimize-portal-terrain.py
"""
import bpy, bmesh
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def export_optimized_terrain():
    terrain = bpy.data.collections['terrain']
    # Open up the approach and forest instead of lowering the screen resolution.
    planted = []
    shrub_index = 0
    for obj in list(terrain.objects):
        if obj.get('supplied_asset') not in ['tree-near', 'tree-far']:
            continue
        if max(obj.scale) < .5:
            shrub_index += 1
            keep = shrub_index % 4 == 0
        else:
            x, y = obj.location.x, obj.location.y
            spacing = 16 if x < 0 else 10
            keep = all((x-px)**2 + (y-py)**2 >= spacing**2 for px, py in planted)
            if keep:
                planted.append((x, y))
        if not keep:
            bpy.data.objects.remove(obj, do_unlink=True)
    trees = [o for o in terrain.objects if o.get('supplied_asset') == 'tree-near']
    if trees:
        # Tiny shrubs can use the existing photographic tree without drawing hidden branches.
        billboard = next(o.data for o in terrain.objects if o.get('supplied_asset') == 'tree-far')
        for tree in trees:
            if max(tree.scale) < .5:
                tree.data = billboard
        trees = [o for o in trees if max(o.scale) >= .5]
        # Preserve depth on the closest trees; the forest uses the same tree's baked image.
        trees.sort(key=lambda o: o.location.x + abs(o.location.y) * .25)
        for tree in trees[4:]:
            tree.data = billboard
        trees = trees[:4]
    if trees:
        # Simplify woody branches separately; collapsing alpha leaf cards removes the canopy.
        tree = trees[0]
        tree.data = tree.data.copy()
        leaves = tree.copy()
        leaves.data = tree.data.copy()
        terrain.objects.link(leaves)
        for obj, keep_leaves in [(tree, False), (leaves, True)]:
            mesh = bmesh.new()
            mesh.from_mesh(obj.data)
            remove = [f for f in mesh.faces
                      if ('leaves' in obj.data.materials[f.material_index].name.lower()) != keep_leaves]
            bmesh.ops.delete(mesh, geom=remove, context='FACES')
            bmesh.ops.delete(mesh, geom=[v for v in mesh.verts if not v.link_faces], context='VERTS')
            if not keep_leaves:
                bmesh.ops.remove_doubles(mesh, verts=list(mesh.verts), dist=.0001)
            mesh.to_mesh(obj.data)
            mesh.free()
        bpy.ops.object.select_all(action='DESELECT')
        tree.select_set(True)
        bpy.context.view_layer.objects.active = tree
        modifier = tree.modifiers.new('Runtime tree budget', 'DECIMATE')
        modifier.ratio = .04
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        leaves.select_set(True)
        bpy.ops.object.join()
        for other in trees[1:]:
            other.data = tree.data

    # Blender's instancing exporter only groups sibling meshes beneath an empty.
    parent = bpy.data.objects.new('Portal landscape instances', None)
    terrain.objects.link(parent)
    for obj in list(terrain.objects):
        if obj != parent:
            matrix = obj.matrix_world.copy()
            obj.parent = parent
            obj.matrix_world = matrix
    bpy.ops.object.select_all(action='DESELECT')
    for obj in terrain.objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(asset_path('portal-terrain')),
        export_format='GLB', use_selection=True, export_yup=True,
        export_apply=False, export_gpu_instances=True,
    )


if __name__ == '__main__':
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'blendFile/scenes/portal-site.blend'))
    export_optimized_terrain()
