import type { Cartesian3 } from 'cesium'
import { defaultVmsDisplay } from './vmsDisplay.ts'
import type { VmsDisplay } from './vmsDisplay.ts'
export const incidentCatalog = [
  {kind:'parking',name:'违停事件',detail:'车辆停靠行车道，后方车辆减速避让',closed:false,car:true},
  {kind:'congestion',name:'拥堵事件',detail:'事发洞车流低速排队，对向洞保持通行',closed:false,car:false},
  {kind:'rock',name:'落石事件',detail:'洞口落石占道，事发洞入口禁行',closed:true,car:false},
  {kind:'debris',name:'抛洒物事件',detail:'路面散落物占道，事发洞入口禁行',closed:true,car:false},
  {kind:'construction',name:'施工事件',detail:'锥桶、围挡及作业人员布设，入口禁行',closed:true,car:true},
  {kind:'emergency',name:'应急车道事件',detail:'车辆占用紧急停车带，主车道减速通行',closed:false,car:true},
  {kind:'line',name:'压线事件',detail:'车辆跨越车道线，后方车辆减速',closed:false,car:true},
  {kind:'fire',name:'火灾事件',detail:'火焰与烟雾、风机、水泵、广播及疏散指示联动',closed:true,car:true},
  {kind:'smoke',name:'烟雾事件',detail:'洞内烟雾，通风与广播联动，入口禁行',closed:true,car:false},
  {kind:'pedestrian',name:'行人事件',detail:'行人进入行车道，事发洞入口禁行',closed:true,car:false},
  {kind:'vehicle',name:'车辆事件',detail:'车辆实例与侧向结构查看，保持正常车流',closed:false,car:true},
  {kind:'collision',name:'碰撞事故',detail:'事故车辆阻断通行，事发洞入口禁行',closed:true,car:true},
] as const
export type IncidentKind = typeof incidentCatalog[number]['kind']
export function incidentDefinition(kind: SystemsState['incident']) {
  return incidentCatalog.find(item=>item.kind===kind)
}
export function incidentStation(length:number,state:SystemsState):number {
  if(state.incident==='rock')return state.incidentTube===0?-40:length+40
  if(state.incident==='emergency')return length*(state.incidentTube===0?.32:.68)
  return length*.5+(state.incidentTube===0?80:-80)
}
export function entranceSignal(tube:number,state:SystemsState):SystemsState['entrance'] {
  if(state.incident!=='none' && tube===state.incidentTube) {
    if(incidentDefinition(state.incident)?.closed)return 'red'
    if(state.incident!=='vehicle')return 'yellow'
  }
  return state.devices[`signal-${tube+1}`]?.entrance??state.entrance
}
export function trafficSpeedFactor(tube:number,state:SystemsState):number {
  if(tube===state.incidentTube && state.incident==='congestion')return .16
  return entranceSignal(tube,state)==='yellow'?.5:1
}
// Preset incident readings are local demonstrations, not a sensor or fire simulation.
export function incidentTelemetry(device:SceneDevice,state:SystemsState,length:number) {
  if(state.incident==='none'||device.tube!==state.incidentTube)return undefined
  const distance=Math.abs(device.station-incidentStation(length,state))
  const fire=state.incident==='fire'&&distance<=120
  const smoke=['fire','smoke'].includes(state.incident)&&distance<=220
  const note='本地演练预设读数，非现场监测；解除演练后恢复正常'
  if(device.kind==='layby'&&state.incident==='emergency')return {status:'车辆占用',value:'占用',severity:'warning',note}
  if(fire) {
    if(device.kind==='fbg')return {status:'温度超限',value:'68.0 °C',severity:'alarm',note}
    if(device.kind==='humidity')return {status:'高温告警',value:'58.0 °C / 38 %RH',severity:'alarm',note}
    if(device.kind==='flame')return {status:'火情告警',value:'火情触发',severity:'alarm',note}
  }
  if(smoke&&device.kind==='covi')return state.incident==='fire'
    ?{status:'烟气告警',value:'85 ppm / 0.080 m⁻¹',severity:'alarm',note}
    :{status:'能见度异常',value:'12 ppm / 0.060 m⁻¹',severity:'warning',note}
  if(device.kind==='detector') {
    if(state.incident==='congestion')return {status:'拥堵低速',value:`${Math.round(56*trafficSpeedFactor(device.tube,state))} km/h`,severity:'warning',note}
    if(distance<=120&&incidentDefinition(state.incident)?.closed)return {status:'占道告警',value:'通行受阻',severity:'warning',note}
  }
  return undefined
}
export function trafficStopStations(tube:number,lane:number,length:number,state:SystemsState):number[] {
  const stops:number[]=[],direction=tube===0?1:-1
  if(tube===state.incidentTube) {
    if(incidentDefinition(state.incident)?.closed)stops.push(incidentStation(length,state)-direction*40)
    else if(state.incident==='congestion')stops.push(incidentStation(length,state)-direction*50)
    else if(state.incident==='line'||(state.incident==='parking'&&lane===0))stops.push(incidentStation(length,state)-direction*18)
  }
  if(entranceSignal(tube,state)==='red')stops.push(tube===0?-86:length+86)
  return stops
}
export function informationMessage(tube:number,state:SystemsState):string {
  if(state.incident==='none'||tube!==state.incidentTube)return state.message
  if(state.incident==='fire')return '前方火情  就近横洞撤离'
  if(state.incident==='smoke')return '前方烟雾  减速撤离'
  return `${incidentDefinition(state.incident)?.name ?? '前方异常'}  ${incidentDefinition(state.incident)?.closed?'禁止驶入':'减速慢行'}`
}

