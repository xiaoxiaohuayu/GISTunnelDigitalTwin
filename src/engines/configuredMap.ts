// @env browser
import {
  Axis,Cartesian2,Cartesian3,ClippingPolygon,ClippingPolygonCollection,Color,ColorMaterialProperty,
  DirectionalLight,HeadingPitchRange,ImageryLayer,Ion,IonWorldImageryStyle,Math as CesiumMath,
  Matrix3,Matrix4,Model,Quaternion,Transforms,Viewer,
  createWorldImageryAsync,createWorldTerrainAsync,
} from 'cesium'
import type { Entity } from 'cesium'
import type { MapOptions } from './cesiumMap'
import type { TunnelMapHandle,TunnelSurvey } from '../types/tunnel'
import type { TunnelProject } from './projectConfig'
import { assetStation,boreLength,laneLateral,sceneAsset,assetMountOffset } from './projectConfig'
import { modelAssetUrl } from './modelAssets'
import { changeSystems,deviceEnabled,deviceAlarm,initialSystems,incidentStation,trafficSpeedFactor,trafficStopStations } from './tunnelSystemsState'
import type { DeviceKind,SceneDevice,SystemsState } from './tunnelSystemsState'
import { addDeviceInteraction } from './deviceInteraction'
import { equipmentShader,setEquipmentLighting } from './tunnelSystems'
import { addTunnelEvents } from './tunnelEvents'
import { addIncidentEffects } from './incidentEffects'
import { addDetectionCoverage } from './detectionCoverage'
import { ledPlane } from './ledScreen'
import { createVmsText } from './vmsDisplay'
import { deviceMessage,deviceVms } from './tunnelSystemsState'
import { readControlOverrides,saveControlOverrides } from './projectStorage'

const assetModels:Partial<Record<DeviceKind,string>>={camera:'camera',cabinet:'fire-cabinet',lane:'lane-head',signal:'traffic-signal',vms:'vms-body',detector:'vehicle-detector',plc:'plc',fan:'fan',speaker:'speaker',telephone:'emergency-telephone',escape:'escape-sign',pump:'fire-pump',tank:'water-tank',flame:'flame',manual:'manual',shutter:'pedestrian-shutter',covi:'covi',no2:'no2',wind:'wind',fbg:'fbg',humidity:'humidity',distribution:'distribution',substation:'substation-new',street:'streetlight',layby:'layby-sign'}

