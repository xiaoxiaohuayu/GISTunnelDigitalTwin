import { sceneResources } from './sceneResources'
import { boreLength } from './projectConfig'
import { boreIndices } from './projectSurvey'
// @env browser
import {
  Cartesian2, ClippingPolygonCollection, Color, CornerType,
} from 'cesium'
import type { Viewer } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import { addTunnelInterior } from './tunnelInterior'
import { addPortalSite } from './portalSite'
import { addTunnelDetails, tunnelPoint } from './tunnelDetails'

function createBore(viewer:Viewer,survey:TunnelSurvey) {
  const scope=sceneResources(viewer)
  const canopies: import('cesium').Entity[]=[]
  // Match both portal openings in build-portal-site.py: radius 5.53 m, spring line 2.5 m.
  const canopyRadius=5.53,springHeight=2.5
  for(const end of [0,1]) for(const tube of boreIndices(survey)) {
    const stationAt=(station:number)=>end===0?station:survey.length-station
    const radius=canopyRadius+((survey.project?.bores[tube]?.lanes.length??2)*(survey.project?.bores[tube]?.laneWidth??4.3)/2-4.3)
    const roof:Cartesian2[]=[]
    for(const [r,reverse] of [[canopyRadius,false],[canopyRadius-.08,true]] as const)for(let i=0;i<=40;i++) {
      const a=Math.PI*(.1+.8*(reverse?1-i/40:i/40));roof.push(new Cartesian2(r*Math.cos(a)*radius/canopyRadius,springHeight+r*Math.sin(a)))
    }
    // PolylineVolume rebases shape.y to its minimum; preserve the roof elevation explicitly.
    const roofBase=Math.min(...roof.map(point=>point.y))
    canopies.push(viewer.entities.add({name:'洞口遮雨棚',polylineVolume:{positions:[-82,-61].map(s=>tunnelPoint(survey,tube,stationAt(s),0,roofBase)),
      shape:roof,cornerType:CornerType.MITERED,material:Color.fromCssColorString('#b8cedb').withAlpha(.45)}}))
    for(const station of [-82,-75,-68,-61]) {
      const arch=[new Cartesian2(radius,0),new Cartesian2(radius,springHeight)]
      for(let i=0;i<=40;i++){const a=i*Math.PI/40;arch.push(new Cartesian2(radius*Math.cos(a),springHeight+canopyRadius*Math.sin(a)))}
      arch.push(new Cartesian2(-radius,0),new Cartesian2(-(radius-.12),0),new Cartesian2(-(radius-.12),springHeight))
      for(let i=0;i<=40;i++){const a=Math.PI-i*Math.PI/40;arch.push(new Cartesian2((radius-.12)*Math.cos(a),springHeight+(canopyRadius-.12)*Math.sin(a)))}
      arch.push(new Cartesian2((radius-.12),0))
      canopies.push(viewer.entities.add({polylineVolume:{positions:[station-.06,station+.06].map(s=>tunnelPoint(survey,tube,stationAt(s))),shape:arch,
        cornerType:CornerType.MITERED,material:Color.fromCssColorString('#7c929f')}}))
    }
  }
  const updateSurfaces = addTunnelInterior(viewer, survey)
  const updateDetails = addTunnelDetails(viewer, survey)

  scope.capture()
  return {lightPrimitives:updateDetails.lightPrimitives,lightFrames:updateDetails.lightFrames,dispose(){updateDetails.dispose();scope.dispose()},setCanopyVisible(visible:boolean){canopies.forEach(e=>e.show=visible)},setWallsVisible(visible:boolean){updateSurfaces.setWallsVisible(visible);updateDetails.setWallsVisible(visible)},setLighting(state:import('./tunnelSystemsState').SystemsState){updateSurfaces.setLighting(state);updateDetails.setLighting(state)}}
}

export async function addTunnelModel(viewer:Viewer,survey:TunnelSurvey,progress?:(resource:string)=>void){
  const boreSurvey=(i:number):TunnelSurvey=>({...survey,length:survey.project?boreLength(survey.project.bores[i]!):survey.length,tubeIndices:[i]})
  const bores=new Map(boreIndices(survey).map(i=>[i,createBore(viewer,boreSurvey(i))]))
  if(!ClippingPolygonCollection.isSupported(viewer.scene))throw new Error('当前浏览器不支持地形开挖')
  let siteScope=sceneResources(viewer)
  let sites=await Promise.all(([0,1] as const).map(end=>addPortalSite(viewer,survey,end,progress)))
  siteScope.capture()
  const clip=()=>{viewer.scene.globe.clippingPolygons=new ClippingPolygonCollection({polygons:sites.map(site=>site.excavation)})};clip()
  return {
    setName(name:string){sites.forEach(site=>site.setName(name))},get sites(){return sites},get lightFrames(){return new Map([...bores.values()].flatMap(b=>[...b.lightFrames]))},get lightPrimitives(){return new Map([...bores.values()].flatMap(b=>[...b.lightPrimitives]))},
    updateInterior(next:TunnelSurvey,indices:number[]){survey=next;for(const i of indices){bores.get(i)?.dispose();bores.delete(i);if(survey.tubes[i])bores.set(i,createBore(viewer,boreSurvey(i)))}},
    async updateStructure(next:TunnelSurvey,indices:number[]){survey=next;for(const i of indices){bores.get(i)?.dispose();bores.delete(i);if(survey.tubes[i])bores.set(i,createBore(viewer,boreSurvey(i)))}sites.forEach(s=>s.dispose());siteScope.dispose();siteScope=sceneResources(viewer);sites=await Promise.all(([0,1] as const).map(end=>addPortalSite(viewer,survey,end)));siteScope.capture();clip();await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{remove();reject(new Error("洞口模型更新超时"))},30000);const remove=viewer.scene.postRender.addEventListener(()=>{if(sites.every(s=>s.structures.ready&&s.substation.ready)){clearTimeout(timer);remove();resolve()}});viewer.scene.requestRender()})},
    dispose(){bores.forEach(b=>b.dispose());sites.forEach(s=>s.dispose());siteScope.dispose()},
    isReady:()=>sites.every(site=>site.isReady()),setCanopyVisible(visible:boolean){bores.forEach(b=>b.setCanopyVisible(visible))},setWallsVisible(visible:boolean){bores.forEach(b=>b.setWallsVisible(visible))},setUnderground(enabled:boolean){sites.forEach(site=>site.setUnderground(enabled))},setLighting(state:import('./tunnelSystemsState').SystemsState){bores.forEach(b=>b.setLighting(state));sites.forEach(site=>site.setLighting(state))}
  }
}
