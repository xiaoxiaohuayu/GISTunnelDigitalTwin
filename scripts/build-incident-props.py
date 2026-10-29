import sys
from pathlib import Path as _AssetPath
sys.path.insert(0, str(_AssetPath(__file__).resolve().parent))
from asset_paths import asset_path
"""Build reusable traffic work-zone props and export supplied irregular stones."""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'src/assets/modelAssets/equipment'

def material(name,color,metal=0,rough=.65):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m

def part(name,pos,size,mat,rounded=False):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.name=name;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
    if rounded:
        mod=o.modifiers.new('Rounded edges','BEVEL');mod.width=.025;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def sphere(name,pos,scale,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,location=pos);o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(mat)
    for f in o.data.polygons:f.use_smooth=True
    return o

def limb(name,a,b,r,mat):
    a,b=Vector(a),Vector(b);bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=r,depth=(b-a).length,location=(a+b)/2)
    o=bpy.context.object;o.name=name;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();o.data.materials.append(mat)
    return o

def export(name):
    if name=='work-worker' and asset_path(name).exists():return
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(asset_path(name)),export_format='GLB',use_selection=True,export_yup=True,export_apply=True)
    print('PROP',name,flush=True)

for i in range(3):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with bpy.data.libraries.load(str(ROOT/f'blendFile/prepared/rock-{i}.blend'),link=False) as (src,dst):dst.objects=[f'rock-{i}']
    bpy.context.scene.collection.objects.link(dst.objects[0]);export(f'incident-rock-{i}')

bpy.ops.wm.read_factory_settings(use_empty=True)
orange=material('Safety orange',(.95,.16,.015));white=material('Reflective white',(.9,.92,.85));rubber=material('Rubber base',(.022,.025,.029))
part('Weighted rubber foot',(0,0,.045),(.42,.42,.09),rubber,True)
for i in range(6):
    bottom=.09+i*.1;top=bottom+.1
    bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=.18*(1-i/6)+.025,radius2=.18*(1-(i+1)/6)+.025,depth=.1,location=(0,0,(bottom+top)/2))
    bpy.context.object.data.materials.append(white if i in [2,4] else orange)
export('work-cone')

bpy.ops.wm.read_factory_settings(use_empty=True)
metal=material('Galvanized frame',(.37,.41,.44),.7,.35);white=material('Reflective board',(.88,.9,.86));orange=material('Warning orange',(.95,.12,.01))
for y in [-1.3,1.3]:
    part('Steel upright',(0,y,.77),(.08,.08,1.5),metal,True);part('Stable foot',(0,y,.07),(.75,.12,.14),metal,True)
part('Reflective board',(0,0,1.02),(.08,2.6,.9),white,True)
for i in range(7):
    y=-1.3+i*.4
    vertices=[(-.045,y,.57),(-.045,min(y+.2,1.3),.57),(-.045,min(y+.6,1.3),1.47),(-.045,min(y+.4,1.3),1.47)]
    mesh=bpy.data.meshes.new('Diagonal stripe');mesh.from_pydata(vertices,[],[(0,1,2,3)]);o=bpy.data.objects.new('Diagonal stripe',mesh);bpy.context.scene.collection.objects.link(o);o.data.materials.append(orange)
export('work-barrier')

bpy.ops.wm.read_factory_settings(use_empty=True)
vest=material('High visibility vest',(.95,.2,.025));reflect=material('Reflective vest tape',(.82,.91,.64));navy=material('Workwear',(.025,.055,.11));skin=material('Skin',(.62,.38,.23));boots=material('Safety boots',(.022,.024,.029));helmet=material('Safety helmet',(.98,.68,.045))
for y in [-.13,.13]:
    limb('Trouser leg',(0,y,.2),(0,y,.88),.095,navy);part('Safety boot',(-.06,y,.1),(.32,.20,.18),boots,True)
part('Vest torso',(0,0,1.15),(.28,.46,.56),vest,True)
for z in [.99,1.23]:part('Reflective vest band',(-.146,0,z),(.015,.47,.045),reflect)
limb('Neck',(0,0,1.4),(0,0,1.57),.08,skin)
sphere('Head',(0,0,1.64),(.13,.12,.16),skin);sphere('Helmet dome',(0,0,1.77),(.17,.16,.1),helmet);part('Helmet brim',(-.025,0,1.73),(.39,.34,.035),helmet,True)
limb('Left sleeve',(0,.28,1.38),(0,.34,1.04),.07,navy);sphere('Left glove',(0,.34,.98),(.075,.07,.09),reflect)
pivot=bpy.data.objects.new('Signal arm',None);bpy.context.scene.collection.objects.link(pivot);pivot.location=(0,-.28,1.4)
for o in [limb('Signal sleeve',(0,0,0),(-.32,-.04,.08),.07,navy),limb('Signal forearm',(-.32,-.04,.08),(-.54,-.04,.24),.06,navy),sphere('Signal glove',(-.56,-.04,.26),(.085,.07,.09),reflect)]:o.parent=pivot
export('work-worker')
