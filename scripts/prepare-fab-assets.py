"""Prepare licensed Fab runtime copies; never overwrite downloaded originals."""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'modelSources/fab'
OUT=ROOT/'modelSources/processed'
REPORT={}
def load(file):
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(SOURCE/file))
def bake(objects):
 for o in list(bpy.context.scene.objects):
  if o.type=='MESH' and o not in objects:bpy.data.objects.remove(o,do_unlink=True)
 for o in objects:
  o.data.transform(o.matrix_world);o.parent=None;o.matrix_world.identity()
def finish(name,objects):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 bpy.ops.object.join();o=bpy.context.object;o.name=name
 # Join geometry sharing each material, retaining PBR textures and normal maps.
 bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/f'blendFile/prepared/{name}.blend'))
 bpy.ops.export_scene.gltf(filepath=str(OUT/f'{name}.glb'),export_format='GLB',use_selection=True,export_apply=True)
 REPORT[name]={'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'materials':len(o.data.materials),'dimensions':list(o.dimensions)}
load(Path('game-ready-grass/game_ready_grass.glb'))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.parent and o.parent.name=='trasparent grass4.008']
assert len(objects)==3
bake(objects)
points=[v.co for o in objects for v in o.data.vertices]
low=Vector([min(v[i]for v in points)for i in range(3)]);high=Vector([max(v[i]for v in points)for i in range(3)])
center=(low+high)/2;center.z=low.z
for o in objects:
 for v in o.data.vertices:
  v.co-=center;v.co.x*=.85/(high.x-low.x);v.co.y*=.85/(high.y-low.y);v.co.z*=.48/(high.z-low.z)
for m in bpy.data.materials:
 m.surface_render_method='DITHERED';m.use_backface_culling=False
 # The landscape assembly sets MASK to avoid sorting blended cards.
 if m.use_nodes:
  principled=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
  if principled:
   principled.inputs['Roughness'].default_value=.85
finish('fab-grass-clump',objects)
load(Path('gatso-rt4/gatso-rt4.glb'))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.parent and o.parent.name=='Radar_1']
assert len(objects)==10
bake(objects)
# Portable tripod, separate flash and power box are omitted from the overhead copy.
steel=bpy.data.materials.new('Ceiling mounting steel');steel.diffuse_color=(.43,.49,.56,1);steel.use_nodes=True
p=next(n for n in steel.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Metallic'].default_value=.7;p.inputs['Roughness'].default_value=.4
bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.025,depth=.36,location=(0,.05,.47));mount=bpy.context.object;mount.data.materials.append(steel);objects.append(mount)
finish('fab-gatso-overhead',objects)
load(Path('plaggy-camera/cc0_camera.glb'))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
assert len(objects)==4
bake(objects)
points=[v.co for o in objects for v in o.data.vertices]
low=Vector([min(v[i]for v in points)for i in range(3)]);high=Vector([max(v[i]for v in points)for i in range(3)])
center=(low+high)/2;center.z=low.z
for o in objects:
 for v in o.data.vertices:v.co=(v.co-center)*(.55/(high.z-low.z))
for image in bpy.data.images:
 if image.type=='IMAGE' and image.size[0]:
  if max(image.size)>1024:
   scale=1024/max(image.size);image.scale(round(image.size[0]*scale),round(image.size[1]*scale))
  image.pack()
finish('fab-plaggy-camera',objects)
( ROOT/'docs/fab-replacement/prepared-assets.json').write_text(json.dumps(REPORT,indent=2)+'\n')
