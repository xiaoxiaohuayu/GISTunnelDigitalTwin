<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { boreTravelLabel, portalEndName } from '../engines/sceneFrame'
import { useEngine } from '../composables/useEngine'
import { createCesiumMap } from '../engines/cesiumMap'
import type { IntroPhase, SceneRuntimeError } from '../engines/cesiumMap'
import { deviceCatalog, initialSystems, deviceAlarmIds, deviceEnabled } from '../engines/tunnelSystemsState'
import type { DeviceKind } from '../engines/tunnelSystemsState'
import { EditorStore, applyTelemetryToOverlays, createCesiumEditorBridge, mergeBoundDeviceAlerts, resolveBoundDeviceReading } from '../editor'
import type { GizmoMode, SnapMode } from '../editor'
import { deleteCustomModel, listCustomModels, registerLocalGlb, registerRemoteGlb } from '../engines/customModelLibrary'
import type { CustomModelEntry } from '../engines/customModelLibrary'
import { defaultRuntimeConfig } from '../config/runtimeConfig'
import type { RuntimeConfig } from '../config/runtimeConfig'
import { appendAuditEntry, createTunnelServices, describeDeviceAction, describeSystemsAction, highRiskDeviceConfirmMessage, resolveUserRole, roleLabel, rolePermissions } from '../services'
import type { AuditEntry, ConnectionStatus, TelemetrySnapshot, TunnelServices } from '../services'
import CameraPlayer from './CameraPlayer.vue'
import type { SceneDevice, SystemsState, DeviceSettings } from '../engines/tunnelSystemsState'
import SceneLoading from './SceneLoading.vue'
import SceneOverlayLayer from './SceneOverlayLayer.vue'
import { defaultTrafficSigns, saveTrafficSigns } from '../engines/trafficSignConfig'
import { defaultPortalSign, savePortalSign } from '../engines/portalSignConfig'
import type { LoadProgress, PortalSignConfig, SceneOverlay, TrafficSignsConfig } from '../types/scene'
import SystemsControls from './SystemsControls.vue'
import DeviceExplorer from './DeviceExplorer.vue'
import DeviceInspector from './DeviceInspector.vue'
import DeviceAlerts from './DeviceAlerts.vue'
import { activeDeviceAlerts } from '../engines/deviceTelemetry'
import EventConsole from './EventConsole.vue'
import SceneRoaming from './SceneRoaming.vue'
import type { RoamingState } from '../types/tunnel'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import type { AssetRecord, CameraBookmark, SceneVisualSettings } from '../engines/projectConfig'
const ProjectEditor = defineAsyncComponent(() => import('./configuration/ProjectEditor.vue'))
const PositionEditor = defineAsyncComponent(() => import('./configuration/PositionEditor.vue'))
const PortalSignEditor = defineAsyncComponent(() => import('./PortalSignEditor.vue'))
const TrafficSignEditor = defineAsyncComponent(() => import('./TrafficSignEditor.vue'))
const EditorShell = defineAsyncComponent(() => import('./editor/EditorShell.vue'))
import { defaultProject } from '../engines/projectConfig'
import type { TunnelPackageExtras } from '../engines/projectPackage'
import { saveControlOverrides } from '../engines/projectStorage'
import type { TunnelProject } from '../engines/projectConfig'


