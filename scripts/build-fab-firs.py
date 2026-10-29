"""Extract three Fir variants and their LODs without changing the supplied blend.
Blender -b --python scripts/build-fab-firs.py
Intermediate GLB goes to modelSources; only the assembled terrain is published.
"""
import bpy, json, math, struct
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'blendFile/scenes/christmass_trees_pack.blend'
OUTPUT=ROOT/'modelSources/processed/fir-library.glb'
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE),load_ui=False)
materials={};images={};parts=[];report=[]

def image(name,limit):
    if name in images:return images[name]
    original=bpy.data.images[name]
    result=original.copy();result.name='Fir / '+name
    if max(result.size)>limit:
        factor=limit/max(result.size);result.scale(round(result.size[0]*factor),round(result.size[1]*factor))
    result.pack();images[name]=result
    return result

def pbr(name,albedo,normal=None,leaves=False,limit=2048):
    if name in materials:return materials[name]
    material=bpy.data.materials.new(name);material.use_nodes=True
    material.node_tree.nodes.clear();nodes=material.node_tree.nodes;links=material.node_tree.links
    output=nodes.new('ShaderNodeOutputMaterial');shader=nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Metallic'].default_value=0;shader.inputs['Roughness'].default_value=.82
    links.new(shader.outputs['BSDF'],output.inputs['Surface'])
    color=nodes.new('ShaderNodeTexImage');color.image=image(albedo,limit)
    links.new(color.outputs['Color'],shader.inputs['Base Color'])
    if leaves:
        links.new(color.outputs['Alpha'],shader.inputs['Alpha'])
        material.surface_render_method='DITHERED';material.use_backface_culling=False
    if normal:
        texture=nodes.new('ShaderNodeTexImage');texture.image=image(normal,min(limit,1024))
        texture.image.colorspace_settings.name='Non-Color'
        bump=nodes.new('ShaderNodeNormalMap');links.new(texture.outputs['Color'],bump.inputs['Color'])
        links.new(bump.outputs['Normal'],shader.inputs['Normal'])
    materials[name]=material;return material

bark=pbr('Fir bark','BarkAlbedo.png','Bark_normal.png',limit=1024)
needles=pbr('Fir needles','BrunchesAlbedo.png','Brunches_normal.png',leaves=True,limit=2048)
for variant,suffix in [('a',''),('b','_2'),('c','_3')]:
    for lod in [0,2,3]:
        original=bpy.data.objects[f'Christmas tree{suffix}_LOD{lod}']
        data=original.data.copy();data.transform(original.matrix_world)
        # Remove the source pack's display-grid offset and put the pivot at ground level.
        lo=Vector([min(v.co[i] for v in data.vertices)for i in range(3)])
        hi=Vector([max(v.co[i] for v in data.vertices)for i in range(3)])
        scale=11/(hi.z-lo.z)
        center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
        data.transform(Matrix.Diagonal(Vector((scale,scale,scale,1)))@Matrix.Translation(-center))
        if lod==3:
            billboard=pbr(f'Fir billboard {variant}',f'Christmas tree{suffix}_BillboardAlbedo.png',leaves=True,limit=1024)
            data.materials.clear();data.materials.append(billboard)
            for polygon in data.polygons:polygon.material_index=0
        else:
            indices=[p.material_index for p in data.polygons]
            data.materials.clear();data.materials.append(bark);data.materials.append(needles)
            for polygon,index in zip(data.polygons,indices):polygon.material_index=index
        name=f'fir-{variant}-lod{lod}'
        obj=bpy.data.objects.new(name,data);bpy.context.scene.collection.objects.link(obj);parts.append(obj)
        data.calc_loop_triangles()
        triangles=len(data.loop_triangles)
        assert triangles<15000 if lod<3 else triangles<=24
        report.append({'name':name,'triangles':triangles,'height':11,'source':original.name})
for obj in list(bpy.context.scene.objects):
    if obj not in parts:bpy.data.objects.remove(obj,do_unlink=True)
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active=parts[0]
bpy.data.libraries.write(str(ROOT/'blendFile/prepared/fab-firs.blend'),set(parts),fake_user=True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT),export_format='GLB',use_selection=True,
    export_yup=True,export_apply=True,export_animations=False)
# Use alpha testing for needles and impostors instead of sorting hundreds of blended cards.
raw=OUTPUT.read_bytes();size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size])
for material in doc['materials']:
    if 'needles' in material['name'] or 'billboard' in material['name']:
        material.update(alphaMode='MASK',alphaCutoff=.45,doubleSided=True)
    if 'billboard' in material['name']:
        material.setdefault('extensions',{})['KHR_materials_unlit']={}
        if 'KHR_materials_unlit'not in doc.setdefault('extensionsUsed',[]):doc['extensionsUsed'].append('KHR_materials_unlit')
encoded=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();encoded+=b' '*(-len(encoded)%4)
rest=raw[20+size:];OUTPUT.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(encoded)+len(rest))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+rest)
(ROOT/'docs/fab-replacement/fir-conversion.json').write_text(json.dumps(report,indent=2)+'\n')
print('FIR LIBRARY',OUTPUT.stat().st_size,report,flush=True)
# Single representative tree for material and silhouette review.
for obj in parts:obj.hide_render=obj!=parts[0]
scene=bpy.context.scene;scene.world=bpy.data.worlds.new('Inspection sky');scene.world.use_nodes=True
sky=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND');sky.inputs[0].default_value=(.42,.48,.58,1);sky.inputs[1].default_value=.7
bpy.ops.object.light_add(type='SUN',location=(0,-10,15));bpy.context.object.rotation_euler=(.4,-.4,-.6);bpy.context.object.data.energy=2
bpy.ops.object.camera_add(location=(15,-23,12));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,5.5))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=15;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
scene.render.resolution_x=640;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/'docs/fab-replacement/fir-preview.png');bpy.ops.render.render(write_still=True)
