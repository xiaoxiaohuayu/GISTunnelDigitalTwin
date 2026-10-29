import sys
from pathlib import Path as _AssetPath
sys.path.insert(0, str(_AssetPath(__file__).resolve().parent))
from asset_paths import asset_path
"""Author detailed, metre-scale local demonstration equipment. X road, Z up, front -Y."""
import bpy, math
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parents[1]/'src/assets/modelAssets/equipment'
def mat(n,c,metal=0,glow=0):
 m=bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True
 p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.38;p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=glow
 return m
def reset():
 global steel,black,white,red,yellow,blue
 bpy.ops.wm.read_factory_settings(use_empty=True)
 steel=mat('Galvanized steel',(.43,.49,.56),.75);black=mat('Graphite polymer',(.018,.025,.035));white=mat('Powder coated casing',(.73,.78,.82),.15);red=mat('Fire safety red',(.63,.025,.025));yellow=mat('Safety yellow',(.95,.65,.04));blue=mat('Pump blue',(.025,.17,.46),.4)
def box(n,p,s,m,b=.015):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=n;o.dimensions=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if b:
  mod=o.modifiers.new('Rounded manufacturing edges','BEVEL');mod.width=b;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
def rod(n,a,b,r,m,vertices=16):
 a,b=Vector(a),Vector(b);bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=(b-a).length,location=(a+b)/2);o=bpy.context.object;o.name=n;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();o.data.materials.append(m)
 for f in o.data.polygons:f.use_smooth=True
 return o
def screws(w,h,y=-.18):
 for x in [-w/2+.035,w/2-.035]:
  for z in [-h/2+.035,h/2-.035]:rod('Captive screw',(x,y,z),(x,y-.012,z),.009,steel,8)
def vents(w,h,y=-.17):
 for i in range(7):box('Ventilation louvre',(0,y,-h*.3+i*h*.065),(w*.7,.025,.012),black,.003)
def cabinet(n,w=.65,h=1.2):
 box(n,(0,0,0),(w,.3,h),white,.035);box('Gasketed access door',(0,-.166,0),(w-.06,.035,h-.07),steel)
 vents(w,h,-.19);screws(w,h,-.19);box('Door handle',(w*.32,-.21,.08),(.025,.04,.16),black)
 for z in [-h*.3,h*.3]:box('Door hinge',(-w*.48,-.17,z),(.045,.05,.12),steel)
 rod('Conduit',(0,.03,-h/2),(0,.03,-h/2-.25),.025,black)
def finish(name):
 if name in ['water-tank-original','vehicle-detector'] and asset_path(name).exists():return
 # Retain named moving parts; merge static meshes by material to reduce draws.
 for m in list(bpy.data.materials):
  objs=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in ['Curtain'] and o.data.materials and o.data.materials[0]==m]
  if not objs:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in objs:o.select_set(True)
  bpy.context.view_layer.objects.active=objs[0]
  if len(objs)>1:bpy.ops.object.join()
 bpy.ops.export_scene.gltf(filepath=str(asset_path(name)),export_format='GLB',export_yup=True,export_apply=True)
 print('BUILT',name,flush=True)
for name in ['plc','distribution']:
 reset();cabinet(name,.72 if name=='plc' else .9,1.25 if name=='plc' else 1.5)
 box('Operator interface',(0,-.20,.3),(.32,.045,.22),black)
 for x in [-.1,0,.1]:rod('Switch',(x,-.23,.1),(x,-.27,.1),.025,red if x==.1 else yellow)
 finish(name)
reset();box('Lane signal casing',(0,0,5.85),(.26,.94,.98),steel,.045)
for x in [-.15,.15]:box('Recessed LED panel',(x,0,5.85),(.025,.83,.87),black)
rod('Suspension',(0,0,6.34),(0,0,7.45),.035,steel);box('Anchor',(0,0,7.45),(.24,.24,.09),steel)
finish('lane-head')
reset();box('Weatherproof VMS housing',(0,0,5.85),(.32,6.8,1.05),steel,.05)
box('Recessed screen',(-.18,0,5.85),(.03,6.64,.9),black)
for y in [-2.7,2.7]:rod('Suspension',(0,y,6.37),(0,y,7.12),.035,steel)
finish('vms-body')
reset();rod('Signal mast',(0,0,0),(0,0,5.8),.085,steel)
box('Traffic signal head',(0,-.13,4.65),(.5,.28,1.6),black,.08)
for z in [4.15,4.65,5.15]:
 rod('Lens rim',(0,-.28,z),(0,-.34,z),.18,steel)
 rod('Unlit lens',(0,-.34,z),(0,-.35,z),.155,black)
 box('Lens visor',(0,-.42,z+.18),(.43,.36,.045),black)