export interface DeviceSettings {
  alarm?: 'none' | 'environment' | 'fan' | 'camera'
  enabled?: boolean
  message?: string
  vms?: Partial<VmsDisplay>
  entrance?: 'green' | 'yellow' | 'red'
  lane?: 'down' | 'left' | 'cross'
}
export interface SystemsState {
  devices: Record<string,DeviceSettings>

  deviceAlarm: 'none' | 'environment' | 'fan' | 'camera'
  environment: 'day' | 'night' | 'fog'
  plc: 'auto' | 'manual'
  basic: 'alternating' | 'all' | 'off'
  enhanced: boolean
  street: boolean
  incident: 'none' | IncidentKind
  incidentTube: 0 | 1
  fans: boolean
  pumps: boolean
  shuttersOpen: boolean
  broadcast: boolean
  entrance: 'green' | 'yellow' | 'red'
  message: string
  vms: VmsDisplay
}
export const initialSystems: SystemsState = {
  devices:{}, deviceAlarm: 'none', environment: 'day', plc: 'auto', basic: 'alternating', enhanced: true, street: false,
  incident: 'none', incidentTube: 0, fans: false, pumps: false, shuttersOpen: true, broadcast: false,
  vms: {...defaultVmsDisplay}, entrance: 'green', message: '保持车距  注意安全',
}
export function changeSystems(current: SystemsState, patch: Partial<SystemsState>): SystemsState {
  const next = { ...current, ...patch }
  if (next.plc === 'auto') {
    next.basic = next.environment === 'day' ? 'alternating' : 'all'
    next.enhanced = next.environment !== 'night'
    next.street = next.environment !== 'day'
  }
  if (patch.incident !== undefined) {
    next.fans = ['fire','smoke'].includes(patch.incident) || patch.incident==='collision'
    next.pumps = patch.incident === 'fire'
    next.shuttersOpen = true
    next.broadcast = ['fire','smoke','collision'].includes(patch.incident)
    if(patch.incident==='none')next.entrance='green'
  }
  return next
}
export function basicLampOn(station: number, state: SystemsState): boolean {
  return state.basic === 'all' || (state.basic === 'alternating' && Math.round((station + 50) / 8) % 2 === 0)
}
export function enhancedZone(station: number, length: number): boolean {
  return (station >= -60 && station <= -10) || (station >= length + 10 && station <= length + 60)
}
export function illuminationAt(station: number, length: number, state: SystemsState, tube=0): number {
  if(station < -60 || station > length+60)return state.environment==='day'?.82:state.street?.3:.025
  const spill = Math.exp(-Math.max(0, Math.min(station + 60, length + 60 - station)) / 19)
  let basic = state.basic === 'off' ? 0 : state.basic === 'all' ? .64 : .43
  let enhanced = state.enhanced && enhancedZone(station, length) ? .35 : 0
  for(const side of [-1,1]) {
    const nearest=-50+Math.round((station+50)/8)*8
    for(const offset of [-8,0,8]) {
      const s=nearest+offset;if(s< -50||s>=length+60)continue
      const setting=state.devices[lightDeviceId('basic',tube,s,side,length)]?.enabled
      if(setting!==undefined)basic+=(Number(setting)-Number(basicLampOn(s,state)))*.2*Math.exp(-((station-s)**2)/32)
    }
    for(const start of [-58,length+12]) {
      const s=start+Math.round((station-start)/4)*4;if(s<start||s>start+46)continue
      const setting=state.devices[lightDeviceId('enhanced',tube,s,side,length)]?.enabled
      if(setting!==undefined)enhanced+=(Number(setting)-Number(state.enhanced))*.175*Math.exp(-((station-s)**2)/18)
    }
  }
  basic=Math.max(0,basic);enhanced=Math.max(0,enhanced)
  return Math.min(1, .012 + basic + enhanced + spill * (state.environment === 'day' ? .7 : .06))
}
export function crossPassages(length: number) {
  return [0.25, 0.5, 0.75].map((ratio, index) => ({ station: length * ratio,
    archRise: index === 1 ? 1.2 : .8, vehicle: index === 1, halfWidth: index === 1 ? 3.5 : 2, height: index === 1 ? 4.8 : 2.85 }))
}
export function radarHeading(tube:number):number { return (tube===0?0:Math.PI)-Math.PI/2 }
export function escapeSignDirection(station:number,tube:number,length:number):'left'|'right' {
  const nearest=crossPassages(length).reduce((a,b)=>Math.abs(a.station-station)<=Math.abs(b.station-station)?a:b)
  return (nearest.station-station)*(tube===0?1:-1)>=0?'left':'right'
}
export function laneSignal(station: number, tube: number, length: number, state: SystemsState, reverse = false): 'down' | 'left' | 'cross' {
  if (reverse) return 'cross'
  if (!incidentDefinition(state.incident)?.closed || tube !== state.incidentTube) return 'down'
  return ['fire','smoke','collision'].includes(state.incident) && crossPassages(length).some(p => Math.abs(p.station - station) <= 80) ? 'left' : 'cross'
}
export const deviceCatalog = [
  ['traffic','camera','监控摄像机'], ['fire','cabinet','消火栓箱'],
  ['traffic', 'lane', '双面车道指示器'], ['traffic','signal','入口交通信号灯'], ['traffic','vms','悬挂情报板'], ['traffic','detector','车辆检测器'],
  ['lighting','basic','基本照明'], ['lighting','enhanced','加强照明'], ['lighting','street','洞外路灯'], ['lighting','plc','PLC 控制柜'],
  ['ventilation','fan','射流风机'], ['communication','speaker','应急广播'], ['communication','telephone','紧急电话'], ['communication','escape','安全出口标志'],
  ['fire','pump','消防水泵'], ['fire','tank','消防水箱'], ['fire','flame','红外火焰探测器'], ['fire','manual','火灾手报'], ['fire','shutter','横洞卷帘门'],
  ['environment','covi','CO / VI 监测器'], ['environment','no2','二氧化氮监测器'], ['environment','wind','风向风速传感器'], ['environment','fbg','感温光栅'], ['environment','humidity','温湿度监测器'],
  ['facility','pedestrian','人行横洞'], ['facility','vehicle','车行横洞'], ['facility','layby','紧急停车带'], ['facility','distribution','洞内变电箱'], ['facility','substation','洞口变电所'],
] as const
export type DeviceKind = typeof deviceCatalog[number][1]
export interface SceneDevice { id: string; kind: DeviceKind; tube: number; station: number; lateral: number; height: number; position?: Cartesian3; portalEnd?: 0 | 1; pickId?: string }
export const categoryNames: Record<string,string> = { traffic: '交通', lighting: '照明', ventilation: '通风', communication: '通信', fire: '消防', environment: '环境检测', facility: '设施' }