const project=shallowRef<TunnelProject>(defaultProject()),projectOpen=shallowRef(false),editAssetId=shallowRef<string>()
const editorStore=new EditorStore({project:project.value})
const editorSnapshot=shallowRef(editorStore.getSnapshot())
const customModels=shallowRef<CustomModelEntry[]>([])
const draggingAsset=shallowRef(false)
const isEditorMode=computed(()=>editorSnapshot.value.mode==='editor')
let editorInitialized=false,editorMutating=false,priorCameraGuard=true
const unsubscribeEditor=editorStore.subscribe(snapshot=>{editorSnapshot.value=snapshot})
const boreNames=computed(()=>project.value.bores.map(bore=>bore.name))
const travelNames=computed(()=>project.value.bores.map(bore=>boreTravelLabel(bore.name,project.value.origin.heading,bore.lanes[0]?.direction===-1?-1:1)))
const incidentNames=computed(()=>project.value.bores.map(bore=>boreTravelLabel(bore.name,project.value.origin.heading,bore.lanes[0]?.direction===-1?-1:1,'行驶')))
const portalNames=computed(()=>[portalEndName(project.value.origin.heading,0),portalEndName(project.value.origin.heading,1)])
const positionDraft=shallowRef<AssetRecord>()
const storageWarning=shallowRef('')
const runtimeError=shallowRef<SceneRuntimeError|null>(null)
function reloadScene():void{window.location.reload()}
const container=useTemplateRef<HTMLDivElement>('container')
const overlayLayer=useTemplateRef<InstanceType<typeof SceneOverlayLayer>>('overlayLayer')
const roamingOpen=shallowRef(false),detectionVisible=shallowRef(false),monitor=shallowRef<SceneDevice>()
const roamingState=shallowRef<RoamingState>({playing:false,tube:0,speed:60,distance:-220,length:0})
const wallsVisible=shallowRef(true),canopyVisible=shallowRef(true),cameraGuardEnabled=shallowRef(true),selectedDevice=shallowRef<SceneDevice>()
const underground=shallowRef(false),panel=shallowRef<'devices'|'systems'|'events'|'sign'|'traffic'|null>(null)
const returnPanel=shallowRef<'devices'|'systems'|'events'|null>(null)
const returnLabel=computed(()=>returnPanel.value?{devices:'返回设备列表',systems:'返回系统控制',events:'返回演练清单'}[returnPanel.value]:'')
let panelScrollTop=0
const controlDeviceId=shallowRef('vms-1')
const devices=shallowRef<SceneDevice[]>([]),state=shallowRef({...initialSystems}),intro=shallowRef<IntroPhase>('earth'),skipRequested=shallowRef(false)
const progress=shallowRef<LoadProgress>({percent:0,stage:'渲染引擎',resource:'Cesium 资源初始化'})
const overlays=shallowRef<SceneOverlay[]>([]),signConfig=shallowRef<PortalSignConfig>(defaultPortalSign()),signWarning=shallowRef('')
const activeEvent=computed(()=>state.value.incident!=='none'||deviceAlarmIds(state.value).length>0)
const trafficSignsConfig=shallowRef<TrafficSignsConfig>(defaultTrafficSigns()),trafficSignIndex=shallowRef(-1),trafficSignWarning=shallowRef('')
let panelTrigger:HTMLElement|undefined
const runtimeConfig=shallowRef<RuntimeConfig>(defaultRuntimeConfig())
const userRole=computed(()=>resolveUserRole(runtimeConfig.value.auth.defaultRole,typeof window!=='undefined'?window.location.search:''))
const permissions=computed(()=>rolePermissions(userRole.value))
const auditEntries=shallowRef<AuditEntry[]>([])
const controlBusy=shallowRef(false)
const telemetrySnapshot=shallowRef<TelemetrySnapshot>({connection:'mock',readings:{}})
const connectionLabels:Record<ConnectionStatus,string>={mock:'本地演示',connecting:'实时连接中',connected:'实时在线',reconnecting:'实时重连中',offline:'实时离线'}
const connectionLabel=computed(()=>connectionLabels[telemetrySnapshot.value.connection])
let services:TunnelServices=createTunnelServices(runtimeConfig.value)
let unsubscribeTelemetry=services.telemetry.subscribe(snapshot=>{telemetrySnapshot.value=snapshot})
function bindServices(config:RuntimeConfig):void{
  runtimeConfig.value=config
  unsubscribeTelemetry();services.dispose()
  services=createTunnelServices(config)
  unsubscribeTelemetry=services.telemetry.subscribe(snapshot=>{telemetrySnapshot.value=snapshot})
  services.telemetry.start()
}
onBeforeUnmount(()=>{unsubscribeEditor();unsubscribeTelemetry();services.dispose()})
const selectedAsset=computed(()=>selectedDevice.value?project.value.assets.find(item=>item.id===selectedDevice.value!.id):undefined)
const selectedLiveReading=computed(()=>{
  if(!selectedDevice.value)return undefined
  const snap=telemetrySnapshot.value
  const liveFallback=services.telemetry.mode==='live'?services.telemetry.getReading(selectedDevice.value,state.value,roamingState.value.length):undefined
  return resolveBoundDeviceReading(selectedDevice.value,selectedAsset.value,snap,state.value,roamingState.value.length,liveFallback)
})
const {ready,error,resetView,getHandle}=useEngine(container,element=>createCesiumMap(element,{
  onRuntimeConfig:bindServices,
  onRuntimeError:value=>{runtimeError.value=value},
  onUndergroundChange:value=>{underground.value=value},
  onPositionEdit:value=>{positionDraft.value=value},
  onProject:value=>{project.value=value;if(!editorMutating){editorStore.syncProject(value,!editorInitialized);editorInitialized=true}},
  onWarning:message=>{storageWarning.value=message},
  onSystems:value=>{state.value=value},
  onOverlayPositions:positions=>overlayLayer.value?.updatePositions(positions),
  onProgress:next=>{progress.value=next},onOverlays:items=>{overlays.value=items},
  onTrafficSignEdit:index=>{if(isEditorMode.value)return;monitor.value=undefined;roamingOpen.value=false;selectedDevice.value=undefined;trafficSignIndex.value=index;panel.value='traffic'},
  onTrafficSignsConfig:(config,warning)=>{trafficSignsConfig.value=config;trafficSignWarning.value=warning},
  onSignEdit:()=>{if(isEditorMode.value)return;monitor.value=undefined;roamingOpen.value=false;selectedDevice.value=undefined;panel.value='sign';nextTick(()=>document.querySelector<HTMLElement>('.sign-editor input')?.focus())},
  onSignConfig:(config,warning)=>{signConfig.value=config;signWarning.value=warning},
  onRoaming:next=>{roamingState.value=next},
  onDeviceSelect:device=>{
    if(isEditorMode.value){editorStore.select([device.id]);return}
    if(panel.value==='devices'||panel.value==='systems'||panel.value==='events'){
      returnPanel.value=panel.value
      panelScrollTop=document.querySelector<HTMLElement>('.scene-panel:not([style*="display: none"])')?.scrollTop??0
    }else if(!selectedDevice.value)returnPanel.value=null
    monitor.value=undefined;roamingOpen.value=false;selectedDevice.value=device;panel.value=null
    nextTick(()=>{const inspector=document.querySelector<HTMLElement>('.device-inspector');if(!inspector?.contains(document.activeElement))inspector?.querySelector<HTMLElement>('.inspector-close')?.focus({preventScroll:true})})
  },
  onDevices:list=>{devices.value=list},onIntro:phase=>{intro.value=phase},shouldSkipIntro:()=>skipRequested.value,
}))
async function refreshCustomModels():Promise<void>{try{customModels.value=await listCustomModels()}catch{customModels.value=[]}}
watch(ready,isReady=>{const handle=getHandle();if(isReady&&handle){editorStore.setBridge(createCesiumEditorBridge(handle));void refreshCustomModels()}})
function enterEditorMode():void{
  if(!permissions.value.canEditProject){storageWarning.value='当前角色无权进入场景编辑器';return}
  if(positionDraft.value){storageWarning.value='请先保存或取消位置调整';return}
  const handle=getHandle();if(handle)editorStore.setBridge(createCesiumEditorBridge(handle))
  closeDevice();panel.value=null;stopRoaming();roamingOpen.value=false;monitor.value=undefined;projectOpen.value=false
  priorCameraGuard=cameraGuardEnabled.value
  if(cameraGuardEnabled.value){cameraGuardEnabled.value=false;handle?.setCameraGuardEnabled(false)}
  void refreshCustomModels()
  editorStore.syncProject(project.value,false)
  editorStore.setMode('editor')
}
function exitEditorMode():void{
  getHandle()?.detachEditorGizmo()
  if(positionDraft.value)getHandle()?.cancelPositionEdit()
  editorStore.setMode('runtime')
  cameraGuardEnabled.value=priorCameraGuard
  getHandle()?.setCameraGuardEnabled(priorCameraGuard)
}
watch(
  [isEditorMode, () => editorSnapshot.value.selectedIds, () => positionDraft.value, () => editorSnapshot.value.project],
  ([editorOn, ids, draft, proj]) => {
    const handle = getHandle()
    if (!handle) return
    if (!editorOn || draft || ids.length !== 1) {
      handle.detachEditorGizmo()
      return
    }
    const targetId = ids[0]!
    const targetAsset = proj.assets.find(item => item.id === targetId)
    if (!targetAsset || targetAsset.locked || targetAsset.visible === false) {
      handle.detachEditorGizmo()
      return
    }
    handle.attachEditorGizmo(targetId, {
      mode: editorSnapshot.value.gizmoMode,
      snapMode: editorSnapshot.value.snapMode,
      onCommit(before, after) {
        void runEditorTask(() =>
          editorStore.commitAssetTransform(
            targetId,
            {
              chainage: after.chainage,
              lateral: after.lateral,
              height: after.height,
              heading: after.heading,
              scale: after.scale,
            },
            { before, label: `3D 调整 ${after.code}` },
          ),
        )
      },
    })
  },
)
watch(
  [() => editorSnapshot.value.gizmoMode, () => editorSnapshot.value.snapMode],
  ([mode, snapMode]) => {
    getHandle()?.setEditorGizmoOptions({ mode, snapMode })
  },
)
async function runEditorTask(task:()=>Promise<unknown>):Promise<void>{
  editorMutating=true
  try{await task();storageWarning.value=''}
  catch(err){storageWarning.value=err instanceof Error?err.message:String(err)}
  finally{editorMutating=false}
}
function editorAddAsset(kind:DeviceKind,boreId:string):void{
  const bore=project.value.bores.find(b=>b.id===boreId)??project.value.bores[0]
  if(!bore)return
  const label=deviceCatalog.find(row=>row[1]===kind)?.[2]??kind
  const id=crypto.randomUUID()
  const existingCodes=new Set(project.value.assets.map(a=>a.code))
  let seq=project.value.assets.length+1,code=`${kind.toUpperCase()}-${seq}`
  while(existingCodes.has(code)){seq+=1;code=`${kind.toUpperCase()}-${seq}`}
  const mid=Math.round((bore.start+bore.end)/2)
  const height=kind==='fan'?6.2:kind==='vms'||kind==='lane'?5.6:kind==='pump'||kind==='tank'?1.2:4.2
  const record:AssetRecord={id,code,name:label,kind,boreId:bore.id,chainage:mid,lateral:0,height,heading:bore.lanes[0]?.direction===-1?180:0}
  void runEditorTask(async()=>{await editorStore.addAsset(record);focusDevice(id)})
}
function editorCommitTransform(id:string,patch:Partial<AssetRecord>,mergeKey?:string):void{
  void runEditorTask(()=>editorStore.commitAssetTransform(id,patch,{mergeKey}))
}
function editorDuplicate(ids:string[]):void{
  void runEditorTask(async()=>{const clones=await editorStore.duplicateAssets(ids);if(clones[0])focusDevice(clones[0].id)})
}
function editorDelete(ids:string[]):void{
  void runEditorTask(()=>editorStore.deleteAssets(ids))
}
function editorUpdateProjectName(name:string):void{
  void runEditorTask(()=>editorStore.updateProject(draft=>{draft.name=name},'修改隧道名称'))
}
function editorUndo():void{void runEditorTask(()=>editorStore.undo())}
function editorRedo():void{void runEditorTask(()=>editorStore.redo())}
function editorUploadGlb(file:File):void{
  void runEditorTask(async()=>{await registerLocalGlb(file,file.name);await refreshCustomModels()})
}
function editorAddRemoteGlb(url:string,name:string):void{
  void runEditorTask(async()=>{await registerRemoteGlb(url,name);await refreshCustomModels()})
}
function editorDeleteCustomModel(id:string):void{
  void runEditorTask(async()=>{await deleteCustomModel(id);await refreshCustomModels()})
}
function editorPlaceCustomModel(model:CustomModelEntry,boreId:string):void{
  const bore=project.value.bores.find(b=>b.id===boreId)??project.value.bores[0]
  if(!bore)return
  const id=crypto.randomUUID()
  const existingCodes=new Set(project.value.assets.map(a=>a.code))
  let seq=project.value.assets.length+1,code=`GLB-${seq}`
  while(existingCodes.has(code)){seq+=1;code=`GLB-${seq}`}
  const mid=Math.round((bore.start+bore.end)/2)
  const record:AssetRecord={id,code,name:model.name,kind:'custom',boreId:bore.id,chainage:mid,lateral:0,height:0.2,heading:bore.lanes[0]?.direction===-1?180:0,scale:1,customModelId:model.id,customModelUrl:model.url}
  void runEditorTask(async()=>{await editorStore.addAsset(record);focusDevice(id)})
}
function editorPreviewVisuals(visuals:SceneVisualSettings):void{
  getHandle()?.setSceneVisuals(visuals)
}
function editorCommitVisuals(visuals:SceneVisualSettings):void{
  getHandle()?.setSceneVisuals(visuals)
  void runEditorTask(()=>editorStore.updateProject(draft=>{draft.visuals={...visuals}},'调整场景光影与雾效'))
}
function editorCaptureBookmark(name:string):void{
  const handle=getHandle();if(!handle)return
  const bookmark=handle.captureCameraBookmark(name)
  void runEditorTask(()=>editorStore.updateProject(draft=>{draft.bookmarks=[...(draft.bookmarks??[]),bookmark]},`新增视角书签 ${bookmark.name}`))
}
function editorFlyBookmark(bookmark:CameraBookmark):void{
  getHandle()?.flyToCameraBookmark(bookmark)
}
function editorDeleteBookmark(id:string):void{
  void runEditorTask(()=>editorStore.updateProject(draft=>{draft.bookmarks=(draft.bookmarks??[]).filter(item=>item.id!==id)},'删除视角书签'))
}
function editorToggleVisibility(id:string,visible:boolean):void{
  void runEditorTask(()=>editorStore.commitAssetTransform(id,{visible},{label:visible?'显示设备':'隐藏设备'}))
}
function editorToggleLock(id:string,locked:boolean):void{
  void runEditorTask(()=>editorStore.commitAssetTransform(id,{locked},{label:locked?'锁定设备':'解锁设备'}))
}
function onViewportDragOver(event:DragEvent):void{
  if(!isEditorMode.value||!event.dataTransfer?.types.includes('application/x-codex-aigis-asset'))return
  event.preventDefault()
  event.dataTransfer.dropEffect='copy'
  draggingAsset.value=true
}
function onViewportDragLeave(event:DragEvent):void{
  if(event.currentTarget===event.target)draggingAsset.value=false
}
function onViewportDrop(event:DragEvent):void{
  draggingAsset.value=false
  if(!isEditorMode.value)return
  const raw=event.dataTransfer?.getData('application/x-codex-aigis-asset')
  if(!raw)return
  event.preventDefault()
  let payload:{type:'builtin';kind:DeviceKind}|{type:'custom';modelId:string}
  try{payload=JSON.parse(raw)}catch{return}
  const hit=getHandle()?.pickTunnelDropLocation(event.clientX,event.clientY)
  const bore=project.value.bores.find(b=>b.id===hit?.boreId)??project.value.bores[0]
  if(!bore)return
  const id=crypto.randomUUID()
  const existingCodes=new Set(project.value.assets.map(a=>a.code))
  const heading=bore.lanes[0]?.direction===-1?180:0
  if(payload.type==='builtin'){
    const kind=payload.kind
    const label=deviceCatalog.find(row=>row[1]===kind)?.[2]??kind
    let seq=project.value.assets.length+1,code=`${kind.toUpperCase()}-${seq}`
    while(existingCodes.has(code)){seq+=1;code=`${kind.toUpperCase()}-${seq}`}
    const defaultHeight=kind==='fan'?6.2:kind==='vms'||kind==='lane'?5.6:kind==='pump'||kind==='tank'?1.2:4.2
    const record:AssetRecord={id,code,name:label,kind,boreId:bore.id,chainage:hit?.chainage??Math.round((bore.start+bore.end)/2),lateral:hit?.lateral??0,height:hit?Math.max(0.2,hit.height):defaultHeight,heading}
    void runEditorTask(()=>editorStore.addAsset(record,`拖放设备 ${code}`))
  }else{
    const model=customModels.value.find(item=>item.id===payload.modelId)
    if(!model)return
    let seq=project.value.assets.length+1,code=`GLB-${seq}`
    while(existingCodes.has(code)){seq+=1;code=`GLB-${seq}`}
    const record:AssetRecord={id,code,name:model.name,kind:'custom',boreId:bore.id,chainage:hit?.chainage??Math.round((bore.start+bore.end)/2),lateral:hit?.lateral??0,height:hit?Math.max(0.1,hit.height):0.2,heading,scale:1,customModelId:model.id,customModelUrl:model.url}
    void runEditorTask(()=>editorStore.addAsset(record,`拖放模型 ${model.name}`))
  }
}
function openProject(id?:string):void{if(!permissions.value.canEditProject){storageWarning.value='当前角色无权修改配置与台账';return}if(positionDraft.value){storageWarning.value="请先保存或取消位置调整";return}editAssetId.value=id;projectOpen.value=true;closeDevice();panel.value=null;stopRoaming()}
async function applyProject(value:TunnelProject|null,focusId?:string,extras?:TunnelPackageExtras):Promise<void>{
  if(extras?.portalSign){await savePortalSign(extras.portalSign);signConfig.value=extras.portalSign}
  if(extras?.trafficSigns){await saveTrafficSigns(extras.trafficSigns);trafficSignsConfig.value=extras.trafficSigns}
  await getHandle()!.applyProject(value)
  if(extras?.portalSign)await getHandle()?.updatePortalSign(extras.portalSign)
  if(extras?.trafficSigns)await getHandle()?.updateTrafficSigns(extras.trafficSigns)
  if(value&&extras){await saveControlOverrides(value.id,extras.controls);change({devices:extras.controls})}
  projectOpen.value=false;if(focusId){const d=devices.value.find(d=>d.id===focusId);if(d)selectedDevice.value=d}
}