finish('traffic-signal')
reset();rod('Detector mounting',(0,0,.15),(0,0,.65),.025,steel);box('Radar weather hood',(0,0,0),(.62,.34,.28),white,.045)
for x in [-.16,.16]:box('Radar radome',(x,-.19,0),(.22,.055,.19),black,.04)
screws(.6,.25,-.20);finish('vehicle-detector')
reset();rod('Bracket',(0,.3,0),(0,0,0),.035,steel)
# Horn has a real flared opening and a recessed driver.
bpy.ops.mesh.primitive_cone_add(vertices=24,radius1=.23,radius2=.075,depth=.36,location=(0,-.16,0),rotation=(math.pi/2,0,0));bpy.context.object.data.materials.append(white)
rod('Horn throat',(0,-.345,0),(0,-.355,0),.17,black);rod('Acoustic driver',(0,-.36,0),(0,-.38,0),.07,steel);finish('speaker')
reset();box('Pump plinth',(0,0,.12),(2.2,1.15,.24),white)
rod('Electric motor',(-.8,0,.58),(.05,0,.58),.25,blue)
for x in [-.7,-.55,-.4,-.25]:rod('Cooling fin',(x,0,.58),(x+.025,0,.58),.285,steel)
rod('Pump volute',(.08,0,.58),(.48,0,.58),.36,red)
for a,b in [((.35,0,.85),(.35,0,1.5)),((.48,0,.58),(1.2,0,.58))]:rod('Fire main',a,b,.11,red)
for x in [.55,1.05]:rod('Bolted flange',(x,0,.58),(x+.06,0,.58),.19,steel)
rod('Pressure gauge stem',(.65,0,.65),(.65,0,1.1),.02,steel);rod('Gauge bezel',(.65,-.04,1.1),(.65,-.1,1.1),.1,white)
rod('Valve spindle',(.9,0,.65),(.9,0,1),.025,steel);rod('Valve handwheel',(.9,0,1),(.9,0,1.025),.16,red)
finish('fire-pump')
reset();box('Water tank',(0,0,1.65),(3,2.6,3),steel,.05)
for x in [-1.5,-.75,0,.75,1.5]:box('Panel seam',(x,-1.31,1.65),(.025,.025,2.9),black,.003)
for z in [.2,.95,1.7,2.45,3.15]:box('Panel seam',(0,-1.32,z),(2.95,.025,.025),black,.003)
rod('Outlet',(1.4,0,.45),(2,0,.45),.12,red)
for z in [.35+i*.3 for i in range(10)]:rod('Ladder rung',(1.55,-.5,z),(1.55,.1,z),.025,steel)
for y in [-.5,.1]:rod('Ladder rail',(1.55,y,.15),(1.55,y,3.6),.03,steel)
rod('Manhole',(0,0,3.15),(0,0,3.22),.36,black);finish('water-tank-original')
for name in ['flame','manual','covi','no2','wind','fbg','humidity']:
 reset()
 if name=='manual':
  box('Manual alarm enclosure',(0,0,0),(.2,.12,.25),red,.025);box('Break glass',(0,-.07,.025),(.14,.025,.1),white);box('Press point',(0,-.09,.025),(.06,.015,.05),black);screws(.2,.25,-.075)
 elif name=='flame':
  rod('Articulated bracket',(0,.2,0),(0,0,0),.035,steel);rod('Explosion proof head',(0,.06,0),(0,-.16,0),.095,white);rod('Infrared optical window',(0,-.17,0),(0,-.185,0),.067,black)
 elif name=='wind':
  rod('Support',(0,.1,-.25),(0,.1,.18),.025,steel)
  for x in [-.15,.15]:
   for y in [-.12,.12]:rod('Ultrasonic arm',(0,.1,0),(x,y,.15),.012,steel);rod('Transducer',(x,y,.15),(x,y,.22),.025,black)
 elif name=='humidity':
  rod('Sensor spine',(0,0,-.25),(0,0,.25),.04,steel)
  for z in [-.2+i*.055 for i in range(9)]:rod('Radiation shield',(0,0,z),(0,0,z+.025),.12,white)
  rod('Mount',(0,0,-.25),(0,.3,-.25),.025,steel)
 else:
  cabinet(name,.34,.44)
  if name=='covi':
   rod('Optical sampling tube',(-.33,-.23,.08),(.33,-.23,.08),.075,steel);rod('Optical window',(-.34,-.23,.08),(-.36,-.23,.08),.055,black)
  if name=='no2':rod('Gas inlet',(0,-.1,-.3),(0,-.1,-.48),.035,steel)
  if name=='fbg':
   for x in [-.11,0,.11]:rod('Fibre connector',(x,0,-.24),(x,0,-.32),.015,yellow)
 finish(name)
