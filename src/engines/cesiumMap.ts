import { editPortalPosition } from './portalPosition'
import { positionGizmo } from './positionGizmo'
import { moveAsset,facilityProject } from './assetPlacement'
import type { AssetRecord } from './projectConfig'
// @env browser
import { modelAssetUrl } from './modelAssets'
import {
  createWorldImageryAsync, createWorldTerrainAsync, ImageryLayer, BoundingSphere,
  Cartesian3, DirectionalLight, HeadingPitchRange, Ion, IonWorldImageryStyle, Math as CesiumMath, Matrix4, Transforms, Viewer,
  Model, Axis, Matrix3, Credit, Cartographic, EasingFunction,
} from 'cesium'
import { addTunnelEvents } from './tunnelEvents'
import { addIncidentEffects } from './incidentEffects'
import { addDetectionCoverage } from './detectionCoverage'
import { addPortalTrafficSigns } from './portalTrafficSigns'
import { addPortalBoards } from './portalBoards'
import { addSceneOverlays } from './sceneOverlays'
import { createLoadReporter } from './scenePresentation'
import type { LoadProgress, OverlayPosition, PortalSignConfig, SceneOverlay, TrafficSignsConfig } from '../types/scene'
import { addDeviceInteraction, deviceHeight } from './deviceInteraction'
import type { RoamingState, TunnelMapHandle } from '../types/tunnel'
import { surveyTunnel } from './tunnelSurvey'
import { projectLayBy,layoutPassages } from './facilityLayout'
import { addTunnelTraffic } from './tunnelTraffic'
import { addTunnelModel } from './tunnelModel'
import { PORTAL_EXTENSION, tunnelPoint } from './tunnelDetails'
import { addTunnelSystems, setEquipmentLighting } from './tunnelSystems'
import { initialSystems, deviceAlarm, deviceEnabled, changeSystems, illuminationAt, incidentStation, incidentDefinition } from './tunnelSystemsState'
import type { SceneDevice, SystemsState } from './tunnelSystemsState'
import { readTunnelProject } from './projectStorage'
import { defaultProject,seedAssets } from './projectConfig'
import type { TunnelProject } from './projectConfig'
import { projectSurvey,surveyFrame } from './projectSurvey'
import { upgradeProject,resolveAsset } from './assetPlacement'
import { sceneResources } from './sceneResources'
import { assetMountOffset as importMount,assetStation,formatChainage,projectErrors } from './projectConfig'
import { demoProject,readControlOverrides,saveControlOverrides,saveTunnelProject } from './projectStorage'

