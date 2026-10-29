<script setup lang="ts">
import { computed, nextTick, shallowRef, useTemplateRef } from 'vue'
import { useEngine } from '../composables/useEngine'
import { createCesiumMap } from '../engines/cesiumMap'
import type { IntroPhase } from '../engines/cesiumMap'
import { initialSystems, deviceAlarmIds, deviceEnabled, changeDevice as updateDevice } from '../engines/tunnelSystemsState'
import type { SceneDevice, SystemsState, DeviceSettings } from '../engines/tunnelSystemsState'
import SceneLoading from './SceneLoading.vue'
import SceneOverlayLayer from './SceneOverlayLayer.vue'
import TrafficSignEditor from './TrafficSignEditor.vue'
import { defaultTrafficSigns } from '../engines/trafficSignConfig'
import PortalSignEditor from './PortalSignEditor.vue'
import { defaultPortalSign } from '../engines/portalSignConfig'
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
const container=useTemplateRef<HTMLDivElement>('container')
const overlayLayer=useTemplateRef<InstanceType<typeof SceneOverlayLayer>>('overlayLayer')
const roamingOpen=shallowRef(false),detectionVisible=shallowRef(false),monitor=shallowRef<SceneDevice>()
const roamingState=shallowRef<RoamingState>({playing:false,tube:0,speed:60,distance:-220,length:0})
const wallsVisible=shallowRef(true),canopyVisible=shallowRef(true),selectedDevice=shallowRef<SceneDevice>()
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
const {ready,error,resetView,getHandle}=useEngine(container,element=>createCesiumMap(element,{
  onOverlayPositions:positions=>overlayLayer.value?.updatePositions(positions),
  onProgress:next=>{progress.value=next},onOverlays:items=>{overlays.value=items},
  onTrafficSignEdit:index=>{monitor.value=undefined;roamingOpen.value=false;selectedDevice.value=undefined;trafficSignIndex.value=index;panel.value='traffic'},
  onTrafficSignsConfig:(config,warning)=>{trafficSignsConfig.value=config;trafficSignWarning.value=warning},
  onSignEdit:()=>{monitor.value=undefined;roamingOpen.value=false;selectedDevice.value=undefined;panel.value='sign';nextTick(()=>document.querySelector<HTMLElement>('.sign-editor input')?.focus())},
  onSignConfig:(config,warning)=>{signConfig.value=config;signWarning.value=warning},
  onRoaming:next=>{roamingState.value=next},
  onDeviceSelect:device=>{
    if(panel.value==='devices'||panel.value==='systems'||panel.value==='events'){
      returnPanel.value=panel.value
      panelScrollTop=document.querySelector<HTMLElement>('.scene-panel:not([style*="display: none"])')?.scrollTop??0
    }else if(!selectedDevice.value)returnPanel.value=null
    monitor.value=undefined;roamingOpen.value=false;selectedDevice.value=device;panel.value=null
    nextTick(()=>{const inspector=document.querySelector<HTMLElement>('.device-inspector');if(!inspector?.contains(document.activeElement))inspector?.querySelector<HTMLElement>('.inspector-close')?.focus({preventScroll:true})})
  },
  onDevices:list=>{devices.value=list},onIntro:phase=>{intro.value=phase},shouldSkipIntro:()=>skipRequested.value,
}))
const phases:Record<IntroPhase,string>={earth:'地球视角',region:'区域定位',overview:'线路全览',portal:'抵达洞口',complete:''}
function change(patch:Partial<SystemsState>):void{const next=getHandle()?.setSystems(patch);if(next)state.value=next}
function changeDevice(id:string,patch:DeviceSettings):void{change({devices:updateDevice(state.value,id,patch).devices})}
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
function dismiss():void{closePanel();closeDevice();monitor.value=undefined}
async function applyTrafficSigns(config:TrafficSignsConfig):Promise<void>{await getHandle()?.updateTrafficSigns(config)}
async function applySign(config:PortalSignConfig):Promise<void>{await getHandle()?.updatePortalSign(config)}
const alerts=computed(()=>activeDeviceAlerts(devices.value,state.value,roamingState.value.length))
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
  <section class="viewport" aria-label="GIS 隧道场景" :class="{'is-roaming':roamingOpen,'has-device-alerts':alerts.length>0}" :style="alerts.length?{'--alert-panel-top':`${154+Math.min(150,alerts.length*70)}px`,'--alert-mobile-top':`${170+Math.min(110,alerts.length*62)}px`}:undefined" @keydown.esc="dismiss">
    <div ref="container" class="engine-container" />
    <SceneLoading v-if="!ready" :progress="progress" :error="error" />
    <div v-else-if="intro!=='complete'" class="arrival" aria-live="polite"><span class="arrival-step">{{phases[intro]}}</span><span>{{ready?'镜头正在抵达隧道':'正在加载地形与设备模型'}}</span><button @click="skip">{{skipRequested?'将在加载后直接抵达':'跳过入场'}}</button></div>
    <div class="scene-context"><span class="scene-live-dot" />青山隧道<span>双洞场景</span></div>
    <div class="scene-actions">
      <button :disabled="!ready" :aria-expanded="panel==='devices'" @click="togglePanel('devices',$event)">设备与设施</button>
      <button :disabled="!ready" :aria-expanded="panel==='systems'" @click="togglePanel('systems',$event)">系统控制</button>
      <button :disabled="!ready" :aria-expanded="panel==='events'" @click="togglePanel('events',$event)">事件演练<span v-if="activeEvent" class="event-indicator">进行中</span></button>
      <button :disabled="!ready" @click="replay">重播入场</button>
    </div>
    <aside v-show="panel&&panel!=='events'" class="scene-panel" :aria-label="panel==='devices'?'设备与设施':panel==='sign'?'入口标牌':panel==='traffic'?'洞口交通标志':'系统控制'">
      <header><h2>{{panel==='devices'?'设备与设施':panel==='sign'?'入口标牌':panel==='traffic'?'洞口交通标志':'系统控制'}}</h2><button aria-label="关闭面板" @click="closePanel">×</button></header>
      <div v-show="panel==='devices'"><DeviceExplorer :devices="devices" :state="state" :length="roamingState.length" @focus="focusDevice" /></div>
      <template v-if="panel==='systems'||panel==='sign'||panel==='traffic'"><SystemsControls v-if="panel==='systems'" :state="state" :devices="devices" :device-id="controlDeviceId" :length="roamingState.length" @select-device="controlDeviceId=$event" @locate-device="focusDevice" @device-change="changeDevice" @change="change" @locate-incident="focusIncident" /><PortalSignEditor v-if="panel!=='traffic'" :config="signConfig" :length="roamingState.length" :apply="applySign" :warning="signWarning" @saved="signConfig=$event" /><TrafficSignEditor v-if="panel==='traffic'||panel==='systems'" :config="trafficSignsConfig" :active-index="panel==='traffic'?trafficSignIndex:-1" :warning="trafficSignWarning" :apply="applyTrafficSigns" @saved="trafficSignsConfig=$event" /></template>
    </aside>
    <DeviceAlerts v-if="ready" :alerts="alerts" @focus="focusDevice" />
    <DeviceInspector v-if="selectedDevice" :device="selectedDevice" :state="state" :index="selectedIndex" :total="siblings.length" :length="roamingState.length" :return-label="returnLabel" @back="backToPanel" @close="closeDevice" @locate="focusDevice" @change="changeDevice(selectedDevice.id,$event)" @camera="previewCamera" @next="nextDevice" @edit-vms="editVms" />
    <EventConsole :open="panel==='events'" :state="state" :ready="ready" :devices="devices" :length="roamingState.length" @close="closePanel" @change="change" @locate-incident="focusIncident" @locate-device="focusDevice" />
    <SceneOverlayLayer ref="overlayLayer" :items="overlays" :panel-open="!!panel||!!selectedDevice" @select="focusDevice" />
    <SceneRoaming v-if="roamingOpen" :state="roamingState" @close="roamingOpen=false" @play="playRoaming" @options="getHandle()?.setRoamingOptions($event)" @seek="getHandle()?.seekRoaming($event)" />
    <div v-if="monitor" class="monitor-view" role="status"><div><strong>{{monitor.tube===0?'上行':'下行'}}监控点 · {{monitor.id}}</strong><span>三维模拟视角 · 未接入视频流</span></div><button @click="monitor=undefined;view(()=>getHandle()?.focusPortal())">退出预览</button></div>
    <div v-if="devices.some(d=>d.kind==='speaker'&&deviceEnabled(d,state))" class="broadcast-state" role="status">应急广播中 · {{['fire','smoke','collision'].includes(state.incident)?'请按指示前往就近横洞':'广播状态本地演示'}}（静音演示）</div>
    <div class="viewport-tools">
      <span>场景导航</span>
      <button :disabled="!ready" :aria-pressed="underground" @click="underground=!underground;getHandle()?.setUnderground(underground)">{{underground?'恢复山体':'地下结构'}}</button>
      <button :disabled="!ready" :aria-pressed="canopyVisible" @click="canopyVisible=!canopyVisible;getHandle()?.setCanopyVisible(canopyVisible)">遮雨棚：{{canopyVisible?'开':'关'}}</button>
      <button :disabled="!ready" :aria-pressed="wallsVisible" @click="wallsVisible=!wallsVisible;getHandle()?.setWallsVisible(wallsVisible)">隧道墙体：{{wallsVisible?'开':'关'}}</button>
      <button :disabled="!ready" @click="view(()=>getHandle()?.focusPortal(0))">西洞口</button>
      <button :disabled="!ready" @click="view(()=>getHandle()?.focusPortal(1))">东洞口</button>
      <button :disabled="!ready" @click="view(()=>getHandle()?.focusSubstation())">变电所</button>
      <button :disabled="!ready" @click="view(()=>getHandle()?.focusInterior())">洞内</button>
      <button :disabled="!ready" @click="view(()=>getHandle()?.focusInterior(true))">横洞</button>
      <button :disabled="!ready" @click="view(()=>getHandle()?.focusLayBy())">停车带</button>
      <button :disabled="!ready" :aria-pressed="detectionVisible" @click="detectionVisible=!detectionVisible;getHandle()?.setDetectionVisible(detectionVisible)">检测范围：{{detectionVisible?'开':'关'}}</button>
      <button :disabled="!ready" :aria-pressed="roamingOpen" @click="openRoaming">巡检漫游</button>
      <button :disabled="!ready" @click="view(resetView)">全览</button>
    </div>
    <div class="scene-help">点选设备查看详情 · 左键平移 · 滚轮缩放 · 中键倾斜</div>
  </section>
</template>
