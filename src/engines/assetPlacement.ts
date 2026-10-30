import { boreLength, laneLateral } from './projectConfig.ts'
import type { AssetRecord, BoreConfig, TunnelProject } from './projectConfig.ts'

export type Mount = { kind:'lane'|'wall'|'edge'|'ceiling'|'site'|'unresolved'; side?:-1|1; laneId?:string; offset:number }
export type FacilityLink = { targetBoreId:string; targetChainage:number; memberIds:string[] }
export const roadHalfWidth=(b:BoreConfig)=>b.lanes.length*b.laneWidth/2
export const wallOffset=(b:BoreConfig)=>roadHalfWidth(b)+.96
export function mountBase(m:Mount,b:BoreConfig):number {
  if(m.kind==='lane')return laneLateral(b,Math.max(0,b.lanes.findIndex(l=>l.id===m.laneId)))
  if(m.kind==='wall')return (m.side??1)*wallOffset(b)
  if(m.kind==='edge')return (m.side??1)*roadHalfWidth(b)
  return 0
}
export function resolveAsset(a:AssetRecord,p:TunnelProject):AssetRecord {
  const b=p.bores.find(b=>b.id===a.boreId)
  return b&&a.mount?{...a,lateral:mountBase(a.mount,b)+a.mount.offset}:a
}
export function moveAsset(a:AssetRecord,patch:Partial<AssetRecord>,p:TunnelProject):AssetRecord {
  const next={...a,...patch},b=p.bores.find(b=>b.id===next.boreId)
  if(next.mount&&b&&patch.lateral!==undefined)next.mount={...next.mount,offset:patch.lateral-mountBase(next.mount,b)}
  return next
}
export function inferMount(a:AssetRecord,b:BoreConfig,known:boolean):Mount {
  const side:1|-1=a.lateral<0?-1:1
  let mount:Mount={kind:known?'site':'unresolved',offset:0}
  if(known){
    if(a.kind==='lane')mount={kind:'lane',laneId:b.lanes.reduce((best,l,i)=>Math.abs(laneLateral(b,i)-a.lateral)<Math.abs(laneLateral(b,b.lanes.indexOf(best))-a.lateral)?l:best,b.lanes[0]!).id,offset:0}
    else if(['camera','cabinet','manual','flame','speaker','telephone','distribution','escape','plc','covi','no2','wind','humidity','fbg','shutter','basic','layby'].includes(a.kind))mount={kind:'wall',side,offset:0}
    else if(a.kind==='street')mount={kind:'edge',side,offset:0}
    else if(['enhanced','fan','detector'].includes(a.kind))mount={kind:'ceiling',offset:0}
  }
  mount.offset=a.lateral-mountBase(mount,b)
  return mount
}
export function upgradeProject(input:TunnelProject):TunnelProject {
  const p=structuredClone(input)
  if(p.version===2)return p
  p.version=2
  for(const a of p.assets){const b=p.bores.find(b=>b.id===a.boreId);if(b&&!a.mount)a.mount=inferMount(a,b,/^[a-z]+-\d+$/.test(a.id)&&a.code===a.id)}
  for(const a of p.assets.filter(a=>['pedestrian','vehicle'].includes(a.kind))){
    const b=p.bores.find(b=>b.id===a.boreId)!,other=p.bores.find(b=>b.id!==a.boreId)
    if(!other)continue
    const station=(a.chainage-b.start)*Math.sign(b.end-b.start)
    a.link={targetBoreId:other.id,targetChainage:other.start+station*Math.sign(other.end-other.start),memberIds:p.assets.filter(d=>d.kind==='shutter'&&Math.abs((d.chainage-p.bores.find(b=>b.id===d.boreId)!.start)*Math.sign(p.bores.find(b=>b.id===d.boreId)!.end-p.bores.find(b=>b.id===d.boreId)!.start)-station)<.1).map(d=>d.id)}
  }
  return p
}
export function placementErrors(p:TunnelProject):string[]{
  const errors:string[]=[]
  for(const a of p.assets){
    if(!a||typeof a!=='object')continue
    const b=p.bores.find(b=>b.id===a.boreId);if(!b)continue
    if(a.mount){
      if(!['lane','wall','edge','ceiling','site','unresolved'].includes(a.mount.kind)||!Number.isFinite(a.mount.offset))errors.push(`${a.code}：安装参照无效`)
      if(['wall','edge'].includes(a.mount.kind)&&a.mount.side!==-1&&a.mount.side!==1)errors.push(`${a.code}：请选择左侧或右侧安装参照`)
      if(a.mount.kind==='lane'&&(!Array.isArray(b.lanes)||!b.lanes.some(l=>l?.id===a.mount!.laneId)))errors.push(`${a.code}：所属车道已删除，请重新指定车道或删除设备`)
    }
    if(p.version===2&&['pedestrian','vehicle'].includes(a.kind)&&!a.link)errors.push(`${a.code}：请指定横洞连接的洞筒与桩号`)
    if(a.link&&!Array.isArray(a.link.memberIds))errors.push(`${a.code}：横洞关联设备列表无效`)
    if(a.link&&Array.isArray(a.link.memberIds))for(const id of a.link.memberIds)if(!p.assets.some(d=>d?.id===id&&d.kind==='shutter'&&(d.boreId===a.boreId||d.boreId===a.link!.targetBoreId)))errors.push(`${a.code}：关联门不存在或不属于横洞两端`)
    if(a.link){const target=p.bores.find(b=>b.id===a.link!.targetBoreId);if(!target||target.id===b.id)errors.push(`${a.code}：横洞目标洞筒不存在`);else if(!Number.isFinite(a.link.targetChainage)||(a.link.targetChainage-target.start)*Math.sign(target.end-target.start)<0||(a.link.targetChainage-target.start)*Math.sign(target.end-target.start)>boreLength(target))errors.push(`${a.code}：横洞另一端桩号越界`)}
  }
  const passages=p.assets.filter(a=>a?.link)
  for(const a of passages){const b=p.bores.find(b=>b.id===a.boreId);if(!b)continue;const station=(a.chainage-b.start)*Math.sign(b.end-b.start),half=a.kind==='vehicle'?5:2;if(station<half||station>boreLength(b)-half)errors.push(`${a.code}：横洞开口不得超出洞筒`);if(passages.some(other=>other.id!==a.id&&other.boreId===a.boreId&&Math.abs(other.chainage-a.chainage)<half+(other.kind==='vehicle'?5:2)+1))errors.push(`${a.code}：横洞开口与其他横洞冲突`)}
  for(const b of p.bores){
    const openings=passages.flatMap(a=>a.boreId===b.id?[{a,chainage:a.chainage}]:a.link?.targetBoreId===b.id?[{a,chainage:a.link.targetChainage}]:[])
    for(const {a,chainage} of openings){const half=a.kind==='vehicle'?5:2,station=(chainage-b.start)*Math.sign(b.end-b.start);if(station<half||station>boreLength(b)-half)errors.push(`${a.code}：${b.name} 的横洞开口越界`);if(openings.some(o=>o.a.id!==a.id&&Math.abs(o.chainage-chainage)<half+(o.a.kind==='vehicle'?5:2)+1))errors.push(`${a.code}：${b.name} 的横洞开口冲突`)}
    const bays=p.assets.filter(a=>a?.kind==='layby'&&a.boreId===b.id)
    for(const a of bays){const station=(a.chainage-b.start)*Math.sign(b.end-b.start);if(station<80||station>boreLength(b)-80)errors.push(`${a.code}：停车带须与洞口保持至少 80 m 距离`)}
    if(bays.length>1)errors.push(`${b.name}：当前断面只支持一处停车带，请保留一处后保存`)
  }
  return errors
}

export function facilityProject(project:TunnelProject,asset:AssetRecord):TunnelProject {
  const next=structuredClone(project),old=project.assets.find(a=>a.id===asset.id)!,b=project.bores.find(b=>b.id===asset.boreId)!,shift=(asset.chainage-old.chainage)*Math.sign(b.end-b.start)
  next.assets=next.assets.map(a=>a.id===asset.id?asset:a)
  if(asset.link){const other=project.bores.find(b=>b.id===asset.link!.targetBoreId)!;asset.link={...asset.link,targetChainage:old.link!.targetChainage+shift*Math.sign(other.end-other.start)};for(const id of asset.link.memberIds){const member=next.assets.find(a=>a.id===id);if(member){const bore=next.bores.find(b=>b.id===member.boreId)!;member.chainage+=shift*Math.sign(bore.end-bore.start)}}}
  return next
}
