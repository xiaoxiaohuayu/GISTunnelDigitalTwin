import sys
from pathlib import Path as _AssetPath
sys.path.insert(0, str(_AssetPath(__file__).resolve().parent))
from asset_paths import asset_path
"""Adapt the supplied axial fan grille into a tunnel jet-fan assembly."""
import bpy,math,importlib.util
from mathutils import Vector
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('convert',root/'scripts/convert-site-assets.py');c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
raw=c.open_asset('风机.obj');parts=c.freeze(raw);c.normalize(parts,height=.86,rotation=-math.pi/2)
for o in parts:
 bpy.context.view_layer.objects.active=o;m=o.modifiers.new('Web fan reduction','DECIMATE');m.ratio=.12;bpy.ops.object.modifier_apply(modifier=m.name)
 # The original motor housing is used at the front of the jet casing.
 for v in o.data.vertices:v.co.x+=1.05
steel=c.material('Jet fan brushed steel',(.43,.48,.51),.8,.32)
verts=[];faces=[]
for x,r in [(-1.4,.44),(-1.4,.40),(1.4,.40),(1.4,.44)]:
 verts += [(x,r*math.cos(i*math.tau/64),.43+r*math.sin(i*math.tau/64)) for i in range(64)]
for ring in range(4):
 for i in range(64):faces.append((ring*64+i,ring*64+(i+1)%64,((ring+1)%4)*64+(i+1)%64,((ring+1)%4)*64+i))
data=bpy.data.meshes.new('Double wall casing');data.from_pydata(verts,[],faces);data.materials.append(steel);o=bpy.data.objects.new('Jet casing',data);bpy.context.scene.collection.objects.link(o);parts.append(o)
for p in o.data.polygons:p.use_smooth=True
for x in [-.8,.8]:
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,0,1.0));o=bpy.context.object;o.dimensions=(.12,.12,.9);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(steel);parts+=c.freeze([o])
parts=c.freeze(parts);c.save('jet-fan',parts)
