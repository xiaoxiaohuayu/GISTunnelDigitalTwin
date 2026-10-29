// @env browser
import type { addPortalSite } from './portalSite'
import { ledPlane } from './ledScreen'
import { createVmsText, vmsOffset, vmsSize } from './vmsDisplay'
import { modelAssetUrl } from './modelAssets'
import {
  Axis, Cartesian3, Color, CustomShader, DistanceDisplayCondition,
  Matrix3, Matrix4,
  Model, Transforms, UniformType, Cartesian2, CornerType, Quaternion,
} from 'cesium'
import type { Viewer } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import { tunnelPoint } from './tunnelDetails'
import { layBy, layByWidth } from './tunnelLayout'
import { deviceTelemetry } from './deviceTelemetry'
import { crossPassages, escapeSignDirection, radarHeading, illuminationAt, initialSystems, deviceAlarm, deviceEnabled, deviceVms, deviceMessage, deviceLane, deviceEntrance } from './tunnelSystemsState'
import type { DeviceKind, SceneDevice, SystemsState } from './tunnelSystemsState'

export function equipmentShader(): CustomShader {
  return new CustomShader({ uniforms: { u_power: {type:UniformType.FLOAT,value:1}, u_alarm:{type:UniformType.FLOAT,value:0}, u_pulse:{type:UniformType.FLOAT,value:0} },
    fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
      material.emissive *= u_power;
      material.diffuse = mix(material.diffuse,vec3(1.0,0.12,0.04),u_alarm*0.6);
      material.emissive += vec3(1.0,0.08,0.02)*u_alarm*(0.3+u_pulse*0.5);
    }` })
}
// Scale the incident light energy, including specular/IBL, rather than only the base colour.
export function setEquipmentLighting(model: Model, level: number): void {
  model.lightColor=new Cartesian3(level*2.4,level*2.4,level*2.4)
  model.imageBasedLighting.imageBasedLightingFactor=new Cartesian2(level,level)
}
const screenCache=new Map<string,string>()
function screenImage(content: string): string {
  const cached=screenCache.get(content);if(cached)return cached
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512
  const ctx=canvas.getContext('2d')!
  ctx.fillStyle='#05090e';ctx.fillRect(0,0,512,512)
  ctx.fillStyle=content==='cross'?'#ff260d':'#20ff19'
  ctx.scale(4,4)
  const polygon=(points:number[][])=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x!,y!):ctx.moveTo(x!,y!));ctx.closePath();ctx.fill()}
  if(content==='cross')polygon([[28,14],[64,50],[100,14],[114,28],[78,64],[114,100],[100,114],[64,78],[28,114],[14,100],[50,64],[14,28]])
  else if(content==='left')polygon([[13,64],[57,20],[57,46],[111,46],[111,82],[57,82],[57,108]])
  else polygon([[46,15],[82,15],[82,65],[109,65],[64,111],[19,65],[46,65]])
  const image=canvas.toDataURL();screenCache.set(content,image);return image
}

export async function addTunnelSystems(viewer: Viewer, survey: TunnelSurvey, progress?: (completed:number,total:number,resource:string)=>void, sites:Awaited<ReturnType<typeof addPortalSite>>[] = []) {
  const devices: SceneDevice[] = []
  const fibres: import('cesium').Entity[]=[]
  const models: { model: Model; device: SceneDevice; shader: CustomShader; shutter: boolean }[] = []
  const screens: { surface: ReturnType<typeof ledPlane>; device: SceneDevice; type: 'lane' | 'vms'; housing?: import('cesium').Entity; key?: string; started?:number }[] = []
  const trafficLenses: { entity: import('cesium').Entity; color: string; tube: number }[] = []
  const requests: Promise<void>[] = []
  let completed=0
  let state = { ...initialSystems }
  function placement(kind: DeviceKind, asset: string | null, tube: number, station: number, lateral: number, height: number, angle = 0, listed = true): SceneDevice {
    const device = { id: `${kind}-${devices.filter(d=>d.kind===kind).length+1}`,kind,tube,station,lateral,height }
    if(listed)devices.push(device)
    if (!asset) return device
    const point=tunnelPoint(survey,tube,station,lateral,height)
    const rotation=Matrix3.multiply(Matrix3.fromRotationY(-Math.atan(survey.grade/100)),Matrix3.fromRotationZ(angle),new Matrix3())
    const matrix=Matrix4.multiply(Transforms.eastNorthUpToFixedFrame(point),Matrix4.fromRotationTranslation(rotation),new Matrix4())
    // Flip around the fan shaft at 0.47 m so the mounting feet face the ceiling.
    if(kind==='fan')Matrix4.multiply(matrix,Matrix4.fromRotationTranslation(Matrix3.fromRotationX(Math.PI),new Cartesian3(0,0,.94)),matrix)
    const shader=equipmentShader()
    requests.push(Model.fromGltfAsync({ url:modelAssetUrl(kind==='fan'?'fan':asset),
      modelMatrix:matrix,scale:kind==='fan'?2:1,upAxis:Axis.Y,forwardAxis:Axis.X,customShader:shader,
      distanceDisplayCondition:new DistanceDisplayCondition(0,300) }).then(model=>{
      progress?.(++completed,requests.length,`${asset}.glb`)
      setEquipmentLighting(model,illuminationAt(station,survey.length,state,tube))
      model.id=device.id; viewer.scene.primitives.add(model); models.push({model,device,shader,shutter:kind==='shutter'})
    }))
    if (kind==='lane') {
      screens.push({ surface:ledPlane(viewer,matrix,-.17,5.85,.80,.84,screenImage('down'),false,device.id),device,type:'lane' })
      ledPlane(viewer,matrix,.17,5.85,.80,.84,screenImage('cross'),true,device.id)
    }
    if (kind==='vms') screens.push({surface:ledPlane(viewer,matrix,-.201,5.85,6.6,.88,createVmsText(state.message,state.vms).toDataURL(),false,device.id,true),device,type:'vms'})
    return device
  }
  for (let tube=0;tube<2;tube++) {
    const outer=tube===0?-1:1, angle=tube===0?0:Math.PI, wallAngle=tube===0?Math.PI:0
    const wall=(s:number)=>outer*(5.26+layByWidth(s,survey.length,tube))
    for (let s=25;s<survey.length;s+=80) for (const lane of [-2.15,2.15]) placement('lane','lane-head',tube,s,lane,0,angle)
    for (let s=65;s<survey.length;s+=240) placement('vms','vms-body',tube,s,0,0,angle)
    for (let s=60;s<survey.length;s+=200) {
      placement('manual','manual',tube,s+1,wall(s+1),1.45,wallAngle)
      placement('flame','flame',tube,s+6,outer*4.65,4.25,wallAngle)
      placement('speaker','speaker',tube,s+12,wall(s+12),3.15,wallAngle)
      placement('telephone','emergency-telephone',tube,s+8,wall(s+8),1.45,wallAngle)
      placement('distribution','distribution',tube,s+22,wall(s+22),1.2,wallAngle)
      placement('escape',`escape-sign-${escapeSignDirection(s+40,tube,survey.length)}`,tube,s+40,wall(s+40),2,wallAngle)
      // Existing detailed fire cabinet and camera are retained alongside the new systems.
      placement('cabinet','fire-cabinet',tube,s,outer*(5.05+layByWidth(s,survey.length,tube)),.45,wallAngle)
      placement('camera','camera',tube,s+15,outer*4.5,4.5,wallAngle)
    }
    for (const s of [0,survey.length/2,survey.length]) {
      placement('detector','vehicle-detector',tube,s,0,7.2,radarHeading(tube))
      placement('plc','plc',tube,s+30,wall(s+30),1.15,wallAngle)
      for (const [i,kind] of (['covi','no2','wind','humidity','fbg'] as const).entries()) {
        placement(kind,kind,tube,s+4+i*3,wall(s+4+i*3),kind==='wind'?3.2:kind==='fbg'?3.5:2.0,wallAngle)
      }
    }
    for (let s=150;s<survey.length;s+=300) for (const y of [-1.6,1.6]) placement('fan','fan',tube,s,y,6.25,angle)
    for (let s=-50;s<survey.length+60;s+=8) for (const y of [-4.55,4.55]) placement('basic',null,tube,s,y,4.65)
    for (const start of [-58,survey.length+12]) for (let s=start;s<=start+46;s+=4) for (const y of [-3.85,3.85]) placement('enhanced',null,tube,s,y,5.49)
    const bay=layBy(survey.length,tube)
    placement('layby','layby-sign',tube,tube===0?bay.start-4:bay.end+4,outer*4.95,-1.05,angle)
    placement('layby','layby-marking',tube,bay.center,outer*6.1,.23,angle,false)
    // Thermal fibre runs continuously, with fixing clips and junction boxes at each sampling section.
    fibres.push(viewer.entities.add({polylineVolume:{positions:[-50,survey.length+50].map(s=>tunnelPoint(survey,tube,s,outer*4.2,5.2)),
      shape:[new Cartesian2(-.012,-.012),new Cartesian2(.012,-.012),new Cartesian2(.012,.012),new Cartesian2(-.012,.012)],cornerType:CornerType.MITERED,material:Color.fromCssColorString('#bb782c')}}))
    const entrance=tube===0?-75:survey.length+75
    const signal=placement('signal',null,tube,entrance,0,6.65)
    const signalFrame=Transforms.eastNorthUpToFixedFrame(tunnelPoint(survey,tube,entrance,0,0))
    const signalPoint=(x:number,y:number,z:number)=>Matrix4.multiplyByPoint(signalFrame,new Cartesian3(x,y,z),new Cartesian3())
    const orientation=Quaternion.fromRotationMatrix(Matrix4.getMatrix3(signalFrame,new Matrix3()))
    viewer.entities.add({id:signal.id,position:signalPoint(0,0,6.65),orientation,box:{dimensions:new Cartesian3(.35,2.15,.7),material:Color.fromCssColorString('#24303a')}})
    for(const y of [-.8,.8])viewer.entities.add({id:`device-part:${signal.id}:${y}`,position:signalPoint(0,y,7.45),orientation,box:{dimensions:new Cartesian3(.08,.08,1),material:Color.SILVER}})
    for (const [i,color] of ['red','yellow','green'].entries()) {
      const entity=viewer.entities.add({id:`device-lens:${signal.id}:${i}`,position:signalPoint(tube===0?-.21:.21,(1-i)*.66*(tube===0?1:-1),6.65),orientation,
        ellipsoid:{radii:new Cartesian3(.055,.235,.235),material:Color.fromCssColorString(color)}})
      trafficLenses.push({entity,color,tube})
    }
    for (const [i,p] of crossPassages(survey.length).entries()) {
      if(tube===0)placement(p.vehicle?'vehicle':'pedestrian',null,tube,p.station,4.8,p.height/2)
      placement('shutter',p.vehicle?'vehicle-shutter':'pedestrian-shutter',tube,p.station,tube===0?5.2:-5.2,0)
      viewer.entities.add({position:tunnelPoint(survey,tube,p.station,tube===0?4.76:-4.76,p.height+.48),label:{text:`${p.vehicle?'车行':'人行'}横洞 ${i+1}`,font:'14px sans-serif',fillColor:Color.LIGHTGREEN,distanceDisplayCondition:new DistanceDisplayCondition(0,70)}})
    }
  }
  const portalModels:{model:Model;device:SceneDevice}[]=[]
  for(const [end,site] of sites.entries()) {
    devices.push(...site.devices)
    const substation:SceneDevice={id:`substation-${end+1}`,kind:'substation',tube:0,station:end===0?-110:survey.length+110,lateral:12,height:2.4,portalEnd:end as 0|1,position:Matrix4.multiplyByPoint(site.frame,new Cartesian3(-50,0,2.4),new Cartesian3())}
    devices.push(substation);portalModels.push({model:site.substation,device:substation})
    for(const y of [-12,12]) {
      const tube=(y<0?0:1)^end
      const frame=Matrix4.multiplyByTranslation(site.frame,new Cartesian3(-112.12,y,7.05),new Matrix4())
      const device:SceneDevice={id:`vms-${devices.filter(d=>d.kind==='vms').length+1}`,kind:'vms',tube,station:end===0?-172.12:survey.length+172.12,lateral:0,height:7.05,portalEnd:end as 0|1,position:Matrix4.getTranslation(frame,new Cartesian3())}
      devices.push(device)
      const housing=viewer.entities.add({id:device.id,position:device.position,orientation:Quaternion.fromRotationMatrix(Matrix4.getMatrix3(frame,new Matrix3())),box:{dimensions:new Cartesian3(.35,6.8,1.05),material:Color.fromCssColorString('#252c32')}})
      const face=Matrix4.multiply(frame,Matrix4.fromRotationTranslation(Matrix3.fromRotationZ(y<0?0:Math.PI)),new Matrix4())
      screens.push({surface:ledPlane(viewer,face,-.19,0,6.6,.88,createVmsText(state.message,state.vms).toDataURL(),false,device.id,true),device,type:'vms',housing})
    }
  }
  placement('pump','fire-pump',0,-159,12,.2)
  placement('tank','water-tank',0,-155,12,.2)
  await Promise.all(requests)
  const shutterScales=new Map<Model,number>(),fanRotations=new Map<Model,number>()
  const initializedSites=new Set<Model>()
  let alarmedModels:typeof models=[]
  let previous=performance.now()
  const stopTick=viewer.scene.preUpdate.addEventListener(()=>{
    const now=performance.now(),delta=Math.min((now-previous)/1000,.1);previous=now
    for(const screen of screens)if(screen.type==='vms') {
      const display=deviceVms(screen.device,state)
      if(!display.enabled||display.scroll==='none')continue
      const size=screen.surface.material.uniforms.contentSize as Cartesian2
      const offset=vmsOffset(display,size.x,size.y,(now-(screen.started??now))/1000)
      screen.surface.material.uniforms.offset=new Cartesian2(offset.x,offset.y)
      viewer.scene.requestRender()
    }
    for(const site of sites)if(site.structures.ready&&!initializedSites.has(site.structures)) {
      for(const name of ['structures / Anthracite board','structures / LED red']) {const node=site.structures.getNode(name);if(node)node.show=false}
      initializedSites.add(site.structures);viewer.scene.requestRender()
    }
    for(const entry of models)if(entry.shutter&&entry.model.ready) {
      const target=deviceEnabled(entry.device,state)?.02:1
      let scale=shutterScales.get(entry.model)??.021
      if(Math.abs(scale-target)>.0001||!shutterScales.has(entry.model)) {
        scale+=Math.sign(target-scale)*Math.min(Math.abs(target-scale),delta*.5)
        const node=entry.model.getNode('Curtain')
        if(node)node.matrix=Matrix4.multiplyByScale(node.originalMatrix,new Cartesian3(1,scale,1),new Matrix4())
        shutterScales.set(entry.model,scale);viewer.scene.requestRender()
      }
    }
    if(alarmedModels.length) {
      const pulse=window.matchMedia('(prefers-reduced-motion: reduce)').matches?0.5:(Math.sin(now/270)+1)/2
      for(const entry of alarmedModels)entry.shader.setUniform('u_pulse',pulse)
      viewer.scene.requestRender()
    }
    for(const entry of models)if(entry.device.kind==='fan'&&entry.model.ready&&deviceEnabled(entry.device,state)&&deviceAlarm(entry.device.id,state)!=='fan') {
      const rotation=(fanRotations.get(entry.model)??0)+delta*12
      fanRotations.set(entry.model,rotation)
      const rotor=entry.model.getNode('fan_01_obj_00')
      if(rotor)rotor.matrix=Matrix4.multiply(rotor.originalMatrix,Matrix4.fromRotationTranslation(Matrix3.fromRotationX(rotation)),new Matrix4())
      viewer.scene.requestRender()
    }
  })
  function update(next: SystemsState): void {
    state=next
    alarmedModels=models.filter(entry=>deviceTelemetry(entry.device,state,survey.length).severity!=='normal')
    for (const {model,device,shader} of models) {
      shader.setUniform('u_power',Number(deviceEnabled(device,state)))
      shader.setUniform('u_alarm',Number(deviceTelemetry(device,state,survey.length).severity!=='normal'))
      setEquipmentLighting(model,illuminationAt(device.station,survey.length,state,device.tube))
      const display=deviceVms(device,state)
      if(device.kind==='vms' && model.ready)for(const name of ['Weatherproof VMS housing','Recessed screen']) {
        const node=model.getNode(name)
        if(node)node.matrix=Matrix4.multiplyByScale(node.originalMatrix,new Cartesian3(1,display.height/.88,display.width/6.6),new Matrix4())
      }

    }
    for(const screen of screens)if(screen.type==='lane')screen.surface.material.uniforms.image=screenImage(deviceLane(screen.device,survey.length,state))
    const textures=new Map<string,{image:string;width:number;height:number}>()
    for(const screen of screens)if(screen.type==='vms') {
      const display=deviceVms(screen.device,state),message=deviceMessage(screen.device,state)
      const key=JSON.stringify([display,message])
      if(screen.key===key)continue
      screen.key=key;screen.started=performance.now()
      let texture=textures.get(key)
      if(!texture){const canvas=createVmsText(message,display);texture={image:canvas.toDataURL(),width:canvas.width,height:canvas.height};textures.set(key,texture)}
      screen.surface.material.uniforms.image=texture.image
      screen.surface.material.uniforms.contentSize=new Cartesian2(texture.width,texture.height)
      const offset=vmsOffset(display,texture.width,texture.height,0)
      screen.surface.material.uniforms.offset=new Cartesian2(offset.x,offset.y)
      screen.surface.material.uniforms.dots=Number(display.dots)
      const size=vmsSize(display)
      screen.surface.material.uniforms.screenSize=new Cartesian2(size.width,size.height)
      screen.surface.resize(display.width,display.height)
      if(screen.housing?.box)screen.housing.box.dimensions=new ConstantProperty(new Cartesian3(.35,display.width+.2,display.height+.17))
    }
    const fibreLevel=illuminationAt(survey.length/2,survey.length,state)
    for(const fibre of fibres)if(fibre.polylineVolume)fibre.polylineVolume.material=new ColorMaterialProperty(new Color(.73*fibreLevel,.47*fibreLevel,.17*fibreLevel,1))
    for (const lens of trafficLenses) {
      const active=deviceEntrance(devices.find(d=>d.id===`signal-${lens.tube+1}`)!,state)
      if (lens.entity.ellipsoid) lens.entity.ellipsoid.material=new ColorMaterialProperty(Color.fromCssColorString(active===lens.color?lens.color:'#16202a'))
    }
    viewer.scene.requestRender()
  }
  update(state)
  return {devices,models:[...models,...portalModels],update,dispose:stopTick}
}
import { ColorMaterialProperty, ConstantProperty } from 'cesium'
