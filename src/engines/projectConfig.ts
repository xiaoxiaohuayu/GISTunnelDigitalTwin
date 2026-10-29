import { deviceCatalog } from './tunnelSystemsState.ts'
import type { DeviceKind, SceneDevice } from './tunnelSystemsState.ts'

export interface BoreConfig { id:string;name:string;start:number;end:number;offset:number;laneWidth:number;lanes:{id:string;direction:1|-1}[] }
export interface AssetRecord { id:string;code:string;name:string;kind:DeviceKind;boreId:string;chainage:number;endChainage?:number;lateral:number;height:number;heading:number }
export interface TunnelProject { version:1;id:string;name:string;origin:{longitude:number;latitude:number;elevation:number;heading:number;grade:number};bores:BoreConfig[];assets:AssetRecord[] }
export function defaultProject():TunnelProject {
  return {version:1,id:'tunnel-project',name:'青山隧道',origin:{longitude:103.56,latitude:30.91,elevation:700,heading:90,grade:0},bores:[0,1].map(i=>({id:`bore-${i+1}`,name:i===0?'上行洞':'下行洞',start:0,end:1900,offset:i===0?-12:12,laneWidth:3.5,lanes:[0,1].map(j=>({id:`lane-${i+1}-${j+1}`,direction:i===0?1:-1}))})),assets:[]}
}
export function parseChainage(text:string):number {
  const match=text.trim().match(/^(?:[A-Za-z]*K)?(-?\d+)(?:\+(\d{1,3}(?:\.\d+)?))?$/i)
  if(!match)throw new Error(`桩号格式不正确：${text}，例如 K10+320`)
  return match[2]===undefined?Number(match[1]):Number(match[1])*1000+Number(match[2])
}
export function formatChainage(value:number):string {
  const rounded=Math.round(value*1000)/1000
  if(rounded<0)return String(rounded)
  const km=Math.floor(rounded/1000),metres=+(rounded-km*1000).toFixed(3),[whole,fraction]=String(metres).split('.')
  return `K${km}+${whole!.padStart(3,'0')}${fraction?`.${fraction}`:''}`
}
export const boreLength=(bore:BoreConfig)=>Math.abs(bore.end-bore.start)
export const assetStation=(asset:AssetRecord,bore:BoreConfig)=>(asset.chainage-bore.start)*Math.sign(bore.end-bore.start)
export const laneLateral=(bore:BoreConfig,index:number)=>(index-(bore.lanes.length-1)/2)*bore.laneWidth
export const assetMountOffset=(kind:DeviceKind):number=>({lane:5.85,vms:5.85,street:7.812475,camera:.35,pump:.6,tank:1.6,substation:2.26} as Partial<Record<DeviceKind,number>>)[kind]??0
export function projectErrors(value:unknown):string[] {
  if(!value||typeof value!=='object')return ['配置必须是 JSON 对象']
  const p=value as TunnelProject,errors:string[]=[]
  if(p.version!==1)return ['不支持的配置版本']
  if(typeof p.id!=='string'||!p.id||typeof p.name!=='string'||!p.name.trim())errors.push('请填写隧道名称和项目 ID')
  const o=p.origin
  if(!o||![o.longitude,o.latitude,o.elevation,o.heading,o.grade].every(Number.isFinite)||Math.abs(o.longitude)>180||Math.abs(o.latitude)>85||o.elevation< -500||o.elevation>9000||o.heading<0||o.heading>360||Math.abs(o.grade)>15)errors.push('请检查入口经纬度、高程（-500～9000 m）、方位（0～360°）和纵坡')
  if(!Array.isArray(p.bores)||p.bores.length<1||p.bores.length>2||p.bores.some(b=>!b||typeof b!=='object'))return [...errors,'请选择单洞或双洞']
  const boreIds=new Set<string>()
  for(const b of p.bores){
    if(!b||typeof b.id!=='string'||!b.id||boreIds.has(b.id)){errors.push('洞筒 ID 不能为空或重复');continue}
    boreIds.add(b.id)
    if(typeof b.name!=='string'||!b.name.trim())errors.push('请填写洞筒名称')
    if(![b.start,b.end,b.offset,b.laneWidth].every(Number.isFinite)||Math.abs(b.offset)>1000||boreLength(b)<10||boreLength(b)>20000||b.laneWidth<2.5||b.laneWidth>4.5)errors.push(`${b.name}：长度须为 10～20000 m，车道宽度须为 2.5～4.5 m，洞筒偏移须在 ±1000 m 内`)
    if(!Array.isArray(b.lanes)||b.lanes.length<1||b.lanes.length>6||b.lanes.some(l=>!l||typeof l.id!=='string'||![1,-1].includes(l.direction))||new Set(b.lanes.map(l=>l.id)).size!==b.lanes.length)errors.push(`${b.name}：车道须为 1～6 条，且每条车道有独立编号和方向`)
  }
  if(!Array.isArray(p.assets))return [...errors,'设备台账必须是数组']
  if(p.assets.length>5000)errors.push('单个项目最多录入 5000 条设备或设施')
  const ids=new Set<string>(),codes=new Set<string>()
  for(const a of p.assets){
    if(!a||typeof a.id!=='string'||!a.id||!/^[A-Za-z0-9_.-]{1,128}$/.test(a.id)||ids.has(a.id)){errors.push('设备 ID 不能为空或重复');continue}
    ids.add(a.id)
    if(typeof a.code!=='string'||!a.code.trim()||a.code.length>80||codes.has(a.code))errors.push(`设备编号为空或重复：${a.code??''}`)
    codes.add(a.code)
    if(typeof a.name!=='string'||!a.name.trim()||a.name.length>120||!deviceCatalog.some(d=>d[1]===a.kind))errors.push(`${a.code}：名称或设备类型不正确`)
    const b=p.bores.find(b=>b.id===a.boreId)
    if(!b){errors.push(`${a.code}：所属洞筒不存在`);continue}
    if(![a.chainage,a.lateral,a.height,a.heading].every(Number.isFinite)||Math.abs(a.lateral)>50||a.height< -10||a.height>30||Math.abs(a.heading)>360)errors.push(`${a.code}：请检查桩号、偏移（±50 m）、高度（-10～30 m）和朝向（±360°）`)
    if(assetStation(a,b)<-240||assetStation(a,b)>boreLength(b)+240)errors.push(`${a.code}：桩号超出 ${b.name} 的起止范围`)
    if(a.endChainage!==undefined&&(!Number.isFinite(a.endChainage)||a.endChainage<Math.min(b.start,b.end)||a.endChainage>Math.max(b.start,b.end)))errors.push(`${a.code}：设施结束桩号超出洞筒范围`)
  }
  if(p.bores.length===2&&p.bores.every(b=>Number.isFinite(b.offset)&&Array.isArray(b.lanes))){
    const [a,b]=p.bores as [BoreConfig,BoreConfig]
    if(Math.abs(a.offset-b.offset)<(a.lanes.length*a.laneWidth+b.lanes.length*b.laneWidth)/2+2)errors.push('两个洞筒间距不足，请调整横向偏移')
  }
  return errors
}
export function sceneAsset(asset:AssetRecord,project:TunnelProject):SceneDevice {
  const tube=project.bores.findIndex(b=>b.id===asset.boreId),bore=project.bores[tube]!
  return {id:asset.id,kind:asset.kind,tube,station:assetStation(asset,bore),lateral:asset.lateral,height:asset.height,name:asset.name,code:asset.code,boreName:bore.name,chainage:formatChainage(asset.chainage),heading:asset.heading,boreLength:boreLength(bore)}
}
export function seedAssets(devices:SceneDevice[],project:TunnelProject):AssetRecord[] {
  return devices.filter(d=>project.bores[d.tube]&&d.station>=-240&&d.station<=boreLength(project.bores[d.tube]!)+240).map(d=>{
    const bore=project.bores[d.tube]!
    return {id:d.id,code:d.id,name:deviceCatalog.find(row=>row[1]===d.kind)?.[2]??d.kind,kind:d.kind,boreId:bore.id,chainage:bore.start+d.station,lateral:d.lateral,height:d.height+(d.position?0:assetMountOffset(d.kind)),heading:d.tube===0?0:180}
  })
}