export type IntroPhase = 'earth' | 'region' | 'overview' | 'portal' | 'complete'
export interface MapOptions {
  onPositionEdit?:(asset:AssetRecord|undefined)=>void
  onWarning?: (message:string) => void
  onSystems?: (state:SystemsState) => void
  onProject?: (project:TunnelProject,configured:boolean) => void
  onProgress?: (progress:LoadProgress) => void
  onOverlayPositions?: (positions:OverlayPosition[]) => void
  onOverlays?: (items:SceneOverlay[]) => void
  onTrafficSignEdit?: (index:number) => void
  onTrafficSignsConfig?: (config:TrafficSignsConfig,warning:string) => void
  onSignEdit?: () => void
  onSignConfig?: (config:PortalSignConfig,warning:string) => void
  onRoaming?: (state:RoamingState) => void
  onDeviceSelect?: (device: SceneDevice) => void
  onDevices?: (devices: SceneDevice[]) => void
  onIntro?: (phase: IntroPhase) => void
  shouldSkipIntro?: () => boolean
}
export async function createCesiumMap(container: HTMLDivElement, options: MapOptions = {}): Promise<TunnelMapHandle> {
  const configured=await readTunnelProject()
  let project=configured
  let originalProject:TunnelProject|undefined=await demoProject()
  const report=createLoadReporter(progress=>options.onProgress?.(progress))
  report(2,'渲染引擎','Cesium 初始化')
  window.CESIUM_BASE_URL = new URL(`${import.meta.env.BASE_URL}cesium/`,document.baseURI).href
  const token=import.meta.env.VITE_CESIUM_ION_TOKEN
  if (!token) throw new Error('请在 .env.local 中配置 VITE_CESIUM_ION_TOKEN')
  Ion.defaultAccessToken=token
  report(5,'地图资源','卫星影像与地形服务')
  const [provider,terrainProvider]=await Promise.all([
    createWorldImageryAsync({style:IonWorldImageryStyle.AERIAL}),createWorldTerrainAsync({requestVertexNormals:true}),
  ])
  const viewer=new Viewer(container,{
    baseLayer:new ImageryLayer(provider),terrainProvider,baseLayerPicker:false,geocoder:false,homeButton:false,
    sceneModePicker:false,navigationHelpButton:false,animation:false,timeline:false,fullscreenButton:false,
    infoBox:false,selectionIndicator:false,shouldAnimate:true,requestRenderMode:true,maximumRenderTimeChange:Infinity,
  })
  viewer.creditDisplay.addStaticCredit(new Credit(`<a href="${import.meta.env.BASE_URL}model-credits.html" target="_blank" rel="noopener">模型署名</a>`,true))
  viewer.camera.setView({destination:Cartesian3.fromDegrees(103.56,30.91,22000000)})
  options.onIntro?.('earth')
  let state={...initialSystems,devices:configured?await readControlOverrides(configured.id):{}}
  let resources=sceneResources(viewer)
  let survey: Awaited<ReturnType<typeof surveyTunnel>>
  let model: Awaited<ReturnType<typeof addTunnelModel>>
  let systems: Awaited<ReturnType<typeof addTunnelSystems>>
  let traffic: Awaited<ReturnType<typeof addTunnelTraffic>> | undefined
  let trafficSigns:Awaited<ReturnType<typeof addPortalTrafficSigns>>
  let signResources:ReturnType<typeof sceneResources>
  let boards: Awaited<ReturnType<typeof addPortalBoards>>
  try {
    report(12,'地形测绘','隧道高程与埋深校核')
    survey=configured?projectSurvey(configured):await surveyTunnel(terrainProvider)
    report(25,'洞口与隧道','衬砌、道路、洞口影像与地形')
    let siteCompleted=0
    model=await addTunnelModel(viewer,survey,resource=>report(25+Math.min(25,++siteCompleted*2.5),'洞口与隧道',resource))
    report(52,'入口标牌','读取本地配置与生成牌面')
    signResources=sceneResources(viewer)
    boards=await addPortalBoards(viewer,survey)
    options.onSignConfig?.(boards.config,boards.storageWarning)
    trafficSigns=await addPortalTrafficSigns(viewer,survey)
    options.onTrafficSignsConfig?.(trafficSigns.config,trafficSigns.warning)
    signResources.capture()
    report(55,'设备模型','加载交通、通风、消防和检测设备')
    systems=await addTunnelSystems(viewer,survey,(done,total,resource)=>report(55+done/total*25,'设备模型',resource),model.sites)
    traffic=await addTunnelTraffic(viewer,survey,()=>state,(done,total,resource)=>report(80+done/total*10,'车辆模型',resource))
    options.onDevices?.(systems.devices)
    if(!project){
    const seeded=defaultProject(),start=Cartesian3.midpoint(survey.tubes[0]![0]!,survey.tubes[1]![0]!,new Cartesian3()),geo=Cartographic.fromCartesian(start)
    seeded.name=boards.config.name
    seeded.origin={longitude:CesiumMath.toDegrees(geo.longitude),latitude:CesiumMath.toDegrees(geo.latitude),elevation:geo.height,heading:90,grade:survey.grade}
    seeded.bores.forEach((b,i)=>{b.end=survey.length;b.laneWidth=4.3;b.offset=i===0?12:-12})
    seeded.assets=seedAssets(systems.devices,seeded).map(a=>({...a,lateral:-a.lateral}))
    const projectInverse=Matrix4.inverse(Transforms.eastNorthUpToFixedFrame(start),new Matrix4())
    for(const asset of seeded.assets){const device=systems.devices.find(d=>d.id===asset.id);if(device?.position){const local=Matrix4.multiplyByPoint(projectInverse,device.position,new Cartesian3());asset.lateral=-local.y-seeded.bores[device.tube]!.offset}}
    project=upgradeProject(seeded);originalProject=structuredClone(project);await demoProject(originalProject)
    }
    options.onProject?.(project!,!!configured)
    bindLights()
    model.setLighting(state);systems.update(state)
    resources.capture()
  } catch(error) {viewer.destroy();throw error}
  let interaction=addDeviceInteraction(viewer,survey,systems.devices,systems.models,device=>focusDevice(device.id),()=>{stopCamera();interaction.select();options.onSignEdit?.()},index=>{stopCamera();interaction.select();options.onTrafficSignEdit?.(index)})
  let events=addTunnelEvents(viewer,survey)
  let detection=addDetectionCoverage(viewer,survey,systems.devices);detection.bind(systems.instances)
  const sunlight=Matrix4.multiplyByPointAsVector(Transforms.eastNorthUpToFixedFrame(survey.center),new Cartesian3(.4,.25,-1),new Cartesian3())
  viewer.scene.light=new DirectionalLight({direction:Cartesian3.normalize(sunlight,sunlight),intensity:2.4})
  viewer.scene.highDynamicRange=true
  viewer.scene.globe.translucency.frontFaceAlpha=.22
  viewer.scene.globe.translucency.backFaceAlpha=.22
  viewer.scene.globe.depthTestAgainstTerrain=true
  viewer.scene.screenSpaceCameraController.enableCollisionDetection=false
  viewer.scene.globe.maximumScreenSpaceError=1.5
  viewer.resolutionScale=1
  viewer.scene.postProcessStages.fxaa.enabled=true
  let effects=addIncidentEffects(viewer,survey)
  report(91,'演练资源','事故车辆与效果资源')
  let incidentCars:Model[]
  try {
    incidentCars=await Promise.all(['car-audi','car-blue','car-white','car-orange','car-blue'].map(asset=>Model.fromGltfAsync({url:modelAssetUrl(asset),upAxis:Axis.Y,forwardAxis:Axis.X,show:false})))
    for(const car of incidentCars)viewer.scene.primitives.add(car)
  } catch(error){traffic?.dispose();systems.dispose();viewer.destroy();throw error}
  let roaming=false,roamDistance=-220,roamTube:0|1=0,roamSpeed=60,previousFrame=0,introGeneration=0,disposed=false,lastReport=0
  function reportRoaming():void {options.onRoaming?.({playing:roaming,tube:roamTube,speed:roamSpeed,distance:roamDistance,length:survey.length})}
  function moveRoaming():void {
    viewer.camera.setView({destination:tunnelPoint(survey,roamTube,roamDistance,roamTube===0?-2.15:2.15,1.8),
      orientation:{heading:roamTube===0?Math.PI/2:Math.PI*1.5,pitch:(roamTube===0?1:-1)*Math.atan(survey.grade/100),roll:0}})
    viewer.scene.requestRender()
  }
  const stopRoamingTick=viewer.scene.preUpdate.addEventListener(()=>{
    if(!roaming)return
    const now=performance.now(),delta=Math.min((now-previousFrame)/1000,.1);previousFrame=now
    roamDistance+=delta*(roamSpeed/3.6)*(roamTube===0?1:-1)
    if(roamDistance>survey.length+220)roamDistance=-220
    if(roamDistance<-220)roamDistance=survey.length+220
    moveRoaming()
    if(now-lastReport>250){lastReport=now;reportRoaming()}
  })
  let vehiclePrevious=performance.now(),vehicleTravel=0
  const stopVehicleTick=viewer.scene.preUpdate.addEventListener(()=>{
    const now=performance.now(),delta=Math.min((now-vehiclePrevious)/1000,.1);vehiclePrevious=now
    if(state.incident!=='vehicle'){vehicleTravel=0;return}
    vehicleTravel=(vehicleTravel+delta*8)%90
    for(const [index,car] of incidentCars.entries()){
      const station=incidentStation(survey.length,state)+(state.incidentTube===0?1:-1)*(vehicleTravel-index*10)
      const frame=Transforms.eastNorthUpToFixedFrame(tunnelPoint(survey,state.incidentTube,station,index%2?2.15:-2.15,.25))
      car.modelMatrix=Matrix4.multiply(frame,Matrix4.fromRotationTranslation(Matrix3.multiply(Matrix3.fromRotationY(-Math.atan(survey.grade/100)),Matrix3.fromRotationZ(state.incidentTube===0?0:Math.PI),new Matrix3())),new Matrix4())
    }
    viewer.scene.requestRender()
  })
  reportRoaming()
  function cancelIntro():void {introGeneration++;viewer.camera.cancelFlight();options.onIntro?.('complete')}
  function stopCamera():void {cancelIntro();roaming=false;reportRoaming()}
  function look(point:Cartesian3,heading:number,pitch:number,range:number):void {
    viewer.camera.lookAt(point,new HeadingPitchRange(CesiumMath.toRadians(heading),CesiumMath.toRadians(pitch),range))
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);viewer.scene.requestRender()
  }
  function focusPortal(end:0|1=0):void {stopCamera();look(tunnelPoint(survey,0,end===0?-PORTAL_EXTENSION:survey.length+PORTAL_EXTENSION,12,4),76+end*180,-17,122)}
  function resetView():void {stopCamera();look(survey.center,20,-35,survey.length*1.5)}
  function playIntro():void {
    stopCamera()
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches || options.shouldSkipIntro?.()) {focusPortal();return}
    const generation=++introGeneration
    viewer.camera.setView({destination:Cartesian3.fromDegrees(103.56,30.91,22000000)})
    options.onIntro?.('earth')
    const stages: {phase:IntroPhase;point:Cartesian3;range:number;heading:number;pitch:number;duration:number}[]=[
      {phase:'region',point:survey.center,range:50000,heading:15,pitch:-70,duration:3.2},
      {phase:'overview',point:survey.center,range:survey.length*1.5,heading:20,pitch:-35,duration:2.8},
      {phase:'portal',point:tunnelPoint(survey,0,-60,12,4),range:122,heading:76,pitch:-17,duration:3},
    ]
    function next(index:number):void {
      if(disposed || generation!==introGeneration)return
      const stage=stages[index]
      if(!stage){options.onIntro?.('complete');return}
      options.onIntro?.(stage.phase)
      viewer.camera.flyToBoundingSphere(new BoundingSphere(stage.point,1),{duration:stage.duration,
        offset:new HeadingPitchRange(CesiumMath.toRadians(stage.heading),CesiumMath.toRadians(stage.pitch),stage.range),complete:()=>next(index+1),cancel:()=>{if(generation===introGeneration)options.onIntro?.('complete')}})
    }
    next(0)
  }
  const observer=new ResizeObserver(()=>{viewer.resize();viewer.scene.requestRender()});observer.observe(container)
  function focusDevice(id:string):void {
      if(editing){options.onWarning?.("请先保存或取消当前的位置调整");return}
      const d=systems.devices.find(d=>d.id===id);if(!d)return
      interaction.select(d)
      options.onDeviceSelect?.(d)
      stopCamera()
      const overhead=['lane','vms','basic','enhanced','fan','detector'].includes(d.kind)
      const h=deviceHeight(d)
      const target=d.position??tunnelPoint(survey,d.tube,d.station,d.lateral,h)
      const yard=d.kind==='tank'||d.kind==='pump'
      const position=d.position?Matrix4.multiplyByPoint(Transforms.eastNorthUpToFixedFrame(target),new Cartesian3(d.tube===0?-12:12,0,-.65),new Cartesian3()):tunnelPoint(survey,d.tube,d.station-(d.tube===0?1:-1)*(overhead?12:4),yard?8:0,yard?h+2.5:Math.max(1.6,h-.65))
      const up=Matrix4.multiplyByPointAsVector(Transforms.eastNorthUpToFixedFrame(target),Cartesian3.UNIT_Z,new Cartesian3())
      const duration=window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:.9
      if(d.kind==='street'||d.kind==='substation') {
        viewer.camera.flyToBoundingSphere(new BoundingSphere(d.position??tunnelPoint(survey,d.tube,d.station,d.lateral,3),1),{
          duration,offset:new HeadingPitchRange(CesiumMath.toRadians(65),CesiumMath.toRadians(-15),d.kind==='substation'?28:20),
        })
      } else {
        viewer.camera.flyTo({destination:position,
          orientation:{direction:Cartesian3.normalize(Cartesian3.subtract(target,position,new Cartesian3()),new Cartesian3()),up},
          duration,easingFunction:EasingFunction.CUBIC_IN_OUT,
          // Keep a tunnel-to-tunnel flight at the endpoint heights instead of rising above the mountain.
          maximumHeight:Math.max(viewer.camera.positionCartographic.height,Cartographic.fromCartesian(position).height),
          pitchAdjustHeight:Number.POSITIVE_INFINITY,
        })
      }
      viewer.scene.requestRender()
    }
  let wallsVisible=true,canopyVisible=true,positionSaving=false
  let stopOverlays=addSceneOverlays(viewer,survey,systems.devices,traffic?.cars??[],()=>state,()=>interaction.selected,items=>options.onOverlays?.(items),positions=>options.onOverlayPositions?.(positions),()=>wallsVisible)
  report(95,'首帧准备','模型渲染与材质编译')
  focusPortal()
  try {
    await new Promise<void>((resolve,reject)=>{
      const timer=window.setTimeout(()=>{remove();removeError();reject(new Error('首帧模型准备超时，请重试'))},45000)
      const cleanup=()=>{window.clearTimeout(timer);remove();removeError()}
      const removeError=viewer.scene.renderError.addEventListener((_scene:unknown,error:Error)=>{cleanup();reject(error)})
      const remove=viewer.scene.postRender.addEventListener(()=>{
        const nearby=systems.models.filter(entry=>Cartesian3.distance(viewer.camera.positionWC,Matrix4.getTranslation(entry.model.modelMatrix,new Cartesian3()))<300)
        if(model.isReady()&&nearby.every(entry=>entry.model.ready)&&(traffic?.cars??[]).every(car=>!car.model.show||car.model.ready)){cleanup();resolve()}
      })
      viewer.scene.requestRender()
    })
  } catch(error){stopOverlays();effects.dispose();interaction.dispose();stopVehicleTick();traffic?.dispose();systems.dispose();stopRoamingTick();observer.disconnect();viewer.destroy();throw error}
  report(100,'场景就绪','模型与资源初始化完成')
  playIntro()
  let editing:{original:AssetRecord;draft:AssetRecord;gizmo:ReturnType<typeof positionGizmo>}|undefined
  function cancelPositionEdit():void{if(!editing||positionSaving)return;previewPosition({chainage:editing.original.chainage,lateral:editing.original.lateral,height:editing.original.height,heading:editing.original.heading});moveRecord(editing.original);editing.gizmo.dispose();editing=undefined;options.onPositionEdit?.(undefined)}
  function previewPosition(patch:Partial<AssetRecord>):void{if(!editing||positionSaving)return;editing.draft=moveAsset(editing.draft,patch,project!);
    if(['pedestrian','vehicle','layby'].includes(editing.draft.kind)){
      const preview=facilityProject(project!,{...editing.draft}),indices=preview.bores.flatMap((b,i)=>b.id===editing!.draft.boreId||b.id===editing!.draft.link?.targetBoreId?[i]:[])
      model.updateInterior(projectSurvey(preview),indices);bindLights();model.setLighting(state);model.setWallsVisible(wallsVisible);model.setCanopyVisible(canopyVisible);model.setUnderground(viewer.scene.globe.translucency.enabled)
      for(const id of editing.draft.link?.memberIds??[]){const a=preview.assets.find(a=>a.id===id);if(a)moveRecord(a)}
    }
    moveRecord(editing.draft);const b=project!.bores.find(b=>b.id===editing!.draft.boreId)!;editing.gizmo.setOffset(new Cartesian3((editing.draft.chainage-editing.original.chainage)*Math.sign(b.end-b.start),editing.draft.lateral-editing.original.lateral,editing.draft.height-editing.original.height));options.onPositionEdit?.({...editing.draft})}
  function startPositionEdit(id:string):void{
    if(editing)return
    const a=project!.assets.find(a=>a.id===id),d=systems.devices.find(d=>d.id===id);if(!a||!d)return
    stopCamera();const original=structuredClone(resolveAsset(a,project!)),point=d.position??tunnelPoint(survey,d.tube,d.station,d.lateral,d.height+importMount(d.kind)),b=project!.bores[d.tube]!
    const gizmo=positionGizmo(viewer,surveyFrame(survey,point),['pedestrian','vehicle','layby'].includes(a.kind),offset=>previewPosition({chainage:original.chainage+offset.x*Math.sign(b.end-b.start),lateral:original.lateral+offset.y,height:original.height+offset.z}),cancelPositionEdit)
    editing={original,draft:structuredClone(original),gizmo};options.onPositionEdit?.({...original})
  }
  async function savePositionEdit():Promise<void>{
    if(!editing||positionSaving)return
    const session=editing,draft=structuredClone(session.draft)
    const next=['pedestrian','vehicle','layby'].includes(draft.kind)?facilityProject(project!,draft):structuredClone(project!)
    if(!['pedestrian','vehicle','layby'].includes(draft.kind))next.assets=next.assets.map(a=>a.id===draft.id?draft:a)
    positionSaving=true;session.gizmo.setEnabled(false)
    try{await applyProject(next);session.gizmo.dispose();editing=undefined;options.onPositionEdit?.(undefined)}
    catch(error){positionSaving=false;previewPosition(draft);throw error}
    finally{positionSaving=false;if(editing===session)session.gizmo.setEnabled(true)}
  }
  const referenceHeadings=new Map(project!.assets.map(a=>[a.id,a.heading]))
  function bindLights():void{for(const [id,p] of model.lightPrimitives){const instance=systems.instances.get(id),base=model.lightFrames.get(id);if(!instance||!base){p.show=false;continue}p.show=true;const correction=Matrix4.multiply(instance.referenceFrame,Matrix4.inverse(base,new Matrix4()),new Matrix4());instance.addTransform(delta=>{p.modelMatrix=Matrix4.multiply(delta,correction,new Matrix4())},'light');p.modelMatrix=Matrix4.multiply(instance.currentTransform,correction,new Matrix4())}}
  function moveRecord(record:import('./projectConfig').AssetRecord,refresh=true):void{
    const a=resolveAsset(record,project!),b=project!.bores.find(b=>b.id===a.boreId)!,tube=project!.bores.indexOf(b),station=assetStation(a,b)
    const d=systems.devices.find(d=>d.id===a.id);if(!d)return
    const point=(survey.actualPointAt??((t,s,y,h)=>tunnelPoint(survey,t,s,y,h)))(tube,station,-a.lateral,a.height)
    const frame=Matrix4.multiply(surveyFrame(survey,point),Matrix4.fromRotationTranslation(Matrix3.fromRotationZ(CesiumMath.toRadians(a.heading-(referenceHeadings.get(a.id)??0)))),new Matrix4())
    systems.instances.get(a.id)?.move(frame)
    Object.assign(d,{tube,station,lateral:-a.lateral,height:a.height,position:point,name:a.name,code:a.code,boreName:b.name,chainage:formatChainage(a.chainage)})
    if(refresh){interaction.refresh();options.onDevices?.([...systems.devices])}
  }
  async function applyProject(value:TunnelProject|null,recovering=false):Promise<void>{
    if(!value&&!originalProject)throw new Error('当前会话没有原场景快照，请导入之前导出的默认配置')
    const next=upgradeProject(value??originalProject!)
    // A ledger station edit has the same linked movement as the scene editor.
    for(const a of next.assets){const old=project!.assets.find(d=>d.id===a.id);if(!a.link||!old?.link||old.chainage===a.chainage||a.link.targetChainage!==old.link.targetChainage)continue;const linked=facilityProject(project!,{...a});a.link=linked.assets.find(d=>d.id===a.id)!.link;for(const id of a.link!.memberIds){const member=next.assets.find(d=>d.id===id),prior=project!.assets.find(d=>d.id===id),moved=linked.assets.find(d=>d.id===id);if(member&&prior&&moved&&member.chainage===prior.chainage)member.chainage=moved.chainage}}
    const errors=projectErrors(next)
    if(errors.length)throw new Error(errors.join('\n'))
    const previous=project!,sameStructure=JSON.stringify([previous.origin,previous.bores])===JSON.stringify([next.origin,next.bores])&&JSON.stringify(previous.assets.map(a=>[a.id,a.kind]))===JSON.stringify(next.assets.map(a=>[a.id,a.kind]))
    stopCamera()
    if(sameStructure&&!recovering){
      const changes=next.assets.filter(a=>JSON.stringify(a)!==JSON.stringify(previous.assets.find(x=>x.id===a.id)))
      const structural=changes.filter(a=>['pedestrian','vehicle','layby'].includes(a.kind))
      const indices=next.bores.flatMap((b,i)=>structural.some(a=>a.boreId===b.id||a.link?.targetBoreId===b.id)?[i]:[])
      const updateInterior=(config:TunnelProject)=>{if(indices.length){model.updateInterior(projectSurvey(config),indices);bindLights();model.setLighting(state);model.setWallsVisible(wallsVisible);model.setCanopyVisible(canopyVisible);model.setUnderground(viewer.scene.globe.translucency.enabled)}}
      try{updateInterior(next);for(const a of changes)moveRecord(a);await saveTunnelProject(next)}catch(error){updateInterior(previous);for(const a of changes){const old=previous.assets.find(x=>x.id===a.id);if(old)moveRecord(old)}throw error}
      if(next.name!==previous.name){await boards.update({...boards.config,name:next.name});model.setName(next.name)}project=next;options.onProject?.(next,true);roamTube=Math.min(roamTube,next.bores.length-1) as 0|1;reportRoaming();return
    }
    const sameInventory=JSON.stringify(previous.assets.map(a=>[a.id,a.kind]))===JSON.stringify(next.assets.map(a=>[a.id,a.kind]))
    const inventoryChanges=[...previous.assets.filter(a=>!next.assets.some(b=>b.id===a.id&&b.kind===a.kind)),...next.assets.filter(a=>!previous.assets.some(b=>b.id===a.id&&b.kind===a.kind))]
    const incrementalInventory=inventoryChanges.every(a=>!['street','substation','signal','vms','pedestrian','vehicle','shutter','layby'].includes(a.kind))
    if(!recovering&&(sameInventory||incrementalInventory)&&JSON.stringify(previous.origin)===JSON.stringify(next.origin)&&JSON.stringify(previous.bores.map(b=>b.id))===JSON.stringify(next.bores.map(b=>b.id))){
      const changed=next.bores.flatMap((b,i)=>JSON.stringify(b)===JSON.stringify(previous.bores[i])?[]:[i])
      if(changed.length||!sameInventory){
        const oldSurvey=survey;project=next;survey=projectSurvey(next)
        try{
          if(changed.length){await model.updateStructure(survey,changed);systems.replaceSites(model.sites,survey)}
          else{const interiors=next.bores.flatMap((b,i)=>inventoryChanges.some(a=>a.boreId===b.id&&['basic','enhanced'].includes(a.kind))?[i]:[]);if(interiors.length)model.updateInterior(survey,interiors)}
          if(!sameInventory){await systems.reconcileAssets(survey);for(const a of next.assets)if(!referenceHeadings.has(a.id)||inventoryChanges.some(c=>c.id===a.id))referenceHeadings.set(a.id,a.heading)}
          bindLights()
          signResources.dispose();signResources=sceneResources(viewer);boards=await addPortalBoards(viewer,survey);trafficSigns=await addPortalTrafficSigns(viewer,survey);signResources.capture()
          for(const a of next.assets)moveRecord(resolveAsset(a,next),false)
          model.setLighting(state);model.setWallsVisible(wallsVisible);model.setCanopyVisible(canopyVisible);model.setUnderground(viewer.scene.globe.translucency.enabled);systems.update(state)
          traffic?.dispose();traffic=await addTunnelTraffic(viewer,survey,()=>state)
          stopOverlays();stopOverlays=addSceneOverlays(viewer,survey,systems.devices,traffic.cars,()=>state,()=>interaction.selected,items=>options.onOverlays?.(items),positions=>options.onOverlayPositions?.(positions),()=>wallsVisible)
          const selectedId=interaction.selected?.id;interaction.dispose();interaction=addDeviceInteraction(viewer,survey,systems.devices,systems.models,d=>focusDevice(d.id),()=>options.onSignEdit?.(),i=>options.onTrafficSignEdit?.(i));if(selectedId)interaction.select(systems.devices.find(d=>d.id===selectedId));interaction.update(state)
          detection.refresh(survey,systems.instances);await saveTunnelProject(next);options.onProject?.(next,true);roamTube=Math.min(roamTube,next.bores.length-1) as 0|1;reportRoaming();options.onDevices?.([...systems.devices]);return
        }catch(error){project=previous;survey=oldSurvey;await applyProject(previous,true);throw error}
      }
    }
    const destination=Cartesian3.clone(viewer.camera.positionWC),direction=Cartesian3.clone(viewer.camera.directionWC),up=Cartesian3.clone(viewer.camera.upWC)
    stopOverlays();interaction.dispose();events.dispose();detection.dispose();effects.dispose();traffic?.dispose();systems.dispose();model.dispose();resources.dispose()
    project=next;referenceHeadings.clear();next.assets.forEach(a=>referenceHeadings.set(a.id,a.heading));survey=projectSurvey(next);resources=sceneResources(viewer)
    try{
      model=await addTunnelModel(viewer,survey)
      signResources=sceneResources(viewer);boards=await addPortalBoards(viewer,survey);trafficSigns=await addPortalTrafficSigns(viewer,survey);signResources.capture()
      systems=await addTunnelSystems(viewer,survey,undefined,model.sites)
      traffic=await addTunnelTraffic(viewer,survey,()=>state)
      bindLights()
      resources.capture()
      interaction=addDeviceInteraction(viewer,survey,systems.devices,systems.models,d=>focusDevice(d.id),()=>options.onSignEdit?.(),i=>options.onTrafficSignEdit?.(i))
      detection=addDetectionCoverage(viewer,survey,systems.devices);detection.bind(systems.instances);events=addTunnelEvents(viewer,survey);effects=addIncidentEffects(viewer,survey)
      stopOverlays=addSceneOverlays(viewer,survey,systems.devices,traffic.cars,()=>state,()=>interaction.selected,items=>options.onOverlays?.(items),positions=>options.onOverlayPositions?.(positions),()=>wallsVisible)
      model.setLighting(state);model.setWallsVisible(wallsVisible);model.setCanopyVisible(canopyVisible);model.setUnderground(viewer.scene.globe.translucency.enabled);systems.update(state);interaction.update(state)
      await saveTunnelProject(next);options.onProject?.(next,true);roamTube=Math.min(roamTube,next.bores.length-1) as 0|1;reportRoaming();options.onDevices?.(systems.devices)
    }catch(error){if(!recovering){resources.capture();project=next;await applyProject(previous,true)}throw error}finally{viewer.camera.setView({destination,orientation:{direction,up}});viewer.scene.requestRender()}
  }
  options.onSystems?.(state)
  return {
    editPortalPosition:(kind:string,end:number)=>editPortalPosition(viewer,`${kind}:${end}`),startPositionEdit,previewPosition,savePositionEdit,cancelPositionEdit,applyProject,previewAsset:moveRecord,resetView,focusPortal,playIntro,skipIntro:focusPortal,
    updateTrafficSigns:config=>trafficSigns.update(config),
    updatePortalSign:config=>boards.update(config),
    setDetectionVisible(visible:boolean){detection.setVisible(visible)},
    focusCamera(id:string) {
      const d=systems.devices.find(d=>d.id===id&&d.kind==='camera');if(!d||!deviceEnabled(d,state)||deviceAlarm(id,state)==='camera')return
      stopCamera()
      viewer.camera.setView({destination:tunnelPoint(survey,d.tube,d.station,d.lateral*.92,d.height-.15),
        orientation:{heading:d.tube===0?Math.PI/2:Math.PI*1.5,pitch:-.13,roll:0}})
      viewer.scene.requestRender()
    },
    setRoamingOptions(patch) {
      if(patch.tube!==undefined && patch.tube!==roamTube){roamTube=patch.tube;roamDistance=roamTube===0?-220:survey.length+220}
      if(patch.speed!==undefined)roamSpeed=Math.max(10,Math.min(100,patch.speed))
      moveRoaming();reportRoaming()
    },
    seekRoaming(progress:number) {cancelIntro();roamDistance=-220+Math.max(0,Math.min(1,progress))*(survey.length+440);moveRoaming();reportRoaming()},
    clearDeviceSelection(){interaction.select()},
    setCanopyVisible(visible:boolean){canopyVisible=visible;model.setCanopyVisible(visible);viewer.scene.requestRender()},
    setSystems(patch:Partial<SystemsState>) {
      state=changeSystems(state,patch);if(project&&patch.devices)void saveControlOverrides(project.id,state.devices).catch(e=>options.onWarning?.(String(e)));trafficSigns.setLighting(state.environment==='day');model.setLighting(state);systems.update(state);interaction.update(state);events.update(state)
      effects.update(state)
      const station=incidentStation(survey.length,state)
      const lateral=state.incident==='emergency'?(state.incidentTube===0?-6.1:6.1):state.incident==='line'?0:-2.15
      for(const [index,car] of incidentCars.entries()) {
        car.show=index===0?!!incidentDefinition(state.incident)?.car:['congestion','vehicle'].includes(state.incident)
        const offset=index===0?0:(state.incidentTube===0?-1:1)*index*8
        const frame=Transforms.eastNorthUpToFixedFrame(tunnelPoint(survey,state.incidentTube,station+offset,index%2===1?2.15:lateral,.25))
        car.modelMatrix=Matrix4.multiply(frame,Matrix4.fromRotationTranslation(Matrix3.multiply(
          Matrix3.fromRotationY(-Math.atan(survey.grade/100)),Matrix3.fromRotationZ((state.incidentTube===0?0:Math.PI)+(state.incident==='collision'?.12:0)),new Matrix3())),new Matrix4())
        setEquipmentLighting(car,illuminationAt(station,survey.length,state))
      }
      viewer.scene.light.intensity=state.environment==='day'?2.4:.25
      viewer.scene.fog.density=state.environment==='fog'?.0012:.0002
      viewer.scene.requestRender();return {...state}
    },
    focusIncident() {
      stopCamera()
      const s=incidentStation(survey.length,state)
      const target=tunnelPoint(survey,state.incidentTube,s,state.incident==='emergency'?(state.incidentTube===0?-6.1:6.1):-2.15,1.7)
      const direction=state.incidentTube===0?1:-1
      const offset=state.incident==='fire'?16:-32
      const position=tunnelPoint(survey,state.incidentTube,s+direction*offset,1.4,2.5)
      const up=Matrix4.multiplyByPointAsVector(Transforms.eastNorthUpToFixedFrame(target),Cartesian3.UNIT_Z,new Cartesian3())
      viewer.camera.setView({destination:position,orientation:{direction:Cartesian3.normalize(Cartesian3.subtract(target,position,new Cartesian3()),new Cartesian3()),up}})
      viewer.scene.requestRender()
    },
    focusDevice,
    setRoaming(enabled:boolean) {cancelIntro();roaming=enabled;if(enabled){previousFrame=performance.now();moveRoaming()}reportRoaming()},
    setWallsVisible(visible:boolean) { wallsVisible=visible;model.setWallsVisible(visible) },
    setUnderground(enabled:boolean) {viewer.scene.globe.translucency.enabled=enabled;model.setUnderground(enabled);viewer.scene.requestRender()},
    focusLayBy() {stopCamera();const bay=projectLayBy(survey,0);viewer.camera.setView({destination:tunnelPoint(survey,0,bay.start-17,-1.5,2.2),orientation:{heading:CesiumMath.toRadians(96),pitch:-.015,roll:0}});viewer.scene.requestRender()},
    focusSubstation() {stopCamera();look(tunnelPoint(survey,0,-PORTAL_EXTENSION-50,12,2.4),35,-25,32)},
    focusInterior(crossPassage=false) {stopCamera();viewer.camera.setView({destination:tunnelPoint(survey,0,crossPassage?(layoutPassages(survey,0).find(p=>p.vehicle)?.station??survey.length*.5):survey.length*.25-25,0,1.8),
      orientation:{heading:CesiumMath.toRadians((survey.heading??90)-(crossPassage?90:0)),pitch:crossPassage?0:Math.atan(survey.grade/100),roll:0}});viewer.scene.requestRender()},
    dispose() {
      disposed=true;introGeneration++;editing?.gizmo.dispose();detection.dispose();events.dispose();model.dispose();stopOverlays();effects.dispose();interaction.dispose();stopVehicleTick();traffic?.dispose();systems.dispose();stopRoamingTick();observer.disconnect()
      if(!viewer.isDestroyed()){viewer.camera.cancelFlight();const context=viewer.canvas.getContext('webgl2')??viewer.canvas.getContext('webgl');viewer.destroy();context?.getExtension('WEBGL_lose_context')?.loseContext()}
    },
  }
}
