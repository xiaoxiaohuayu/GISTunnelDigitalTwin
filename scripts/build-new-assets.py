"""Convert the supplied 2026-10 models without modifying their originals.
Run: Blender -b --python scripts/build-new-assets.py
Metres, X-forward/Z-up in Blender; GLB Y-up. Textures embedded.
"""
import bpy, math, sys, json, struct, shutil
from pathlib import Path
from mathutils import Vector, Matrix
sys.path.insert(0, str(Path(__file__).resolve().parent))
from asset_paths import ROOT, PREPARED, asset_path
REPORT = []

def meshes():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']

def bounds(objects):
    bpy.context.view_layer.update()
    points = [o.matrix_world @ Vector(c) for o in objects for c in o.bound_box]
    lo = Vector([min(p[i] for p in points) for i in range(3)])
    hi = Vector([max(p[i] for p in points) for i in range(3)])
    return lo, hi

def normalize(objects, target, axis, rotation=0):
    # Transform a parent, preserving rigs and their local animation channels.
    bpy.ops.object.select_all(action='DESELECT')
    parent = bpy.data.objects.new('Export metre frame', None)
    bpy.context.scene.collection.objects.link(parent)
    roots = [o for o in objects if o.parent not in objects]
    for o in roots:
        matrix = o.matrix_world.copy(); o.parent = parent; o.matrix_world = matrix
    parent.rotation_euler.z = rotation
    bpy.context.view_layer.update()
    lo, hi = bounds([o for o in objects if o.type == 'MESH'])
    scale = target / (hi[axis] - lo[axis])
    parent.scale = (scale,) * 3
    parent.location = Vector((-(lo.x+hi.x)/2, -(lo.y+hi.y)/2, -lo.z)) * scale
    bpy.context.view_layer.update()
    return objects + [parent]

def root_skinned_meshes(path):
    # Blender already writes these skinned positions in metre coordinates.
    # glTF ignores a skinned mesh node's transform, but Cesium uses that node's
    # ancestors for its bounding volume. Keep meshes at the scene root so the
    # armature's centimetre scale is not applied to the bounds a second time.
    raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+length])
    indices={i for i,n in enumerate(doc['nodes']) if 'skin' in n}
    for node in doc['nodes']:
        if 'children' in node:node['children']=[i for i in node['children'] if i not in indices]
    roots=doc['scenes'][doc.get('scene',0)]['nodes']
    for i in sorted(indices):
        if i not in roots:roots.append(i)
    encoded=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();encoded+=b' '*(-len(encoded)%4)
    rest=raw[20+length:]
    path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(encoded)+len(rest))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+rest)

def export(name, objects, budget, animated=False, save=True):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active = next(o for o in objects if o.type == 'MESH')
    for image in bpy.data.images:
        if image.type == 'IMAGE' and image.has_data:
            image.pack()
    mesh = [o for o in objects if o.type == 'MESH']
    dep = bpy.context.evaluated_depsgraph_get()
    triangles = 0
    for o in mesh:
        evaluated = o.evaluated_get(dep); data = evaluated.to_mesh(); data.calc_loop_triangles()
        triangles += len(data.loop_triangles); evaluated.to_mesh_clear()
    assert triangles <= budget, (name, triangles, budget)
    if save:
        PREPARED.mkdir(parents=True, exist_ok=True)
        bpy.data.libraries.write(str(PREPARED / (name+'.blend')), set(objects), fake_user=True)
    bpy.ops.export_scene.gltf(filepath=str(asset_path(name)), export_format='GLB', use_selection=True,
        export_yup=True, export_apply=not animated, export_animations=animated,
        export_animation_mode='ACTIONS', export_frame_range=False, export_current_frame=True)
    if animated: root_skinned_meshes(asset_path(name))
    lo, hi = bounds(mesh)
    REPORT.append({'name':name, 'triangles':triangles, 'budget':budget,
        'dimensions':list(hi-lo), 'materials':len({m.name for o in mesh for m in o.data.materials if m}),
        'bytes':asset_path(name).stat().st_size})
    print('EXPORTED', REPORT[-1], flush=True)

def preview(name, objects):
    scene=bpy.context.scene
    for o in scene.objects: o.hide_render = o not in objects
    lo,hi=bounds([o for o in objects if o.type=='MESH']); size=max(hi-lo); target=(lo+hi)/2
    bpy.ops.object.camera_add(location=target+Vector((-1.3,-1.7,.9))*size)
    camera=bpy.context.object;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO';camera.data.ortho_scale=size*1.6;scene.camera=camera
    bpy.ops.object.light_add(type='AREA',location=target+Vector((-1,-2,3))*size)
    bpy.context.object.data.energy=1000*size*size;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=size*2
    scene.world=bpy.data.worlds.new('Inspection sky');scene.world.use_nodes=True
    next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND').inputs[0].default_value=(.35,.4,.5,1)
    next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND').inputs[1].default_value=.6
    scene.render.engine='CYCLES';scene.cycles.samples=8;scene.cycles.use_denoising=True
    scene.render.resolution_x=640;scene.render.resolution_y=480;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/f'docs/model-assets/{name}-preview.png');bpy.ops.render.render(write_still=True)

def load_gltf(folder):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'modelSources/new'/folder/'scene.gltf'))