const phases:Record<IntroPhase,string>={earth:'地球视角',region:'区域定位',overview:'线路全览',portal:'抵达洞口',complete:''}
function applySystemsPatch(patch:Partial<SystemsState>):void{const next=getHandle()?.setSystems(patch);if(next)state.value=next}
function recordAudit(target:string,action:string,status:AuditEntry['status'],id:string,message?:string):void{
  auditEntries.value=appendAuditEntry(auditEntries.value,{id,timestamp:Date.now(),role:userRole.value,target,action,status,message})
}
function change(patch:Partial<SystemsState>):void{
  if(!permissions.value.canControl){storageWarning.value='当前只读角色无权执行系统控制';return}
  const summary=describeSystemsAction(patch)
  if(services.control.mode==='mock'){applySystemsPatch(patch);recordAudit(summary.target,summary.action,'applied',`local-${Date.now()}`);return}
  controlBusy.value=true
  void services.control.sendSystemsControl(patch,state.value).then(result=>{
    recordAudit(summary.target,summary.action,result.status,result.commandId,result.message)
    if(result.ok&&result.appliedPatch){storageWarning.value='';applySystemsPatch(result.appliedPatch)}
    else if(!result.ok){storageWarning.value=result.message??'系统控制指令下发失败'}
  }).finally(()=>{controlBusy.value=false})
}
async function changeDevice(id:string,patch:DeviceSettings):Promise<void>{
  if(!permissions.value.canControl){storageWarning.value='当前只读角色无权执行设备控制';return}
  const device=devices.value.find(item=>item.id===id)
  const confirmText=highRiskDeviceConfirmMessage(device,patch)
  if(confirmText){
    try{await ElMessageBox.confirm(confirmText,'高危控制确认',{type:'warning',confirmButtonText:'确认下发',cancelButtonText:'取消'})}
    catch{return}
  }
  const summary=describeDeviceAction(device,id,patch)
  controlBusy.value=services.control.mode==='live'
  try{
    const result=await services.control.sendDeviceControl(id,patch,state.value)
    recordAudit(summary.target,summary.action,result.status,result.commandId,result.message)
    if(result.ok&&result.appliedPatch){storageWarning.value='';applySystemsPatch(result.appliedPatch)}
    else if(!result.ok){storageWarning.value=result.message??'设备控制指令下发失败'}
  }finally{controlBusy.value=false}
}
function stopRoaming():void{getHandle()?.setRoaming(false)}
function view(action:()=>void):void{stopRoaming();monitor.value=undefined;action()}
function skip():void{skipRequested.value=true;getHandle()?.skipIntro()}
function replay():void{skipRequested.value=false;getHandle()?.playIntro()}
function focusDevice(id:string):void{roamingOpen.value=false;view(()=>getHandle()?.focusDevice(id))}
async function editVms():Promise<void>{if(selectedDevice.value)controlDeviceId.value=selectedDevice.value.id;closeDevice();panel.value='systems';await nextTick();document.querySelector<HTMLElement>('.vms-editor')?.scrollIntoView({block:'start'});document.querySelector<HTMLTextAreaElement>('.vms-editor textarea')?.focus({preventScroll:true})}
function closeDevice():void{selectedDevice.value=undefined;getHandle()?.clearDeviceSelection()}
async function backToPanel():Promise<void>{
  const id=selectedDevice.value?.id,target=returnPanel.value
  closeDevice();panel.value=target
  await nextTick()
  const drawer=document.querySelector<HTMLElement>('.scene-panel:not([style*="display: none"])')
  if(drawer)drawer.scrollTop=panelScrollTop
  const result=id?drawer?.querySelector<HTMLElement>(`[data-device-id="${id}"]`):null
  ;(result??drawer?.querySelector<HTMLElement>('header button'))?.focus({preventScroll:true})
}
function closePanel():void{panel.value=null;panelTrigger?.focus()}
async function togglePanel(next:'devices'|'systems'|'events',event:Event):Promise<void>{
  if(panel.value===next){closePanel();return}
  panelTrigger=event.currentTarget as HTMLElement;closeDevice();panel.value=next
  await nextTick();document.querySelector<HTMLElement>('.scene-panel:not([style*="display: none"]) header button')?.focus()
}
function dismiss():void{if(positionDraft.value){getHandle()?.cancelPositionEdit();return}closePanel();closeDevice();monitor.value=undefined}
async function applyTrafficSigns(config:TrafficSignsConfig):Promise<void>{await getHandle()?.updateTrafficSigns(config)}
async function applySign(config:PortalSignConfig):Promise<void>{await getHandle()?.updatePortalSign(config)}
const alerts=computed(()=>mergeBoundDeviceAlerts(activeDeviceAlerts(devices.value,state.value,roamingState.value.length),devices.value,project.value.assets,telemetrySnapshot.value,state.value,roamingState.value.length))
const displayOverlays=computed(()=>applyTelemetryToOverlays(overlays.value,project.value.assets,telemetrySnapshot.value,devices.value,state.value,roamingState.value.length))
const siblings=computed(()=>devices.value.filter(device=>device.kind===selectedDevice.value?.kind))
const selectedIndex=computed(()=>siblings.value.findIndex(device=>device.id===selectedDevice.value?.id))
function nextDevice(direction:number):void {
  const next=siblings.value[(selectedIndex.value+direction+siblings.value.length)%siblings.value.length]
  if(next)focusDevice(next.id)
}
function focusIncident():void{closeDevice();roamingOpen.value=false;view(()=>getHandle()?.focusIncident())}
function previewCamera(id:string):void{
  view(()=>getHandle()?.focusCamera(id));monitor.value=devices.value.find(d=>d.id===id)
}
function playRoaming(playing:boolean):void {
  if(playing){closeDevice();panel.value=null;monitor.value=undefined}
  getHandle()?.setRoaming(playing)
}
function openRoaming():void{roamingOpen.value=!roamingOpen.value;playRoaming(roamingOpen.value)}