// Global fields are defaults for the initial scene and explicit simulation policies only.
// Device operations always write a single ID and preserve every other record.
export function changeDevice(state:SystemsState,id:string,patch:DeviceSettings):SystemsState {
  const previous=state.devices[id]??{}
  return {...state,devices:{...state.devices,[id]:{...previous,...patch,...(patch.vms?{vms:{...previous.vms,...patch.vms}}:{})}}}
}
export function deviceEnabled(device:SceneDevice,state:SystemsState):boolean {
  const explicit=state.devices[device.id]?.enabled
  if(explicit!==undefined)return explicit
  const affected=state.incident!=='none'&&device.tube===state.incidentTube
  switch(device.kind) {
    case 'fan':return state.incident==='none'?state.fans:affected&&['fire','smoke','collision'].includes(state.incident)
    case 'speaker':return state.incident==='none'?state.broadcast:affected&&['fire','smoke','collision'].includes(state.incident)
    case 'pump':return state.pumps
    case 'shutter':return state.shuttersOpen
    case 'basic':return basicLampOn(device.station,state)
    case 'enhanced':return state.enhanced
    case 'street':return state.street
    case 'vms':return state.devices[device.id]?.vms?.enabled??state.vms.enabled
    default:return true
  }
}
export function deviceVms(device:SceneDevice,state:SystemsState):VmsDisplay {
  return {...state.vms,...state.devices[device.id]?.vms,enabled:deviceEnabled(device,state)}
}
export function deviceMessage(device:SceneDevice,state:SystemsState):string {
  if(state.incident!=='none'&&device.tube===state.incidentTube)return informationMessage(device.tube,state)
  return state.devices[device.id]?.message??state.message
}
export function deviceEntrance(device:SceneDevice,state:SystemsState):SystemsState['entrance'] {
  return entranceSignal(device.tube,state)
}
export function deviceLane(device:SceneDevice,length:number,state:SystemsState):'down'|'left'|'cross' {
  if(state.incident!=='none'&&device.tube===state.incidentTube)return laneSignal(device.station,device.tube,length,state)
  return state.devices[device.id]?.lane??laneSignal(device.station,device.tube,length,state)
}
export function lightDeviceId(kind:'basic'|'enhanced',tube:number,station:number,lateral:number,length:number):string {
  const side=lateral>0?2:1
  if(kind==='basic')return `basic-${tube*Math.ceil((length+110)/8)*2+Math.round((station+50)/8)*2+side}`
  const far=station>=length+10
  return `enhanced-${tube*48+(far?24:0)+Math.round((station-(far?length+12:-58))/4)*2+side}`
}

export function passageShuttersOpen(index:number,state:SystemsState):boolean {
  return (state.devices[`shutter-${index+1}`]?.enabled??state.shuttersOpen)&&(state.devices[`shutter-${index+4}`]?.enabled??state.shuttersOpen)
}

export function deviceAlarm(id:string,state:SystemsState):SystemsState['deviceAlarm'] {
  const explicit=state.devices[id]?.alarm
  if(explicit!==undefined)return explicit
  const target=state.deviceAlarm==='environment'?'covi-1':`${state.deviceAlarm}-1`
  return id===target?state.deviceAlarm:'none'
}
export function deviceAlarmIds(state:SystemsState):string[] {
  const target=state.deviceAlarm==='environment'?'covi-1':`${state.deviceAlarm}-1`
  return [...new Set([...Object.keys(state.devices),target])].filter(id=>deviceAlarm(id,state)!=='none')
}