# New switchyard: omit the 200 m studio plane and merge by material, retaining detail.
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'blendFile/originals/substation-new.blend'), load_ui=False)
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH' or o.name == 'Studio ground': bpy.data.objects.remove(o, do_unlink=True)
# Bake evaluated geometry so repeated bevel modifiers do not multiply draw calls.
parts=[];dep=bpy.context.evaluated_depsgraph_get()
for o in meshes():
    data=bpy.data.meshes.new_from_object(o.evaluated_get(dep),depsgraph=dep);data.transform(o.matrix_world)
    part=bpy.data.objects.new(o.name+' export',data);bpy.context.scene.collection.objects.link(part);parts.append(part)
for o in list(bpy.context.scene.objects):
    if o not in parts:bpy.data.objects.remove(o,do_unlink=True)
for mat in {o.data.materials[0] for o in parts if len(o.data.materials)==1}:
    group=[o for o in meshes() if len(o.data.materials)==1 and o.data.materials[0]==mat]
    bpy.ops.object.select_all(action='DESELECT')
    for o in group:o.select_set(True)
    bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join()
objects=normalize(list(bpy.context.scene.objects),8.5,1)
export('substation-new',objects,180000);preview('substation-new',objects)

# Old substation remains independently usable.
bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(str(ROOT/'blendFile/prepared/substation.blend'),link=False) as (src,dst): dst.objects=src.objects
for o in dst.objects:
    if o: bpy.context.scene.collection.objects.link(o)
export('substation-original',list(bpy.context.scene.objects),200000,save=False)

load_gltf('vanCar')
# The supplied van faces -X; turn it to the traffic system's +X convention.
objects=normalize(list(bpy.context.scene.objects),5,0,math.pi)
export('car-van',objects,10000);preview('car-van',objects)

load_gltf('water_tank_gltf')
objects=normalize(list(bpy.context.scene.objects),2.6,2)
export('water-tank',objects,10000);preview('water-tank',objects)

load_gltf('human')
for o in list(meshes()):
    if 'H50k' in o.name or any('H50k' in m.name for m in o.data.materials if m):
        bpy.data.objects.remove(o,do_unlink=True)
objects=normalize(list(bpy.context.scene.objects),1.75,2,math.pi/2)
export('human',objects,25000);preview('human',objects)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(ROOT/'modelSources/new/low_poly_human/Male_002.fbx'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
# Use the first supplied action frame as the static pose; retain all imported actions.
actions=list(bpy.data.actions)
if actions:
    rig.animation_data_create();rig.animation_data.action=actions[0]
    bpy.context.scene.frame_set(int(actions[0].frame_range[0]))
objects=normalize(list(bpy.context.scene.objects),1.75,2,math.pi/2)
export('worker',objects,25000,animated=True);preview('worker',objects)

# Detach the old station node only; preserve every other byte of authored geometry.
p=asset_path('portal-structures')
# Archive original composite alongside the detached station.
original=ROOT/'src/assets/modelAssets/legacy/portal-structures-original.glb'
if not original.exists():shutil.copy2(p,original)
b=p.read_bytes();length=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+length])
for node in doc['nodes']:
    if node.get('name','').startswith('substation'):
        node.pop('mesh',None);node['name']='Archived substation placement'
# The old building's lettering was merged with the portal lettering. Remove only
# triangles in that sign's authored bounds, leaving all other structures intact.
binary=bytearray(b[28+length:])
for node in doc['nodes']:
    if node.get('name')!='structures / Lettering and lamps': continue
    for primitive in doc['meshes'][node['mesh']]['primitives']:
        position=doc['accessors'][primitive['attributes']['POSITION']]
        view=doc['bufferViews'][position['bufferView']]
        start=view.get('byteOffset',0)+position.get('byteOffset',0)
        stride=view.get('byteStride',12)
        points=[struct.unpack_from('<3f',binary,start+i*stride) for i in range(position['count'])]
        index=doc['accessors'][primitive['indices']];view=doc['bufferViews'][index['bufferView']]
        code={5123:'H',5125:'I'}[index['componentType']];size=struct.calcsize(code)
        start=view.get('byteOffset',0)+index.get('byteOffset',0)
        indices=[struct.unpack_from('<'+code,binary,start+i*size)[0] for i in range(index['count'])]
        kept=[]
        for i in range(0,len(indices),3):
            triangle=indices[i:i+3]
            sign=all(abs(points[j][0]+55.05)<.05 and 2.9<points[j][1]<3.5 and abs(points[j][2])<2 for j in triangle)
            if not sign:kept.extend(triangle)
        if len(kept)==len(indices):continue
        binary.extend(b'\0'*(-len(binary)%4));offset=len(binary)
        binary.extend(struct.pack('<'+code*len(kept),*kept))
        doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(kept)*size,'target':34963})
        index.update(bufferView=len(doc['bufferViews'])-1,byteOffset=0,count=len(kept),min=[min(kept)],max=[max(kept)])
        print('Removed old sign triangles', (len(indices)-len(kept))//3, flush=True)
binary.extend(b'\0'*(-len(binary)%4));doc['buffers'][0]['byteLength']=len(binary)
encoded=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();encoded+=b' '*(-len(encoded)%4)
rest=struct.pack('<I4s',len(binary),b'BIN\0')+binary
p.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(encoded)+len(rest))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+rest)
(ROOT/'docs/model-assets/conversion.json').write_text(json.dumps(REPORT,indent=2)+'\n')