</script>
<template>
  <section class="viewport" aria-label="GIS 隧道场景" :class="{'is-roaming':roamingOpen,'has-device-alerts':alerts.length>0}" :style="alerts.length?{'--alert-panel-top':`${154+Math.min(150,alerts.length*70)}px`,'--alert-mobile-top':`${170+Math.min(110,alerts.length*62)}px`}:undefined" @keydown.esc="dismiss" @dragover="onViewportDragOver" @dragleave="onViewportDragLeave" @drop="onViewportDrop">
    <div ref="container" class="engine-container" />
    <SceneLoading v-if="!ready" :progress="progress" :error="error" />
    <div v-if="runtimeError" class="viewport-message runtime-error-card" role="alert">
      <strong>{{runtimeError.kind==='webgl-lost'?'WebGL 渲染上下文已丢失':'三维场景渲染异常'}}</strong>
      <p>{{runtimeError.message}}</p>
      <div class="runtime-error-actions"><el-button type="primary" size="small" @click="reloadScene">重新加载场景</el-button><el-button v-if="runtimeError.recoverable" size="small" @click="runtimeError=null">继续等待恢复</el-button></div>
    </div>
    <div v-else-if="storageWarning" class="viewport-message warning-banner" role="alert"><span>{{storageWarning}}</span><el-button size="small" text @click="storageWarning=''">知道了</el-button></div>
    <div v-else-if="intro!=='complete'" class="arrival" aria-live="polite"><span class="arrival-step">{{phases[intro]}}</span><span>{{ready?'镜头正在抵达隧道':'正在加载地形与设备模型'}}</span><el-button @click="skip">{{skipRequested?'将在加载后直接抵达':'跳过入场'}}</el-button></div>
    <template v-if="!isEditorMode">
      <div class="scene-context"><span class="scene-live-dot" />{{project.name}}<span>{{project.bores.length}} 个洞筒 · {{connectionLabel}} · {{roleLabel(userRole)}}</span></div>
      <div class="scene-actions">
        <el-button :disabled="!ready" :type="panel==='devices'?'primary':'default'" :aria-expanded="panel==='devices'" @click="togglePanel('devices',$event)">设备与设施</el-button>
        <el-button v-if="permissions.canControl" :disabled="!ready" :type="panel==='systems'?'primary':'default'" :aria-expanded="panel==='systems'" @click="togglePanel('systems',$event)">系统控制</el-button>
        <el-button v-if="permissions.canDrill" :disabled="!ready" :type="panel==='events'?'primary':'default'" :aria-expanded="panel==='events'" @click="togglePanel('events',$event)">事件演练<span v-if="activeEvent" class="event-indicator">进行中</span></el-button>
        <el-button :disabled="!ready" @click="replay">重播入场</el-button>
        <el-button v-if="permissions.canEditProject" :disabled="!ready" type="primary" plain @click="enterEditorMode">场景编辑器</el-button>
        <el-button v-if="permissions.canEditProject" :type="projectOpen?'primary':'default'" :aria-expanded="projectOpen" @click="openProject()">配置与台账</el-button>
      </div>
      <aside v-show="panel&&panel!=='events'" class="scene-panel" :aria-label="panel==='devices'?'设备与设施':panel==='sign'?'入口标牌':panel==='traffic'?'洞口交通标志':'系统控制'">
        <header><h2>{{panel==='devices'?'设备与设施':panel==='sign'?'入口标牌':panel==='traffic'?'洞口交通标志':'系统控制'}}</h2><el-button text aria-label="关闭面板" @click="closePanel">×</el-button></header>
        <div v-show="panel==='devices'"><DeviceExplorer :bore-names="boreNames" :devices="devices" :state="state" :length="roamingState.length" @focus="focusDevice" /></div>
        <template v-if="panel==='systems'||panel==='sign'||panel==='traffic'"><SystemsControls :bore-names="incidentNames" v-if="panel==='systems'&&permissions.canControl" :state="state" :devices="devices" :device-id="controlDeviceId" :length="roamingState.length" :audit-entries="auditEntries" :control-busy="controlBusy" @select-device="controlDeviceId=$event" @locate-device="focusDevice" @device-change="changeDevice" @change="change" @locate-incident="focusIncident" /><PortalSignEditor v-if="panel!=='traffic'&&permissions.canEditProject" :config="signConfig" :length="roamingState.length" :apply="applySign" @position="getHandle()?.editPortalPosition('board',$event)" :warning="signWarning" @saved="signConfig=$event" /><TrafficSignEditor v-if="(panel==='traffic'||panel==='systems')&&permissions.canEditProject" :config="trafficSignsConfig" :active-index="panel==='traffic'?trafficSignIndex:-1" :warning="trafficSignWarning" :apply="applyTrafficSigns" @position="getHandle()?.editPortalPosition('traffic',$event)" @saved="trafficSignsConfig=$event" /></template>
      </aside>
      <DeviceAlerts v-if="ready" :alerts="alerts" @focus="focusDevice" />
      <DeviceInspector v-if="selectedDevice&&!positionDraft" :device="selectedDevice" :state="state" :index="selectedIndex" :total="siblings.length" :length="roamingState.length" :return-label="returnLabel" :live-reading="selectedLiveReading" :telemetry-binding="selectedAsset?.telemetry" :can-control="permissions.canControl" :can-edit-project="permissions.canEditProject" @edit-position="getHandle()?.startPositionEdit(selectedDevice.id)" @back="backToPanel" @close="closeDevice" @locate="focusDevice" @change="changeDevice(selectedDevice.id,$event)" @camera="previewCamera" @next="nextDevice" @edit-vms="editVms" />
      <EventConsole v-if="permissions.canDrill" :bore-names="boreNames" :open="panel==='events'" :state="state" :ready="ready" :devices="devices" :length="roamingState.length" @close="closePanel" @change="change" @locate-incident="focusIncident" @locate-device="focusDevice" />
      <SceneOverlayLayer ref="overlayLayer" :items="displayOverlays" :panel-open="!!panel||!!selectedDevice" @select="focusDevice" />
      <SceneRoaming :bore-names="travelNames" v-if="roamingOpen" :state="roamingState" @close="roamingOpen=false" @play="playRoaming" @options="getHandle()?.setRoamingOptions($event)" @seek="getHandle()?.seekRoaming($event)" />
      <CameraPlayer v-if="monitor" :device="monitor" :bore-name="monitor.boreName" :stream-url="runtimeConfig.streams[monitor.id]" @close="monitor=undefined;view(()=>getHandle()?.focusPortal())" />
      <div v-if="devices.some(d=>d.kind==='speaker'&&deviceEnabled(d,state))" class="broadcast-state" role="status">应急广播中 · {{['fire','smoke','collision'].includes(state.incident)?'请按指示前往就近横洞':'广播状态本地演示'}}（静音演示）</div>
      <div class="viewport-tools" role="toolbar" aria-label="场景导航">
        <div class="tool-group" role="group" aria-label="结构显隐">
          <span class="tool-group-label">结构</span>
          <el-button size="small" :disabled="!ready" :type="underground?'primary':'default'" :aria-pressed="underground" @click="underground=!underground;getHandle()?.setUnderground(underground)">{{underground?'恢复山体':'地下结构'}}</el-button>
          <el-button size="small" :disabled="!ready" :type="canopyVisible?'primary':'default'" :aria-pressed="canopyVisible" @click="canopyVisible=!canopyVisible;getHandle()?.setCanopyVisible(canopyVisible)">遮雨棚：{{canopyVisible?'开':'关'}}</el-button>
          <el-button size="small" :disabled="!ready" :type="wallsVisible?'primary':'default'" :aria-pressed="wallsVisible" @click="wallsVisible=!wallsVisible;getHandle()?.setWallsVisible(wallsVisible)">隧道墙体：{{wallsVisible?'开':'关'}}</el-button>
        </div>
        <div class="tool-group" role="group" aria-label="视角定位">
          <span class="tool-group-label">视角</span>
          <el-button size="small" :disabled="!ready" @click="view(()=>getHandle()?.focusPortal(0))">{{portalNames[0]}}</el-button>
          <el-button size="small" :disabled="!ready" @click="view(()=>getHandle()?.focusPortal(1))">{{portalNames[1]}}</el-button>
          <el-button size="small" :disabled="!ready" @click="view(()=>getHandle()?.focusSubstation())">变电所</el-button>
          <el-button size="small" :disabled="!ready" @click="view(()=>getHandle()?.focusInterior())">洞内</el-button>
          <el-button size="small" :disabled="!ready" @click="view(()=>getHandle()?.focusInterior(true))">横洞</el-button>
          <el-button size="small" :disabled="!ready" @click="view(()=>getHandle()?.focusLayBy())">停车带</el-button>
          <el-button size="small" :disabled="!ready" @click="view(resetView)">全览</el-button>
        </div>
        <div class="tool-group" role="group" aria-label="巡检工具">
          <span class="tool-group-label">巡检</span>
          <el-button size="small" :disabled="!ready" :type="detectionVisible?'primary':'default'" :aria-pressed="detectionVisible" @click="detectionVisible=!detectionVisible;getHandle()?.setDetectionVisible(detectionVisible)">检测范围：{{detectionVisible?'开':'关'}}</el-button>
          <el-button size="small" :disabled="!ready" :type="cameraGuardEnabled?'primary':'default'" :aria-pressed="cameraGuardEnabled" @click="cameraGuardEnabled=!cameraGuardEnabled;getHandle()?.setCameraGuardEnabled(cameraGuardEnabled)">防穿模：{{cameraGuardEnabled?'开':'关'}}</el-button>
          <el-button size="small" :disabled="!ready" :type="roamingOpen?'primary':'default'" :aria-pressed="roamingOpen" @click="openRoaming">巡检漫游</el-button>
        </div>
      </div>
      <div class="scene-help">点选设备查看详情 · 左键平移 · 右键绕中心旋转 · 滚轮缩放</div>
    </template>
    <EditorShell
      v-if="isEditorMode"
      :snapshot="editorSnapshot"
      :custom-models="customModels"
      :telemetry-snapshot="telemetrySnapshot"
      :drop-active="draggingAsset"
      :environment="state.environment"
      :underground="underground"
      :walls-visible="wallsVisible"
      :canopy-visible="canopyVisible"
      :detection-visible="detectionVisible"
      :camera-guard-enabled="cameraGuardEnabled"
      @exit="exitEditorMode"
      @undo="editorUndo"
      @redo="editorRedo"
      @set-gizmo-mode="(mode:GizmoMode)=>editorStore.setGizmoMode(mode)"
      @set-snap-mode="(mode:SnapMode)=>editorStore.setSnapMode(mode)"
      @select="(id,opts)=>editorStore.select([id],opts)"
      @clear-selection="editorStore.clearSelection()"
      @focus="focusDevice"
      @start-gizmo="id=>getHandle()?.startPositionEdit(id)"
      @add-asset="editorAddAsset"
      @toggle-visibility="editorToggleVisibility"
      @toggle-lock="editorToggleLock"
      @upload-glb="editorUploadGlb"
      @add-remote-glb="editorAddRemoteGlb"
      @delete-custom-model="editorDeleteCustomModel"
      @place-custom-model="editorPlaceCustomModel"
      @duplicate="editorDuplicate"
      @delete="editorDelete"
      @preview-transform="(id,patch)=>editorStore.previewAssetTransform(id,patch)"
      @commit-transform="editorCommitTransform"
      @update-project-name="editorUpdateProjectName"
      @preview-visuals="editorPreviewVisuals"
      @commit-visuals="editorCommitVisuals"
      @capture-bookmark="editorCaptureBookmark"
      @fly-bookmark="editorFlyBookmark"
      @delete-bookmark="editorDeleteBookmark"
      @open-full-config="openProject(editorSnapshot.selectedIds[0])"
      @set-environment="env=>change({environment:env})"
      @toggle-underground="val=>{underground=val;getHandle()?.setUnderground(val)}"
      @toggle-walls="val=>{wallsVisible=val;getHandle()?.setWallsVisible(val)}"
      @toggle-canopy="val=>{canopyVisible=val;getHandle()?.setCanopyVisible(val)}"
      @toggle-detection="val=>{detectionVisible=val;getHandle()?.setDetectionVisible(val)}"
      @toggle-camera-guard="val=>{cameraGuardEnabled=val;getHandle()?.setCameraGuardEnabled(val)}"
    />
    <PositionEditor v-if="positionDraft" :asset="positionDraft" :save="()=>getHandle()!.savePositionEdit()" @preview="getHandle()?.previewPosition($event)" @cancel="getHandle()?.cancelPositionEdit()" />
    <ProjectEditor v-if="projectOpen" :project="project" :selected-id="editAssetId" :apply="applyProject" @close="projectOpen=false" />
  </section>
</template>

<style scoped>
.runtime-error-card{display:flex;flex-direction:column;gap:10px;width:min(420px,calc(100% - 32px));border-radius:6px}
.runtime-error-card strong{font-size:15px;color:#ffb7a1}
.runtime-error-card p{margin:0;font-size:12px;line-height:1.6;color:#d5e4f8}
.runtime-error-actions{display:flex;gap:8px;justify-content:flex-end}
.warning-banner{display:flex;align-items:center;gap:14px;border-radius:6px;font-size:12px;line-height:1.6}
</style>
