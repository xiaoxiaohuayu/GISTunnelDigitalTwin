import sys
from pathlib import Path as _AssetPath
sys.path.insert(0, str(_AssetPath(__file__).resolve().parent))
from asset_paths import asset_path
"""Export both directions of the existing outer-wall evacuation sign."""
import bpy,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def mat(name,color,metal=0,emission=0):
 m=bpy.data.materials.new(name);m.use_nodes=True
 p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.4
 p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 return m

def box(name,pos,size,material):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.name=name;o.dimensions=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
 mod=o.modifiers.new('Manufacturing edges','BEVEL');mod.width=.01;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)

for direction,label in [('left','← 安全出口'),('right','安全出口 →')]:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 metal=mat('Steel casing',(.43,.49,.56),.75);green=mat('Exit green',(.015,.25,.09),emission=.6);white=mat('Reflective lettering',(.84,.93,.84),emission=.4)
 box('Exit housing',(0,0,0),(1.2,.08,.34),metal);box('Green face',(0,-.052,0),(1.14,.035,.28),green)
 c=bpy.data.curves.new('Exit lettering','FONT');c.body=label;c.align_x='CENTER';c.align_y='CENTER';c.size=.19;c.extrude=.001
 c.font=bpy.data.fonts.load('/System/Library/Fonts/STHeiti Medium.ttc')
 o=bpy.data.objects.new('Exit lettering',c);bpy.context.scene.collection.objects.link(o);o.location=(0,-.074,0);o.rotation_euler=(math.pi/2,0,0);c.materials.append(white)
 bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH')
 bpy.ops.object.select_all(action='SELECT')
 bpy.ops.export_scene.gltf(filepath=str(asset_path(f'escape-sign-{direction}')),export_format='GLB',use_selection=True,export_yup=True,export_apply=True)
 print('EXIT',direction,flush=True)
