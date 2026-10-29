import sys
from pathlib import Path as _AssetPath
sys.path.insert(0, str(_AssetPath(__file__).resolve().parent))
from asset_paths import asset_path
"""Build physical tunnel signs, hanging hardware and emergency fixtures, in metres.
Blender -b --python scripts/build-interior-fixtures.py
X along road, Z up. Overhead displays face -X; wall fixtures face -Y.
"""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'src/assets/modelAssets/equipment'
OUT.mkdir(parents=True,exist_ok=True)
font=None

def material(name,color,metal=0,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.4
 p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 return m

def reset():
 global font
 bpy.ops.wm.read_factory_settings(use_empty=True)
 font=bpy.data.fonts.load('/System/Library/Fonts/STHeiti Medium.ttc')
 return (material('Black LED enclosure',(.012,.02,.022)),material('Brushed aluminium',(.35,.43,.45),.75),material('Green LED',(.025,.85,.17),emission=2.4),material('Amber LED',(.95,.22,.025),emission=2),material('Reflective white',(.84,.93,.84),emission=.4),material('Safety yellow',(.86,.58,.04)))

def box(name,pos,size,mat,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
 if bevel:
  m=o.modifiers.new('Cast edges','BEVEL');m.width=bevel;m.segments=2;bpy.ops.object.modifier_apply(modifier=m.name)
 return o

def rod(a,b,r,mat):
 a,b=Vector(a),Vector(b);bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=(b-a).length,location=(a+b)/2);o=bpy.context.object;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();o.data.materials.append(mat)
 return o

def text(body,pos,size,mat,face='road'):
 c=bpy.data.curves.new('LED lettering','FONT');c.body=body;c.font=font;c.align_x='CENTER';c.align_y='CENTER';c.size=size;c.extrude=.001
 o=bpy.data.objects.new(body,c);bpy.context.scene.collection.objects.link(o);o.location=pos
 o.rotation_euler=(math.pi/2,0,-math.pi/2) if face=='road' else (math.pi/2,0,0) if face=='wall' else (0,0,math.pi/2)
 c.materials.append(mat);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)

def finish(name):
 # Merge by material, preserving real emissive surfaces and sharp lettering.
 for mat in list(bpy.data.materials):
  objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==mat]
  if not objects:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.select_set(True)
  bpy.context.view_layer.objects.active=objects[0]
  if len(objects)>1:bpy.ops.object.join()
 bpy.ops.object.select_all(action='SELECT')
 bpy.ops.export_scene.gltf(filepath=str(asset_path(name)),export_format='GLB',use_selection=True,export_yup=True,export_apply=True)
 print('BUILT',name,flush=True)

black,steel,green,amber,white,yellow=reset()
for y in [-2.15,2.15]:
 rod((0,y,6.25),(0,y,7.45),.035,steel)
 box('Roof fixing',(0,y,7.45),(.22,.22,.10),steel)
 box('Lane signal casing',(0,y,5.85),(.22,.9,.95),steel,.045)
 box('LED black face',(-.125,y,5.85),(.04,.79,.84),black,.02)
 # Filled green downward arrow, physically mounted rather than a screen-space label.
 points=[(-.075,.30),(.075,.30),(.075,-.05),(.23,-.05),(0,-.31),(-.23,-.05),(-.075,-.05)]
 mesh=bpy.data.meshes.new('Lane arrow');mesh.from_pydata([(-.151,y+a,5.85+b) for a,b in points],[],[tuple(range(len(points)))]);mesh.materials.append(green);o=bpy.data.objects.new('Green lane arrow',mesh);bpy.context.scene.collection.objects.link(o)
finish('lane-indicators')

black,steel,green,amber,white,yellow=reset()
for y in [-2.7,2.7]:rod((0,y,6.35),(0,y,7.12),.035,steel)
box('VMS housing',(0,0,5.85),(.3,6.8,1.05),steel,.055)
box('LED screen',(-.17,0,5.85),(.04,6.61,.88),black,.02)
text('保持车距  注意安全',(-.196,0,5.86),.46,amber)
for y in [-3.15,3.15]:
 box('Service fastening',(.17,y,5.85),(.1,.12,.35),steel)
finish('interior-vms')

black,steel,green,amber,white,yellow=reset()
box('Parking sign',(0,0,3.9),(.18,.9,1.3),steel,.03)
board=material('Emergency sign green',(.015,.24,.11),emission=.35)
box('Parking sign face',(-.11,0,3.9),(.04,.83,1.22),board)
text('P',(-.136,0,4.13),.48,white)
text('紧急停车带',(-.136,0,3.58),.14,white)
rod((.1,0,4.55),(.1,0,4.75),.035,steel)
finish('layby-sign')

black,steel,green,amber,white,yellow=reset()
box('Emergency telephone body',(0,0,0),(.48,.22,.82),steel,.045)
box('Yellow telephone cover',(0,-.13,0),(.42,.05,.75),yellow,.025)
text('SOS',(0,-.16,.24),.14,black,'wall')
box('Handset grip',(-.08,-.19,0),(.055,.07,.23),black,.02)
for z in [-.125,.125]:box('Handset earpiece',(-.08,-.20,z),(.13,.09,.065),black,.02)
for x in [.05,.115,.18]:
 for z in [-.11,-.045,.02]:box('Dial key',(x,-.17,z),(.035,.025,.035),white,.004)
rod((-.08,-.19,-.16),(-.04,-.17,-.32),.012,black)
finish('emergency-telephone')

import runpy
runpy.run_path(str(ROOT/'scripts/build-exit-signs.py'),run_name='__main__')

black,steel,green,amber,white,yellow=reset()
text('应 急 停 车',(0,0,.018),.67,white,'floor')
# Short yellow wheel stops, emergency side curb.
for x in [-9,9]:box('Parking wheel stop',(x,-1.1,.08),(.18,1.8,.16),yellow,.025)
finish('layby-marking')
