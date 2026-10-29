import sys
from pathlib import Path as _AssetPath
sys.path.insert(0, str(_AssetPath(__file__).resolve().parent))
from asset_paths import asset_path
"""Model the three entrance signs visible in the reference video.
Blender -b --python scripts/build-portal-signs.py. X points into the tunnel.
The shared portal frame places this assembly on both inbound approaches.
"""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name,color,metal=0,rough=.5):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m

red=material('Traffic red',(.72,.012,.02))
white=material('Reflective white',(.92,.94,.91))
blue=material('No stopping blue',(.015,.065,.32))
black=material('Black lettering',(.008,.012,.016))
steel=material('Galvanized support',(.46,.51,.54),.7,.34)

def rod(name,a,b,r,mat):
    a,b=Vector(a),Vector(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=r,depth=(b-a).length,location=(a+b)/2)
    o=bpy.context.object;o.name=name;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();o.data.materials.append(mat)
    for face in o.data.polygons:face.use_smooth=len(face.vertices)==4
    return o

def disc(name,x,y,z,radius,depth,mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=radius,depth=depth,location=(x,y,z),rotation=(0,math.pi/2,0))
    bpy.context.object.name=name;bpy.context.object.data.materials.append(mat)

x,z=-36,6.95
rod('Cantilever post',(x+.18,-18.3,.15),(x+.18,-18.3,7.5),.095,steel)
rod('Cantilever sign beam',(x+.18,-18.3,z),(x+.18,-9.4,z),.075,steel)
for y in [-10.4,-12,-13.6]:
    disc('Galvanized sign back',x+.03,y,z,.65,.045,steel)
    disc('Red circular border',x-.015,y,z,.65,.035,red)
    disc('Sign face',x-.04,y,z,.535,.02,blue if y==-12 else white)
    # Two rear clamps and their short mounting stubs.
    for dy in [-.25,.25]:rod('Sign mounting clamp',(x+.04,y+dy,z),(x+.14,y+dy,z),.035,steel)

# Prohibition pictogram made from geometry, so it stays crisp at close range.
y=-10.4;front=x-.07
for a,b in [((-.03,.17),(.04,-.09)),((.04,-.09),(-.2,-.35)),((.04,-.09),(.22,-.33)),((-.02,.12),(-.23,-.02)),((-.02,.12),(.19,.08))]:
    rod('Walking person',(front,y+a[0],z+a[1]),(front,y+b[0],z+b[1]),.035,black)
disc('Walking person head',front,y-.055,z+.31,.075,.018,black)
rod('Pedestrian prohibition slash',(front-.025,y-.36,z-.36),(front-.025,y+.36,z+.36),.045,red)
for sign in [-1,1]:rod('No stopping cross',(front,-12-.37,z-sign*.37),(front,-12+.37,z+sign*.37),.045,red)

letters=bpy.data.curves.new('Limit 60 lettering','FONT');letters.body='60';letters.align_x='CENTER';letters.align_y='CENTER';letters.size=.79;letters.extrude=.001
obj=bpy.data.objects.new('Speed limit 60',letters);bpy.context.scene.collection.objects.link(obj)
obj.location=(x-.057,-13.6,z);obj.rotation_euler=(math.pi/2,0,-math.pi/2);letters.materials.append(black)
bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.convert(target='MESH')
(ROOT/'blendFile/scenes').mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blendFile/scenes/portal-signs.blend'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(asset_path('portal-signs')),export_format='GLB',use_selection=True,export_yup=True,export_apply=True)
print('Entrance signs exported')
