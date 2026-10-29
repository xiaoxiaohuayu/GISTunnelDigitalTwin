import sys
from pathlib import Path as _AssetPath
sys.path.insert(0, str(_AssetPath(__file__).resolve().parent))
from asset_paths import asset_path
"""Blender 4.5: editable portal campus, in metres, X along bore / Y across / Z up.
Run: /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/build-portal-site.py
"""
import bpy, math, random, shutil
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
random.seed(42)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def mat(name, color, roughness=0.85, metal=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if p is None: p = m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metal
    return m

concrete = mat('Warm architectural concrete', (0.36, .38, .36))
trim = mat('Limestone portal rim', (.69, .71, .64))
steel = mat('Galvanised guardrail', (.47, .53, .55), .38, .65)
dark = mat('Anthracite board', (.025, .035, .032))
white = mat('Lettering and lamps', (.91, .93, .85))
glass = mat('Window blue glass', (.12, .22, .25), .24, .35)
brick = mat('Management building terracotta', (.53, .32, .24))
rock_mats = [mat('Limestone stratum %d' % i, (.29+i*.025, .30+i*.024, .26+i*.024)) for i in range(6)]
leaves = [mat('Canopy %d' % i, (.055+i*.012, .14+i*.022, .035+i*.007)) for i in range(7)]
bark = mat('Tree bark', (.16, .12, .075))

import numpy as np
from mathutils.noise import noise_vector
ground_material = mat('Poliigon_GrassPatchyGround_4585', (1,1,1))
texture_root = ROOT/'modelSources/legacy/Poliigon_GrassPatchyGround_4585/2K'
shader = next(n for n in ground_material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
for channel, socket, extension in [('BaseColor','Base Color','jpg'),('Roughness','Roughness','jpg'),('Normal','Normal','png')]:
    node = ground_material.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = bpy.data.images.load(str(texture_root/f'Poliigon_GrassPatchyGround_4585_{channel}.{extension}'))
    node.image.colorspace_settings.name = 'sRGB' if channel=='BaseColor' else 'Non-Color'
    node.image.pack()
    output = node.outputs['Color']
    if channel=='Normal':
        normal = ground_material.node_tree.nodes.new('ShaderNodeNormalMap')
        ground_material.node_tree.links.new(output,normal.inputs['Color'])
        output = normal.outputs['Normal']
    ground_material.node_tree.links.new(output,shader.inputs[socket])
grasses = [ground_material]*6
# The sampled GIS transition uses the same images and four-metre UV scale.
(ROOT/'public/textures').mkdir(parents=True,exist_ok=True)
for channel, target in [('BaseColor','basecolor'),('Roughness','roughness')]:
    shutil.copy2(texture_root/f'Poliigon_GrassPatchyGround_4585_{channel}.jpg',ROOT/f'public/textures/grass-4585-{target}.jpg')

red = mat('LED red', (.8, .045, .015))
next(n for n in red.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Emission Color'].default_value = (.9,.025,.005,1)
next(n for n in red.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Emission Strength'].default_value = 1.5

random.seed(42)
collections = {}
for name in ['terrain', 'structures']:
    c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); collections[name] = c

def assign(obj, name, material, group='structures'):
    obj.name = name
    for c in list(obj.users_collection): c.objects.unlink(obj)
    collections[group].objects.link(obj)
    obj.data.materials.append(material)
    return obj

def box(name, pos, size, material, group='structures', bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    o = bpy.context.object; o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(o, name, material, group)
    if bevel:
        b = o.modifiers.new('Soft cast edges', 'BEVEL'); b.width=bevel; b.segments=2
        bpy.ops.object.modifier_apply(modifier=b.name)
        o.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return o

def mesh(name, verts, faces, material, group='terrain'):
    data = bpy.data.meshes.new(name); data.from_pydata(verts, [], faces); data.update()
    o = bpy.data.objects.new(name, data); collections[group].objects.link(o); o.data.materials.append(material)
    return o

def rod(name, a, b, r, material, group='structures', vertices=10):
    a,b=Vector(a),Vector(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=r, depth=(b-a).length, location=(a+b)/2)
    o=bpy.context.object; o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return assign(o,name,material,group)

font_path = '/System/Library/Fonts/PingFang.ttc'
font = bpy.data.fonts.load(font_path) if Path(font_path).exists() else None

def text(name, value, pos, size, material):
    data=bpy.data.curves.new(name, 'FONT'); data.body=value; data.align_x='CENTER'; data.align_y='CENTER'; data.size=size; data.extrude=.006
    if font: data.font=font
    o=bpy.data.objects.new(name,data); collections['structures'].objects.link(o)
    o.location=pos; o.rotation_euler=(math.pi/2,0,-math.pi/2); data.materials.append(material)
    bpy.context.view_layer.objects.active=o; o.select_set(True); bpy.ops.object.convert(target='MESH'); o.select_set(False)
    return o

def arch_cutter(y, start, end, radius=5.53):
    cross=[(-radius,-3), (radius,-3), (radius,2.5)]
    cross += [(radius*math.cos(i*math.pi/48),2.5+radius*math.sin(i*math.pi/48)) for i in range(1,49)]
    verts=[(x,y+v,z) for x in [start,end] for v,z in cross]; n=len(cross)
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    o=mesh('Temporary horseshoe cutter',verts,faces,dark)
    # The cross section is CCW when viewed in the +X direction.
    return o

def subtract(obj,cutter):
    bpy.context.view_layer.objects.active=obj
    m=obj.modifiers.new('Real open bore', 'BOOLEAN'); m.operation='DIFFERENCE'; m.solver='EXACT'; m.object=cutter
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cutter,do_unlink=True)

# The outer ring in Cesium connects these exact edge heights to sampled terrain.
def hill(x,y):
    side=max(0,1-(abs(y)/100)**2)
    return 1.8 + side*(15 + 30*math.sin(math.pi*x/440) + 3*math.sin(x*.065+y*.08) + 1.8*math.sin(y*.22+x*.12))

nx,ny=55,50
verts=[((1.6+1.1*math.sin((-100+200*j/ny)*.27)) if i==0 else 220*i/nx,-100+200*j/ny,hill(220*i/nx,-100+200*j/ny)) for i in range(nx+1) for j in range(ny+1)]
faces=[]
for i in range(nx):
    for j in range(ny):
        a=i*(ny+1)+j; b=a+ny+1
        faces += [(a,b,b+1),(a,b+1,a+1)]
border=list(range(ny+1))+[i*(ny+1)+ny for i in range(1,nx+1)]+[nx*(ny+1)+j for j in range(ny-1,-1,-1)]+[i*(ny+1) for i in range(nx-1,0,-1)]
previous=border
for band in range(1,10):
    t=band/9
    ring=[]
    for k in border:
        x,y,top=verts[k];z=top*(1-t)-4*t
        if k<=ny:
            x+=math.sin(math.pi*t)*(1.3*math.sin(y*.43+z*.8)+.7*math.sin(y*.91-z*.48))
        ring.append(len(verts));verts.append((x,y,z))
    for i,k in enumerate(previous):
        j=(i+1)%len(border);faces.append((k,previous[j],ring[j],ring[i]))
    previous=ring
faces.append(tuple(reversed(previous)))
mountain=mesh('Sculpted mountain with two excavated bores',verts,faces,grasses[2])
# Recalculate normals before boolean operations.
bpy.context.view_layer.objects.active=mountain; mountain.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT'); mountain.select_set(False)
for y in [-12,12]: subtract(mountain,arch_cutter(y,-3,224,6.12))
for m in rock_mats+grasses: mountain.data.materials.append(m)
for p in mountain.data.polygons:
    p.material_index = 1 if p.center.x < 8 else 0
    p.use_smooth = p.center.x > 8
# Forecourt follows road grade. Roads themselves remain the continuous GIS alignment.
box('Grassed entrance platform',(-90,0,-.48),(180,200,.8),grasses[2], 'terrain')
# Supplied models share mesh data across placements to avoid duplicating geometry buffers.
ready = ROOT / 'blendFile/prepared'
templates = {}
def load_template(name):
    if name not in templates:
        with bpy.data.libraries.load(str(ready / (name + '.blend')), link=False) as (source, dest):
            dest.objects = [name]
        templates[name] = dest.objects[0]
    return templates[name]

def place(name, pos, scale=1, rotation=0, group='structures'):
    template = load_template(name)
    o = template.copy(); o.data = template.data
    collections[group].objects.link(o)
    o.location = pos; o.rotation_euler.z = rotation
    o.scale = (scale, scale, scale) if isinstance(scale, (int,float)) else scale
    o['supplied_asset'] = name
    return o

# Natural rock geometry and its baked limestone material replace the old ico-spheres.
rock = rock_mats[2]
# The cliff uses a tiling surface; the supplied stone atlas is only valid on its own UVs.
texture=bpy.data.images.new('Cliff mineral detail',width=256,height=256)
colors=np.empty((256,256,4),dtype=np.float32)
for iy in range(256):
    for ix in range(256):
        n=noise_vector(Vector((ix/22,iy/14,3.2))).x*.17+noise_vector(Vector((ix/4,iy/3,1))).x*.05
        value=.48+n*.6
        colors[iy,ix]=(value*1.02,value,value*.96,1)
texture.pixels.foreach_set(colors.ravel());texture.pack()
node=rock.node_tree.nodes.new('ShaderNodeTexImage');node.image=texture
shader=next(n for n in rock.node_tree.nodes if n.type=='BSDF_PRINCIPLED');rock.node_tree.links.new(node.outputs['Color'],shader.inputs['Base Color'])
mountain.data.materials.clear()
mountain.data.materials.append(grasses[2]); mountain.data.materials.append(rock)
uv = mountain.data.uv_layers.new(name='Terrain projection')
for face in mountain.data.polygons:
    cliff = face.normal.z < .45 or face.center.x < 8
    face.material_index = 1 if cliff else 0
    face.use_smooth = True
    for loop in face.loop_indices:
        co = mountain.data.vertices[mountain.data.loops[loop].vertex_index].co
        uv.data[loop].uv = (co.y*.15, co.z*.15) if cliff else (co.x/4, co.y/4)
# Broad, partly buried outcrops follow the portal crest rather than a row of stones.
landscape_random = random.Random(82)
for i in range(19):
    y=landscape_random.uniform(-35,35)
    x=landscape_random.uniform(3,10)
    width=landscape_random.uniform(2,3.8)
    o=place('rock-'+str(i%3),(x,y,hill(x,y)-1.8),
        (landscape_random.uniform(2.2,3.8),width,landscape_random.uniform(3,4.5)),
        landscape_random.uniform(-.7,.7),'terrain')
    o.rotation_euler.y=landscape_random.uniform(-.25,.25)
    # Smaller fragments merge into each main outcrop, with no regular spacing.
    for j in range(2):
        px=x+landscape_random.uniform(1,3);py=y+landscape_random.uniform(-2,2)
        place('rock-'+str((i+j+1)%3),(px,py,hill(px,py)-.7),
            (landscape_random.uniform(.8,1.8),landscape_random.uniform(.8,1.8),landscape_random.uniform(1,2)),
            landscape_random.uniform(0,math.tau),'terrain')
# Interlocking rock faces hide the flat cut while keeping the bores clear.
for i in range(32):
    y=landscape_random.uniform(-75,75)
    z=landscape_random.uniform(2,max(3,hill(3,y)-4))
    if min(abs(y-12),abs(y+12))<9: continue
    place('rock-'+str(i%3),(3.5,y,z),
        (landscape_random.uniform(1.8,2.8),landscape_random.uniform(2,3.5),landscape_random.uniform(2,3.5)),
        landscape_random.uniform(-.65,.65),'terrain')

# Overlapping woodland groups leave a small exposed rock apron at the crest.
tree_positions=[]
for i in range(650):
    x=landscape_random.uniform(9,100) if i<440 else landscape_random.uniform(100,205)
    y=landscape_random.uniform(-91,91)
    if x<15 and abs(y)<29: continue
    # Winding clearings and a sparse outer edge avoid an even plantation grid.
    if abs(y-24*math.sin(x*.035))<5 and x>65: continue
    if abs(y)>77 and landscape_random.random()<.55: continue
    if any((x-px)**2+(y-py)**2<4.6**2 for px,py in tree_positions): continue
    tree_positions.append((x,y))
    scale=landscape_random.uniform(.8,1.3)
    near=x<47 and abs(y)<72 and i%3==0
    place('tree-near' if near else 'tree-far',(x,y,hill(x,y)-.15),
        (scale*landscape_random.uniform(.95,1.18),scale,scale*landscape_random.uniform(.9,1.2)),
        landscape_random.uniform(0,math.tau),'terrain')
# Keep approach planting outside the retaining walls and carriageways.
for i in range(65):
    x=landscape_random.uniform(-155,9);y=landscape_random.choice([-1,1])*landscape_random.uniform(32,90)
    place('tree-far',(x,y,hill(x,y) if x>=0 else -.05),landscape_random.uniform(.7,1.15),
        landscape_random.uniform(0,math.tau),'terrain')
# Reuse the textured leaf mesh, burying its trunk to form low, irregular shrubs.
for i in range(115):
    x=landscape_random.uniform(5,36);y=landscape_random.uniform(-81,81)
    if x<14 and min(abs(y-12),abs(y+12))<9: continue
    scale=landscape_random.uniform(.16,.32)
    place('tree-near',(x,y,hill(x,y)-scale*3.5),(scale*1.4,scale*1.2,scale),
        landscape_random.uniform(0,math.tau),'terrain')

for y in [-12,12]:
    facade=box('Open concrete portal',(-.5,y,5.4),(2,17,10.8),concrete,bevel=.06)
    subtract(facade,arch_cutter(y,-3,2))
    # White arch collar with 64 segments and continuous vertical springers.
    verts=[]; faces=[]
    for x in [-1.65,-1.32]:
        for radius in [5.54,5.85]:
            verts += [(x,y+radius*math.cos(i*math.pi/64),2.5+radius*math.sin(i*math.pi/64)) for i in range(65)]
    for i in range(64):
        for a,b in [(0,65),(130,195),(0,130),(65,195)]:faces.append((a+i,a+i+1,b+i+1,b+i))
    mesh('Limestone arch surround',verts,faces,trim,'structures')
    for side in [-1,1]:box('Portal springer',(-1.49,y+side*5.7,1.28),(.35,.32,2.56),trim)
    box('Portal cornice',(-.65,y,10.8),(2.5,17.6,.4),concrete,bevel=.07)
    box('Portal coping',(-.65,y,11.05),(2.7,17.9,.12),trim)
    text('Portal name','青 山 隧 道',(-1.53,y,9.45),.82,white)
    for side in [-1,1]:
        # Supplied curved single-arm poles, lamp arms point towards the carriageway.
        for x in range(-168,0,24):
            place('streetlight',(x,y+side*6.25,.05),rotation=0 if side>0 else math.pi)
        # W-section barrier with galvanised posts, bolt heads and reflectors.
        rail_y=y+side*5.05
        profile=[(-.11,.68),(-.02,.74),(-.08,.83),(-.02,.92),(-.11,.98)]
        v=[(x,rail_y+side*dy,z) for x in [-174,-3] for dy,z in profile]
        rail=mesh('Corrugated W beam',v,[(i,i+1,i+6,i+5) for i in range(4)],steel,'structures')
        solid=rail.modifiers.new('Steel thickness','SOLIDIFY');solid.thickness=.009
        for x in range(-174,-2,3):
            box('Galvanised I post',(x,rail_y,.52),(.095,.08,.95),steel)
            for z in [.74,.92]:
                rod('Guardrail bolt',(x,rail_y-.13,z),(x,rail_y+.13,z),.028,steel,vertices=6)
            if x%12==0:box('Road delineator',(x,rail_y-side*.13,.99),(.08,.035,.15),white)
    # Traffic gantry and physical LED message board.
    for side in [-1,1]:rod('Gantry post',(-112,y+side*5.55,0),(-112,y+side*5.55,7.6),.09,steel)
    rod('Gantry crossbeam',(-112,y-5.6,7.5),(-112,y+5.6,7.5),.1,steel)
    box('Variable message board',(-112.12,y,7.05),(.35,8.6,1.05),dark)
    message=text('LED safety message','道路千万条  安全第一条',(-112.32 if y<0 else -111.92,y,7.06),.48,red)
    if y>0:message.rotation_euler.z+=math.pi
# Supplied textured substation, grounded on the central median.
box('Substation concrete apron',(-50,0,.05),(17,9,.18),trim)
# The runtime loads substation-new.glb independently at (-50, 0, .14).
# Station signage belongs to the independent replacement asset.
# Keep the open crossover and reflector bands in future full site builds as well.
import runpy
runpy.run_path(str(ROOT/'scripts/build-portal-access.py'))['apply_portal_access'](collections['structures'])
# Project in metres: the default cube UV would stretch a single image over the entire forecourt.
for collection in collections.values():
    for obj in collection.objects:
        if obj.type != 'MESH' or obj.get('supplied_asset') or obj == mountain: continue
        if ground_material not in obj.data.materials[:]: continue
        uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name='Metre projection')
        scale = 4
        for face in obj.data.polygons:
            axis = max(range(3),key=lambda a:abs(face.normal[a]))
            axes = [a for a in range(3) if a != axis]
            for loop in face.loop_indices:
                co = obj.matrix_world @ obj.data.vertices[obj.data.loops[loop].vertex_index].co
                uv.data[loop].uv = (co[axes[0]]/scale,co[axes[1]]/scale)

# Merge meshes per material and group to keep GLB draw calls bounded.
for group,c in collections.items():
    for o in list(c.objects):
        if o.type=='MESH':
            bpy.context.view_layer.objects.active=o
            for m in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=m.name)
    for material in list(bpy.data.materials):
        objects=[o for o in c.objects if o.type=='MESH' and not o.get('supplied_asset') and len(o.data.materials)==1 and o.data.materials[0]==material]
        if not objects: continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]; bpy.ops.object.join(); objects[0].name=group+' / '+material.name

for material in bpy.data.materials:
    if material.name == 'lights' and material.use_nodes:
        node=next((n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
        if node:
            node.inputs['Emission Color'].default_value=(1,.9,.7,1)
            node.inputs['Emission Strength'].default_value=1

(ROOT/'src/assets/modelAssets/portal').mkdir(parents=True,exist_ok=True)
(ROOT/'blendFile/scenes').mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blendFile/scenes/portal-site.blend'))
for group,c in collections.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(asset_path(f'portal-{group}')),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_gpu_instances=True)
import runpy
runpy.run_path(str(ROOT/'scripts/optimize-portal-terrain.py'))['export_optimized_terrain']()
print('Portal site exported')
