import type { TunnelSurvey } from '../types/tunnel'
import { crossPassages } from './tunnelSystemsState'
import { layBy } from './tunnelLayout'
import { assetStation } from './projectConfig'

export function layoutPassages(s:TunnelSurvey,tube=0){
  if(!s.project)return s.tubes.length>1?crossPassages(s.length).map(p=>({...p,assetId:undefined as string|undefined})):[]
  const bore=s.project.bores[tube]!
  return s.project.assets.filter(a=>['pedestrian','vehicle'].includes(a.kind)&&a.link&&(a.boreId===bore.id||a.link.targetBoreId===bore.id)).map(a=>{
    const template=crossPassages(s.length).find(p=>p.vehicle===(a.kind==='vehicle'))!
    return {...template,station:a.boreId===bore.id?assetStation(a,bore):assetStation({...a,chainage:a.link!.targetChainage},bore),assetId:a.id}
  })
}
export function projectLayBy(s:TunnelSurvey,tube:number){
  const base=layBy(s.length,tube),b=s.project?.bores[tube],a=b&&s.project?.assets.find(a=>a.kind==='layby'&&a.boreId===b.id)
  if(!a||!b)return s.project?{...base,width:0}:base
  const station=assetStation(a,b),shift=station-(tube===0?base.start-4:base.end+4)
  return {center:base.center+shift,start:base.start+shift,flatStart:base.flatStart+shift,flatEnd:base.flatEnd+shift,end:base.end+shift,width:base.width}
}
export function projectLayByWidth(station:number,s:TunnelSurvey,tube:number){const b=projectLayBy(s,tube),t=Math.max(0,Math.min((station-b.start)/12,(b.end-station)/12,1));return b.width*t*t*(3-2*t)}
export function projectStations(s:TunnelSurvey,tube:number){const b=projectLayBy(s,tube),stations=[-60,s.length+60,b.start,b.flatStart,b.flatEnd,b.end];for(let x=-60;x<s.length+60;x+=2)stations.push(x);for(const start of [b.start,b.flatEnd])for(let x=start;x<=start+12;x+=.5)stations.push(x);for(const p of layoutPassages(s,tube))for(let i=0;i<=40;i++)stations.push(p.station-p.halfWidth+2*p.halfWidth*i/40);return [...new Set(stations)].sort((a,b)=>a-b)}
