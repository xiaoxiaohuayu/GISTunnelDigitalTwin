import sys
from pathlib import Path as _AssetPath
sys.path.insert(0, str(_AssetPath(__file__).resolve().parent))
from asset_paths import asset_path, source_path
"""Export the supplied Audi with its original material regions and two detail levels.
Blender -b --python scripts/build-vehicles.py. Source assets are read only.
"""
import bpy, math
from pathlib import Path
from mathutils import Matrix, Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'src/assets/modelAssets/equipment'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(source_path('高模车辆Audi+RS+Q8+2019.blend')),load_ui=False)
body=bpy.data.objects['Car Body']
for o in list(bpy.data.objects):
    if o!=body:bpy.data.objects.remove(o,do_unlink=True)
body.data.transform(body.matrix_world)
body.matrix_world=Matrix.Identity(4)
body.data.transform(Matrix.Rotation(math.pi/2,4,'Z'))
lo=Vector([min(v.co[i] for v in body.data.vertices) for i in range(3)])
hi=Vector([max(v.co[i] for v in body.data.vertices) for i in range(3)])
body.data.transform(Matrix.Diagonal(Vector((5/(hi.x-lo.x),)*3+(1,)))@Matrix.Translation(Vector((-(lo.x+hi.x)/2,-(lo.y+hi.y)/2,-lo.z))))

def pbr(name,color,metal=0,rough=.45,emission=None):
    m=bpy.data.materials.new('Audi / '+name);m.use_nodes=True
    m.node_tree.nodes.clear()
    p=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    output=m.node_tree.nodes.new('ShaderNodeOutputMaterial')
    m.node_tree.links.new(p.outputs['BSDF'],output.inputs['Surface'])
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if name=='Car Paint':
        p.inputs['Coat Weight'].default_value=.65;p.inputs['Coat Roughness'].default_value=.18
    if emission:
        p.inputs['Emission Color'].default_value=(*emission,1);p.inputs['Emission Strength'].default_value=.8
    return m

paint=None
for i,old in enumerate(list(body.data.materials)):
    name=old.name
    color=(.025,.03,.036);metal=.15;rough=.4;emission=None
    if name=='Car Paint':color=(.035,.17,.32);metal=.65;rough=.25
    elif name=='Tire':color=(.018,.021,.025);metal=0;rough=.92
    elif 'Rims' in name or name=='Glossy Mirror':color=(.42,.46,.49);metal=.88;rough=.2
    elif 'Brake' in name:color=(.18,.20,.22);metal=.8;rough=.55
    elif name=='Red metal':color=(.42,.012,.008);metal=.5;rough=.3
    elif 'Tail' in name or 'Tail lights' in name:
        color=(.35,.006,.009);metal=.15;rough=.22
        if 'Emission' in name:emission=(.7,.015,.005)
    elif 'Emission' in name or 'Emissiom' in name:
        color=(.8,.87,.92);metal=.15;rough=.25;emission=(.9,.95,1)
    elif 'Glass' in name or 'glass' in name:
        color=(.025,.055,.075);metal=.2;rough=.15
    elif 'Headlight' in name or 'HeadLight' in name:
        color=(.5,.58,.65);metal=.65;rough=.2
    elif 'Grey' in name:color=(.23,.25,.27);metal=.45;rough=.5
    elif 'Black Matte' in name or 'Carbon' in name:color=(.022,.026,.03);metal=.05;rough=.68
    m=pbr(name,color,metal,rough,emission)
    body.data.materials[i]=m
    if name=='Car Paint':paint=m
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
source=body.data.copy()
for asset,ratio,color in [('car-audi',.10,(.035,.17,.32)),('car-blue',.012,(.035,.17,.32)),('car-white',.012,(.72,.75,.77)),('car-orange',.012,(.65,.12,.025))]:
    body.data=source.copy();body.name=asset
    modifier=body.modifiers.new('Web detail budget','DECIMATE');modifier.ratio=ratio
    modifier.delimit={'MATERIAL','NORMAL'};modifier.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    next(n for n in paint.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Base Color'].default_value=(*color,1)
    bpy.ops.export_scene.gltf(filepath=str(asset_path(asset)),export_format='GLB',use_selection=True,export_yup=True,export_apply=True)
    print('VEHICLE',asset,'triangles',len(body.data.polygons),'materials',len(body.data.materials),flush=True)