for name,w,h in [('pedestrian-shutter',4,2.85),('vehicle-shutter',7,4.8)]:
 reset()
 for x in [-w/2,w/2]:box('Door guide',(x,0,h/2),(.16,.26,h),steel)
 rise=1.2 if w==7 else .8
 # Follow the masonry arch; the roll housing sits above its crown.
 for i in range(40):
  a=math.pi*i/40;b=math.pi*(i+1)/40
  rod('Arched door frame',(w/2*math.cos(a),0,h+rise*math.sin(a)),(w/2*math.cos(b),0,h+rise*math.sin(b)),.085,steel)
 box('Roller hood',(0,.32,h+rise+.2),(w+.3,.4,.3),white)
 # The moving curtain follows the same arch and retracts above the crown.
 radius=w/2-.075
 profile=[(-radius,.05),(radius,.05),(radius,h)]
 profile += [(radius*math.cos(i*math.pi/40),h+rise*math.sin(i*math.pi/40)) for i in range(1,41)]
 n=len(profile);vertices=[(x,y,z) for y in [-.04,.04] for x,z in profile]
 faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 data=bpy.data.meshes.new('Arched shutter');data.from_pydata(vertices,[],faces);data.update()
 o=bpy.data.objects.new('Curtain',data);bpy.context.scene.collection.objects.link(o);data.materials.append(steel)
 bpy.context.scene.cursor.location=(0,0,h+rise+.06);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');o.select_set(False)
 for z in [.2+i*.18 for i in range(int((h+rise-.2)/.18))]:
  width=w-.17 if z<=h else 2*radius*math.sqrt(max(0,1-((z-h)/rise)**2))
  p=box('Slat',(0,-.05,z),(width,.035,.028),black,.003);bpy.ops.object.select_all(action='DESELECT');p.select_set(True);o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.join();o.name='Curtain'
 finish(name)
# Preserve the supplied fan duct/grille and add a separately animated rotor.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(asset_path('jet-fan')))
steel=mat('Fan rotor aluminium',(.48,.54,.59),.8)
blades=[]
for angle in [i*math.tau/6 for i in range(6)]:
 o=box('Blade',(-1.35,.22*math.cos(angle),.43+.22*math.sin(angle)),(.04,.36,.09),steel,.015);o.rotation_euler.x=angle;blades.append(o)
bpy.ops.object.select_all(action='DESELECT')
for o in blades:o.select_set(True)
bpy.context.view_layer.objects.active=blades[0];bpy.ops.object.join();o=bpy.context.object;o.name='Rotor';bpy.context.scene.cursor.location=(-1.35,0,.43);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
bpy.ops.export_scene.gltf(filepath=str(asset_path('jet-fan-active')),export_format='GLB',export_yup=True)
# Reuse the user's detailed streetlight at the east portal as well.
bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(str(Path(__file__).resolve().parents[1]/'blendFile/prepared/streetlight.blend'),link=False) as (src,dst):dst.objects=src.objects
for obj in dst.objects:
 if obj:bpy.context.scene.collection.objects.link(obj)
for m in bpy.data.materials:
 if m.name=='lights' and m.use_nodes:
  p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Emission Color'].default_value=(1,.9,.7,1);p.inputs['Emission Strength'].default_value=1
bpy.ops.export_scene.gltf(filepath=str(asset_path('streetlight')),export_format='GLB',export_yup=True)
