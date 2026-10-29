import sys
from pathlib import Path as _AssetPath
sys.path.insert(0, str(_AssetPath(__file__).resolve().parent))
from asset_paths import asset_path, source_path
"""Convert supplied assets to metre-scale, X-forward, Z-up reusable meshes.
Blender -b --python scripts/convert-site-assets.py -- [props|trees]
Original files in blendFile/originals and modelSources are read only.
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'blendFile/prepared';OUT.mkdir(parents=True,exist_ok=True)
WEB=ROOT/'src/assets/modelAssets/equipment';WEB.mkdir(parents=True,exist_ok=True)


def material(name,color,metal=0,rough=.6):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 return m

def open_asset(name):
 p=source_path(name)
 if p.suffix=='.blend':bpy.ops.wm.open_mainfile(filepath=str(p),load_ui=False)
 else:
  bpy.ops.wm.read_factory_settings(use_empty=True)
  if p.suffix=='.fbx':bpy.ops.import_scene.fbx(filepath=str(p))
  else:bpy.ops.wm.obj_import(filepath=str(p))
 bpy.context.view_layer.update()
 return [o for o in bpy.context.scene.objects if o.type=='MESH']

def freeze(objects):
 dep=bpy.context.evaluated_depsgraph_get();result=[]
 for o in objects:
  data=bpy.data.meshes.new_from_object(o.evaluated_get(dep),depsgraph=dep)
  data.transform(o.matrix_world)
  n=bpy.data.objects.new(o.name+'_export',data);bpy.context.scene.collection.objects.link(n);result.append(n)
 return result

def normalize(objects,height=None,length=None,rotation=0):
 r=Matrix.Rotation(rotation,4,'Z')
 for o in objects:o.data.transform(r)
 vs=[v.co for o in objects for v in o.data.vertices]
 lo=Vector([min(v[i] for v in vs) for i in range(3)]);hi=Vector([max(v[i] for v in vs) for i in range(3)])
 scale=height/(hi.z-lo.z) if height else length/(hi.x-lo.x) if length else 1
 center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
 transform=Matrix.Diagonal(Vector((scale,scale,scale,1)))@Matrix.Translation(-center)
 for o in objects:o.data.transform(transform)
 return list((hi-lo)*scale)

def images_for_web():
 for image in bpy.data.images:
  if image.type!='IMAGE' or not image.size[0]:continue
  if max(image.size)>1024:
   scale=1024/max(image.size);image.scale(max(1,int(image.size[0]*scale)),max(1,int(image.size[1]*scale)))
  image.pack()

def save(name,objects):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 # Join reduces per-instance draw calls while preserving material slots and UVs.
 bpy.ops.object.join();joined=bpy.context.object;joined.name=name
 bpy.data.libraries.write(str(OUT/(name+'.blend')),{joined},fake_user=True)
 if name not in {'car-blue','car-white','car-orange','camera','fire-cabinet','jet-fan'}:
  print('PREPARED',name,'faces',len(joined.data.polygons),flush=True)
  return joined
 bpy.ops.export_scene.gltf(filepath=str(asset_path(name)),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_image_format='AUTO')
 print('CONVERTED',name,'verts',len(joined.data.vertices),'faces',len(joined.data.polygons),flush=True)
 return joined

def props():
 # Single-arm pole. The source also includes a separate double-arm alternative.
 raw=open_asset('路灯.fbx');objects=freeze([next(o for o in raw if o.name=='1 sided lights')]);normalize(objects,height=8)
 for o in objects:
  bpy.context.view_layer.objects.active=o
  m=o.modifiers.new('Web mesh reduction','DECIMATE');m.ratio=.17;bpy.ops.object.modifier_apply(modifier=m.name)
 images_for_web();save('streetlight',objects)
 raw=open_asset('护栏.fbx');objects=freeze(raw)
 # The source is a small grouped set; its road barrier is selected after inspection.
 # Vertical steel barrier components are around X=-0.014 in source world space.
 objects=[o for o in objects if max(v.co.x for v in o.data.vertices)<-.012]
 normalize(objects,height=1.05,rotation=-math.pi/2)
 metal=material('Galvanised barrier',(.48,.53,.55),.72,.33)
 for o in objects:o.data.materials.clear();o.data.materials.append(metal)
 save('guardrail',objects)
 raw=open_asset('变电所.blend');objects=freeze(raw);normalize(objects)
 images_for_web();save('substation',objects)
 raw=open_asset('石头.blend')
 for i,key in enumerate(['stone_small_a','stone_small_b','stone_small_c']):
  objects=freeze([next(o for o in raw if o.name==key)]);normalize(objects)
  # Source stones contain geometry but no image maps. A baked surface is added below.
  rock=material('Weathered limestone',(.38,.39,.34),0,.95)
  nodes=rock.node_tree.nodes;links=rock.node_tree.links;p=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
  noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=5;noise.inputs['Detail'].default_value=5
  ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.2;ramp.color_ramp.elements[0].color=(.11,.12,.10,1);ramp.color_ramp.elements[1].position=.8;ramp.color_ramp.elements[1].color=(.56,.55,.47,1)
  links.new(noise.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs['Color'],p.inputs['Base Color'])
  for o in objects:o.data.materials.clear();o.data.materials.append(rock)
  bake_base(objects,rock,'limestone-'+str(i))
  save('rock-'+str(i),objects)
 # Use the material regions in the supplied detailed vehicle, including its traffic LODs.
 import runpy
 runpy.run_path(str(ROOT/'scripts/build-vehicles.py'),run_name='__main__')
 # Existing supplied camera and fire cabinet can replace the coarse interior placeholders.
 for filename,name,height in [('摄像机.blend','camera',.55),('消防栓.blend','fire-cabinet',1.5)]:
  if name=='camera' and asset_path(name).exists():continue
  raw=open_asset(filename)
  if name=='fire-cabinet':
   raw=[o for o in raw if abs((sum((o.matrix_world@Vector(c) for c in o.bound_box),Vector())/8).x)<2.1]
  objects=freeze(raw);normalize(objects,height=height)
  if name=='camera':
   for o in objects:
    for material in o.data.materials:
     if material and material.use_nodes:
      for node in material.node_tree.nodes:
       if node.type=='BSDF_PRINCIPLED':
        node.inputs['Base Color'].default_value=(.78,.8,.82,1)
        node.inputs['Metallic'].default_value=0
        node.inputs['Roughness'].default_value=.72
  if name=='fire-cabinet':
   for o in objects:
    bpy.context.view_layer.objects.active=o
    mod=o.modifiers.new('Web cabinet reduction','DECIMATE');mod.ratio=.035;bpy.ops.object.modifier_apply(modifier=mod.name)
  images_for_web();save(name,objects)
  if name=='camera':
   import runpy
   runpy.run_path(str(ROOT/'scripts/repair-camera-materials.py'),run_name='__main__')


def bake_base(objects,material,name):
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 if not objects[0].data.uv_layers:
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
 image=bpy.data.images.new(name,width=512,height=512)
 tex=material.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;material.node_tree.nodes.active=tex
 scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
 bpy.ops.object.bake(type='DIFFUSE');image.pack()
 p=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED');material.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])


def trees():
 path=ROOT/'blendFile/originals/trees/Finish tree.blend';bpy.ops.wm.open_mainfile(filepath=str(path),load_ui=False)
 # Rebuild leaf shaders as glTF PBR, with packed RGBA instead of a Cycles-only translucency mix.
 leaf_dir=path.parent/'leaf';bark_dir=path.parent/'bark'
 albedo=bpy.data.images.load(str(leaf_dir/'TexturesCom_Leaves_EuropeanBeech01_4K_albedo.tif'),check_existing=True)
 alpha=bpy.data.images.load(str(leaf_dir/'TexturesCom_Leaves_EuropeanBeech01_4K_alpha.tif'),check_existing=True)
 albedo.scale(1024,1024);alpha.scale(1024,1024)
 import numpy as np
 rgba=np.empty(1024*1024*4,dtype=np.float32);mask=rgba.copy();albedo.pixels.foreach_get(rgba);alpha.pixels.foreach_get(mask);rgba[3::4]=mask[::4]
 albedo.pixels.foreach_set(rgba);albedo.update();albedo.pack()
 leafmat=material('Beech leaves',(.25,.43,.12),0,.8);leafmat.surface_render_method='DITHERED';leafmat.use_backface_culling=False
 n=leafmat.node_tree.nodes.new('ShaderNodeTexImage');n.image=albedo
 p=next(n for n in leafmat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');leafmat.node_tree.links.new(n.outputs['Color'],p.inputs['Base Color']);clip=leafmat.node_tree.nodes.new('ShaderNodeMath');clip.operation='GREATER_THAN';clip.inputs[1].default_value=.4;leafmat.node_tree.links.new(n.outputs['Alpha'],clip.inputs[0]);leafmat.node_tree.links.new(clip.outputs[0],p.inputs['Alpha'])
 barkmat=material('Beech bark',(.28,.24,.16),0,.95)
 image=bpy.data.images.load(str(bark_dir/'Bark_09_4K_Base_Color.png'));image.scale(341,1024);image.pack()
 n=barkmat.node_tree.nodes.new('ShaderNodeTexImage');n.image=image;p=next(n for n in barkmat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');barkmat.node_tree.links.new(n.outputs['Color'],p.inputs['Base Color'])
 dep=bpy.context.evaluated_depsgraph_get();objects=[]
 # Use one tree's particle instances. The second tree and component display objects are excluded.
 for instance in dep.object_instances:
  if instance.is_instance:
   if not instance.parent or instance.parent.original.name!='tree':continue
  elif instance.object.original.name!='tree':continue
  data=bpy.data.meshes.new_from_object(instance.object, depsgraph=dep);data.transform(instance.matrix_world)
  o=bpy.data.objects.new('Beech branch',data);bpy.context.scene.collection.objects.link(o)
  for i,m in enumerate(o.data.materials):o.data.materials[i]=leafmat if m and ('leaf' in m.name.lower() or 'leav' in m.name.lower()) else barkmat
  objects.append(o)
 print('TREE parts',len(objects),[(m.name if m else '') for o in objects[:2] for m in o.data.materials],flush=True)
 normalize(objects,height=11)
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();tree=bpy.context.object
 # Render the actual supplied tree for lightweight background billboards.
 for o in list(bpy.context.scene.objects):o.hide_render=(o!=tree)
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.view_settings.exposure=1.1;scene.cycles.samples=12;scene.cycles.use_denoising=True
 scene.world=bpy.data.worlds.new('Tree render sky');scene.world.use_nodes=True;next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND').inputs[0].default_value=(.6,.72,.85,1);next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND').inputs[1].default_value=.7
 bpy.ops.object.light_add(type='SUN',location=(0,-10,15));sun=bpy.context.object;sun.rotation_euler=(.5,-.4,-.5);sun.data.energy=2
 bpy.ops.object.camera_add(location=(18,-25,7));cam=bpy.context.object;target=Vector((0,0,5.5));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=14;scene.camera=cam
 scene.render.film_transparent=True;scene.render.resolution_x=1024;scene.render.resolution_y=1024;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.filepath=str(ROOT/'modelSources/prepared/tree-billboard.png');bpy.ops.render.render(write_still=True)
 # Reduce full mesh for near trees, preserving leaf silhouette with modest mesh simplification.
 import bmesh, random
 random.seed(17)
 bm=bmesh.new();bm.from_mesh(tree.data)
 remove=[f for f in bm.faces if 'leaves' in tree.data.materials[f.material_index].name.lower() and random.random()>.13]
 bmesh.ops.delete(bm,geom=remove,context='FACES')
 bm.to_mesh(tree.data);bm.free();tree.data.update()
 save('tree-near',[tree])
 bpy.ops.wm.read_factory_settings(use_empty=True)
 m=material('Beech photographic impostor',(1,1,1),0,1);m.surface_render_method='DITHERED';m.use_backface_culling=False
 image=bpy.data.images.load(str(ROOT/'modelSources/prepared/tree-billboard.png'));image.pack();n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=image;p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');m.node_tree.links.new(n.outputs['Color'],p.inputs['Base Color']);clip=m.node_tree.nodes.new('ShaderNodeMath');clip.operation='GREATER_THAN';clip.inputs[1].default_value=.35;m.node_tree.links.new(n.outputs['Alpha'],clip.inputs[0]);m.node_tree.links.new(clip.outputs[0],p.inputs['Alpha'])
 # The billboard already contains baked daylight. Export it unlit to avoid shading it twice.
 output=next(node for node in m.node_tree.nodes if node.type=='OUTPUT_MATERIAL')
 transparent=m.node_tree.nodes.new('ShaderNodeBsdfTransparent');mix=m.node_tree.nodes.new('ShaderNodeMixShader')
 m.node_tree.links.new(clip.outputs[0],mix.inputs[0]);m.node_tree.links.new(transparent.outputs[0],mix.inputs[1]);m.node_tree.links.new(n.outputs['Color'],mix.inputs[2]);m.node_tree.links.new(mix.outputs[0],output.inputs['Surface'])
 # Three crossed planes reduce angle-dependent flattening of distant trees.
 parts=[]
 for a in [0,math.pi/3,math.pi*2/3]:
  bpy.ops.mesh.primitive_plane_add(size=2,location=(0,0,5.5));o=bpy.context.object;o.rotation_euler=(math.pi/2,0,a);o.scale=(7,7,7);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m);parts.append(o)
 parts=freeze(parts);save('tree-far',parts)

if __name__=='__main__':
 if sys.argv[-1]=='trees':trees()
 else:props()