export async function createConfiguredMap(container:HTMLDivElement,project:TunnelProject,options:MapOptions):Promise<TunnelMapHandle>{
  const overrides=await readControlOverrides(project.id)
  const assetIds=new Set(project.assets.map(asset=>asset.id))
  const progress=(percent:number,stage:string,resource:string)=>options.onProgress?.({percent,stage,resource})
  progress(5,'配置场景','加载地形与影像')
  window.CESIUM_BASE_URL=new URL(`${import.meta.env.BASE_URL}cesium/`,document.baseURI).href
  const token=import.meta.env.VITE_CESIUM_ION_TOKEN
  if(!token)throw new Error('请配置 VITE_CESIUM_ION_TOKEN')
  Ion.defaultAccessToken=token
  const [imagery,terrain]=await Promise.all([createWorldImageryAsync({style:IonWorldImageryStyle.AERIAL}),createWorldTerrainAsync({requestVertexNormals:true})])
  const viewer=new Viewer(container,{baseLayer:new ImageryLayer(imagery),terrainProvider:terrain,baseLayerPicker:false,geocoder:false,homeButton:false,sceneModePicker:false,navigationHelpButton:false,animation:false,timeline:false,fullscreenButton:false,infoBox:false,selectionIndicator:false,requestRenderMode:true,maximumRenderTimeChange:Infinity})
  let state={...initialSystems,devices:Object.fromEntries(Object.entries(overrides).filter(([id])=>assetIds.has(id)))},disposed=false
  const origin=project.origin,base=Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(origin.longitude,origin.latitude,origin.elevation))
  const angle=CesiumMath.toRadians(90-origin.heading),rotation=Matrix3.fromRotationZ(angle)
  const frame=Matrix4.multiply(base,Matrix4.fromRotationTranslation(rotation),new Matrix4())
  const world=(x:number,y:number,z:number)=>Matrix4.multiplyByPoint(frame,new Cartesian3(x,y,z),new Cartesian3())
  const point=(tube:number,s:number,lateral=0,height=0)=>world(s,-(project.bores[tube]??project.bores[0])!.offset-lateral,s*origin.grade/100+height)
  const pose=(tube:number,s:number,lateral:number,height:number,heading=0)=>Matrix4.multiply(frame,Matrix4.fromRotationTranslation(Matrix3.multiply(Matrix3.fromRotationY(-Math.atan(origin.grade/100)),Matrix3.fromRotationZ(CesiumMath.toRadians(heading)),new Matrix3()),new Cartesian3(s,-project.bores[tube]!.offset-lateral,s*origin.grade/100+height)),new Matrix4())
  const gradedFrame=Matrix4.multiply(frame,Matrix4.fromRotationTranslation(Matrix3.fromRotationY(-Math.atan(origin.grade/100))),new Matrix4())
  const orientation=Quaternion.fromRotationMatrix(Matrix4.getMatrix3(gradedFrame,new Matrix3()))
  const length=Math.max(...project.bores.map(boreLength))
  const survey:TunnelSurvey={length,minCover:0,grade:origin.grade,center:point(0,length/2),tubes:[0,1].map(t=>[point(t,0),point(t,length)]),pointAt:point,boreNames:project.bores.map(b=>b.name)}
  viewer.scene.screenSpaceCameraController.enableCollisionDetection=false
  viewer.scene.globe.depthTestAgainstTerrain=true;viewer.scene.globe.translucency.frontFaceAlpha=.2;viewer.scene.globe.translucency.backFaceAlpha=.2
  viewer.scene.light=new DirectionalLight({direction:Cartesian3.normalize(Matrix4.multiplyByPointAsVector(frame,new Cartesian3(.4,.2,-1),new Cartesian3()),new Cartesian3()),intensity:2.4})
  viewer.resolutionScale=1;viewer.scene.postProcessStages.fxaa.enabled=true
  const walls:Entity[]=[],canopies:Entity[]=[],surfaces:Entity[]=[],lamps:{entity:Entity;device:SceneDevice}[]=[],portalLabels:Entity[]=[]
  const box=(id:string|undefined,position:Cartesian3,size:Cartesian3,color:string)=>viewer.entities.add({id,position,orientation,box:{dimensions:size,material:Color.fromCssColorString(color)}})
  const cuts:ClippingPolygon[]=[]
  progress(18,'参数化结构','生成洞筒、车道和洞门')
  for(const [tube,bore]of project.bores.entries()){
    const extent=boreLength(bore),half=bore.lanes.length*bore.laneWidth/2+1.2,rise=half*.8,wallHeight=2.7
    const shape:Cartesian2[]=[new Cartesian2(-half-.35,0),new Cartesian2(-half-.35,wallHeight)]
    for(let i=0;i<=32;i++){const a=Math.PI-i*Math.PI/32;shape.push(new Cartesian2((half+.35)*Math.cos(a),wallHeight+(rise+.35)*Math.sin(a)))}
    shape.push(new Cartesian2(half+.35,0),new Cartesian2(half,0),new Cartesian2(half,wallHeight))
    for(let i=0;i<=32;i++){const a=i*Math.PI/32;shape.push(new Cartesian2(half*Math.cos(a),wallHeight+rise*Math.sin(a)))}
    shape.push(new Cartesian2(-half,0))
    walls.push(viewer.entities.add({polylineVolume:{positions:[point(tube,0),point(tube,extent)],shape,material:Color.fromCssColorString('#858b86')}}))
    surfaces.push(box(undefined,point(tube,extent/2,0,.1),new Cartesian3(extent+480,half*2,.2),'#3e4549'))
    for(const side of [-1,1])surfaces.push(box(undefined,point(tube,extent/2,side*(half-.55),.32),new Cartesian3(extent+80,1,.24),'#a3a99f'))
    for(let lane=0;lane<=bore.lanes.length;lane++){
      const lateral=(lane-bore.lanes.length/2)*bore.laneWidth
      for(let s=-210;s<extent+220;s+=12)box(undefined,point(tube,s,lateral,.212),new Cartesian3(lane===0||lane===bore.lanes.length?11.9:4,.12,.025),'#f1efe3')
    }
    for(const [laneIndex,lane]of bore.lanes.entries())for(let s=40;s<extent;s+=100){
      const y=laneLateral(bore,laneIndex),d=lane.direction
      viewer.entities.add({polygon:{hierarchy:[[-2.5,-.25],[.5,-.25],[.5,-.8],[2.5,0],[.5,.8],[.5,.25],[-2.5,.25]].map(([x,l])=>point(tube,s+x!*d,y+l!,.23)),perPositionHeight:true,material:Color.fromCssColorString('#f1efe3')}})
    }
    for(const end of [0,extent]){
      for(const side of [-1,1])box(undefined,point(tube,end,side*(half+.65),wallHeight/2),new Cartesian3(1.2,1.3,wallHeight),'#989e95')
      box(undefined,point(tube,end,0,wallHeight+rise+1.0),new Cartesian3(1.5,half*2+2.6,1.2),'#a4aaa0')
      portalLabels.push(viewer.entities.add({position:point(tube,end,0,wallHeight+rise+1.2),label:{text:`${project.name} · ${bore.name}`,font:'16px sans-serif',fillColor:Color.WHITE,showBackground:true,backgroundColor:Color.fromCssColorString('#152d34').withAlpha(.85)}}))
      const roofShape=[new Cartesian2(-half,0),new Cartesian2(half,0),new Cartesian2(half,.08),new Cartesian2(-half,.08)]
      canopies.push(viewer.entities.add({polylineVolume:{positions:[point(tube,end===0?-20:extent,0,wallHeight+rise),point(tube,end===0?0:extent+20,0,wallHeight+rise)],shape:roofShape,material:Color.fromCssColorString('#adc8d6').withAlpha(.35)}}))
      const from=end===0?-260:-60,to=end===0?60:260
      cuts.push(new ClippingPolygon({positions:[[from,-half-8],[to,-half-8],[to,half+8],[from,half+8]].map(([s,l])=>point(tube,end+s!,l!))}))
    }
  }
  if(ClippingPolygonCollection.isSupported(viewer.scene))viewer.scene.globe.clippingPolygons=new ClippingPolygonCollection({polygons:cuts})
  const devices=project.assets.map(a=>{const d=sceneAsset(a,project);d.position=point(d.tube,d.station,d.lateral,d.height);return d})
  const models:{model:Model;device:SceneDevice;base:Matrix4}[]=[],vms:{device:SceneDevice;screen:ReturnType<typeof ledPlane>}[]=[]
  const requests:Promise<void>[]=[]
  progress(30,'设备台账','按桩号布设设备实体')
  try{
    for(const [index,device]of devices.entries()){
      const record=project.assets[index]!,matrix=pose(device.tube,device.station,device.lateral,device.height-assetMountOffset(device.kind),record.heading)
      const asset=assetModels[device.kind]
      if(record.endChainage!==undefined){const b=project.bores[device.tube]!,end=assetStation({...record,chainage:record.endChainage},b);box(device.id,point(device.tube,(end+device.station)/2,device.lateral,.225),new Cartesian3(Math.max(1,Math.abs(end-device.station)),device.kind==='layby'?3:1,.03),'#92a795')}
      if(asset){
        if(device.kind==='fan')Matrix4.multiply(matrix,Matrix4.fromRotationTranslation(Matrix3.fromRotationX(Math.PI),new Cartesian3(0,0,.94)),matrix)
        requests.push(Model.fromGltfAsync({url:modelAssetUrl(asset),modelMatrix:matrix,scale:device.kind==='fan'?2:1,upAxis:Axis.Y,forwardAxis:Axis.X,customShader:equipmentShader(),id:device.id}).then(model=>{viewer.scene.primitives.add(model);models.push({model,device,base:Matrix4.clone(matrix)});progress(30+models.length/Math.max(1,devices.filter(d=>assetModels[d.kind]).length)*40,'设备台账',`${record.code} 已加载`)}))
        if(device.kind==='vms')vms.push({device,screen:ledPlane(viewer,matrix,-.201,5.85,6.6,.88,createVmsText(state.message,state.vms).toDataURL(),false,device.id,true)})
      }else if(device.kind==='basic'||device.kind==='enhanced'){
        const entity=box(device.id,device.position!,new Cartesian3(1.1,.26,.13),'#fff2cc');lamps.push({entity,device})
      }else{
        const b=project.bores[device.tube]!,end=record.endChainage===undefined?device.station:assetStation({...record,chainage:record.endChainage},b)
        box(device.id,point(device.tube,(end+device.station)/2,device.lateral,.22),new Cartesian3(Math.max(2,Math.abs(end-device.station)),device.kind==='layby'?3:1.3,.18),'#a4b7ac')
      }
    }
    await Promise.all(requests)
  }catch(e){viewer.destroy();throw e}
  const interaction=addDeviceInteraction(viewer,survey,devices,models,d=>focusDevice(d.id))
  const events=addTunnelEvents(viewer,survey),effects=addIncidentEffects(viewer,survey),detection=addDetectionCoverage(viewer,survey,devices)
  let roamTube:0|1=0,roaming=false,distance=-200,speed=60,previous=performance.now()
  const reportRoaming=()=>options.onRoaming?.({playing:roaming,tube:roamTube,speed,distance,length:boreLength(project.bores[roamTube]!)})
  const look=(target:Cartesian3,range:number,heading=origin.heading+155,pitch=-22)=>{viewer.camera.lookAt(target,new HeadingPitchRange(CesiumMath.toRadians(heading),CesiumMath.toRadians(pitch),range));viewer.camera.lookAtTransform(Matrix4.IDENTITY);viewer.scene.requestRender()}
  const stop=()=>{roaming=false;reportRoaming()}
  function focusDevice(id:string):void{const d=devices.find(d=>d.id===id);if(!d)return;stop();interaction.select(d);const target=d.position!,camera=point(d.tube,d.station-8,Math.max(-2,Math.min(2,d.lateral*.3)),2),up=Matrix4.multiplyByPointAsVector(frame,Cartesian3.UNIT_Z,new Cartesian3());viewer.camera.setView({destination:camera,orientation:{direction:Cartesian3.normalize(Cartesian3.subtract(target,camera,new Cartesian3()),new Cartesian3()),up}});viewer.scene.requestRender();options.onDeviceSelect?.(d)}
  function moveRoaming():void{const d=project.bores[roamTube]!.lanes[0]!.direction;viewer.camera.setView({destination:point(roamTube,distance,laneLateral(project.bores[roamTube]!,0),1.8),orientation:{heading:CesiumMath.toRadians(origin.heading+(d===1?0:180)),pitch:Math.atan(origin.grade/100)*d,roll:0}});viewer.scene.requestRender()}
  const cars:{model:Model;tube:number;lane:number;station:number;direction:1|-1}[]=[]
  try{
    const jobs=project.bores.flatMap((b,tube)=>b.lanes.flatMap((lane,laneIndex)=>Array.from({length:2},(_,i)=>({tube,lane:laneIndex,direction:lane.direction,station:(i+.2)*boreLength(b)/2}))))
    await Promise.all(jobs.map(async car=>{const model=await Model.fromGltfAsync({url:modelAssetUrl('car-blue'),modelMatrix:pose(car.tube,car.station,laneLateral(project.bores[car.tube]!,car.lane),.25,car.direction===1?0:180),upAxis:Axis.Y,forwardAxis:Axis.X});viewer.scene.primitives.add(model);cars.push({...car,model})}))
  }catch(e){interaction.dispose();effects.dispose();viewer.destroy();throw e}
  const fanAngles=new Map<Model,number>()
  const tick=viewer.scene.preUpdate.addEventListener(()=>{
    const now=performance.now(),dt=Math.min(.1,(now-previous)/1000);previous=now
    for(const car of cars){const b=project.bores[car.tube]!,extent=boreLength(b),next=car.station+car.direction*dt*16*trafficSpeedFactor(car.tube,state),stops=trafficStopStations(car.tube,car.lane,extent,state);car.station=stops.some(s=>car.direction*(car.station-s)<=0&&car.direction*(next-s)>=0)?car.station:next;if(car.station>extent+220)car.station=-220;if(car.station< -220)car.station=extent+220;car.model.modelMatrix=pose(car.tube,car.station,laneLateral(b,car.lane),.25,car.direction===1?0:180);car.model.show=Cartesian3.distance(viewer.camera.positionWC,point(car.tube,car.station))<700}
    for(const entry of models)if(entry.device.kind==='fan'&&entry.model.ready&&deviceEnabled(entry.device,state)&&deviceAlarm(entry.device.id,state)!=='fan'){const rotor=entry.model.getNode('fan_01_obj_00'),angle=(fanAngles.get(entry.model)??0)+dt*12;fanAngles.set(entry.model,angle);if(rotor)rotor.matrix=Matrix4.multiply(rotor.originalMatrix,Matrix4.fromRotationTranslation(Matrix3.fromRotationX(angle)),new Matrix4())}
    if(roaming){distance+=dt*speed/3.6*project.bores[roamTube]!.lanes[0]!.direction;const extent=boreLength(project.bores[roamTube]!);if(distance>extent+220)distance=-220;if(distance< -220)distance=extent+220;moveRoaming();reportRoaming()}
    viewer.scene.requestRender()
  })
  function update(patch:Partial<SystemsState>):SystemsState{
    state=changeSystems(state,patch);if(state.incidentTube>=project.bores.length)state={...state,incidentTube:0}
    if(patch.devices)void saveControlOverrides(project.id,state.devices).catch(error=>options.onWarning?.(error instanceof Error?error.message:String(error)))
    for(const entry of models){const enabled=deviceEnabled(entry.device,state);setEquipmentLighting(entry.model,state.environment==='day'?1:.6);const shader=entry.model.customShader;if(shader){shader.setUniform('u_power',Number(enabled));shader.setUniform('u_alarm',Number(deviceAlarm(entry.device.id,state)!=='none'))}if(entry.device.kind==='shutter')entry.model.modelMatrix=Matrix4.multiplyByTranslation(entry.base,new Cartesian3(0,0,enabled?4.5:0),new Matrix4())}
    for(const {entity,device}of lamps)if(entity.box)entity.box.material=new ColorMaterialProperty(Color.fromCssColorString(deviceEnabled(device,state)?'#fff2b6':'#343b40'))
    for(const entry of vms){const display=deviceVms(entry.device,state);entry.screen.material.uniforms.image=createVmsText(deviceMessage(entry.device,state),display).toDataURL();entry.screen.resize(display.width,display.height)}
    survey.length=boreLength(project.bores[state.incidentTube]!);events.update(state);effects.update(state);interaction.update(state)
    viewer.scene.light.intensity=state.environment==='day'?2.4:.4;viewer.scene.fog.density=state.environment==='fog'?.0012:.0002;viewer.scene.requestRender();return {...state}
  }
  const observer=new ResizeObserver(()=>{viewer.resize();viewer.scene.requestRender()});observer.observe(container)
  const focusPortal=(end:0|1=0)=>{stop();const b=project.bores[0]!;look(point(0,end?boreLength(b):0,0,3),110,origin.heading+(end?185:5),-20)}
  const resetView=()=>{stop();look(point(0,length/2),Math.max(300,length*1.3),origin.heading+40,-40)}
  options.onProject?.(project,true);options.onDevices?.(devices);options.onIntro?.('complete');reportRoaming();update({});options.onSystems?.(state);focusPortal()
  function dispose():void{if(disposed)return;disposed=true;tick();observer.disconnect();interaction.dispose();effects.dispose();if(!viewer.isDestroyed())viewer.destroy()}
  try{await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>{remove();reject(new Error('配置场景首帧准备超时，请重试'))},30000);const remove=viewer.scene.postRender.addEventListener(()=>{if(models.every(entry=>entry.model.ready)&&cars.every(car=>car.model.ready)&&viewer.dataSourceDisplay.ready){clearTimeout(timeout);remove();resolve()}});viewer.scene.requestRender()})}catch(error){dispose();throw error}
  progress(100,'配置场景就绪','台账、车道与结构已应用')
  return {resetView,focusPortal,focusDevice,clearDeviceSelection:()=>interaction.select(),setSystems:update,
    focusInterior(cross=false){stop();const b=project.bores[0]!;viewer.camera.setView({destination:point(0,boreLength(b)*(cross?.5:.2),0,1.8),orientation:{heading:CesiumMath.toRadians(origin.heading),pitch:Math.atan(origin.grade/100),roll:0}})},
    focusLayBy(){const d=devices.find(d=>d.kind==='layby');if(d)focusDevice(d.id);else resetView()},
    focusSubstation(){const d=devices.find(d=>d.kind==='substation');if(d)focusDevice(d.id);else resetView()},
    focusIncident(){stop();look(point(state.incidentTube,incidentStation(boreLength(project.bores[state.incidentTube]!),state),0,1.5),30,origin.heading+130,-15)},
    focusCamera(id){const d=devices.find(d=>d.id===id);if(d&&deviceEnabled(d,state)&&deviceAlarm(id,state)!=='camera'){stop();viewer.camera.setView({destination:d.position!,orientation:{heading:CesiumMath.toRadians(origin.heading+(d.heading??0)),pitch:-.15,roll:0}})}},
    setWallsVisible(visible){walls.forEach(w=>w.show=visible);viewer.scene.requestRender()},setCanopyVisible(visible){canopies.forEach(w=>w.show=visible);viewer.scene.requestRender()},
    setUnderground(enabled){viewer.scene.globe.translucency.enabled=enabled;viewer.scene.requestRender()},setDetectionVisible:visible=>detection.setVisible(visible),
    setRoaming(enabled){roaming=enabled;reportRoaming()},setRoamingOptions(patch){if(patch.tube!==undefined&&project.bores[patch.tube]){roamTube=patch.tube;distance=project.bores[roamTube]!.lanes[0]!.direction===1?-200:boreLength(project.bores[roamTube]!)+200}if(patch.speed!==undefined)speed=patch.speed;moveRoaming();reportRoaming()},seekRoaming(progress){distance=-220+Math.max(0,Math.min(1,progress))*(boreLength(project.bores[roamTube]!)+440);moveRoaming();reportRoaming()},
    playIntro:resetView,skipIntro:focusPortal,
    async updatePortalSign(){throw new Error('请通过隧道配置修改名称')},async updateTrafficSigns(){throw new Error('配置场景的交通标志请通过设备台账管理')},
    dispose,
  }
}
