// @env browser
import {
  Cartesian2, ClippingPolygonCollection, Color, CornerType,
} from 'cesium'
import type { Viewer } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import { addTunnelInterior } from './tunnelInterior'
import { addPortalSite } from './portalSite'
import { addTunnelDetails, tunnelPoint } from './tunnelDetails'

export async function addTunnelModel(viewer: Viewer, survey: TunnelSurvey, progress?: (resource:string)=>void) {
  const canopies: import('cesium').Entity[]=[]
  // Match both portal openings in build-portal-site.py: radius 5.53 m, spring line 2.5 m.
  const canopyRadius=5.53,springHeight=2.5
  for(const end of [0,1]) for(let tube=0;tube<2;tube++) {
    const stationAt=(station:number)=>end===0?station:survey.length-station
    const roof:Cartesian2[]=[]
    for(const [radius,reverse] of [[canopyRadius,false],[canopyRadius-.08,true]] as const)for(let i=0;i<=40;i++) {
      const a=Math.PI*(.1+.8*(reverse?1-i/40:i/40));roof.push(new Cartesian2(radius*Math.cos(a),springHeight+radius*Math.sin(a)))
    }
    // PolylineVolume rebases shape.y to its minimum; preserve the roof elevation explicitly.
    const roofBase=Math.min(...roof.map(point=>point.y))
    canopies.push(viewer.entities.add({name:'洞口遮雨棚',polylineVolume:{positions:[-82,-61].map(s=>tunnelPoint(survey,tube,stationAt(s),0,roofBase)),
      shape:roof,cornerType:CornerType.MITERED,material:Color.fromCssColorString('#b8cedb').withAlpha(.45)}}))
    for(const station of [-82,-75,-68,-61]) {
      const arch=[new Cartesian2(canopyRadius,0),new Cartesian2(canopyRadius,springHeight)]
      for(let i=0;i<=40;i++){const a=i*Math.PI/40;arch.push(new Cartesian2(canopyRadius*Math.cos(a),springHeight+canopyRadius*Math.sin(a)))}
      arch.push(new Cartesian2(-canopyRadius,0),new Cartesian2(-(canopyRadius-.12),0),new Cartesian2(-(canopyRadius-.12),springHeight))
      for(let i=0;i<=40;i++){const a=Math.PI-i*Math.PI/40;arch.push(new Cartesian2((canopyRadius-.12)*Math.cos(a),springHeight+(canopyRadius-.12)*Math.sin(a)))}
      arch.push(new Cartesian2((canopyRadius-.12),0))
      canopies.push(viewer.entities.add({polylineVolume:{positions:[station-.06,station+.06].map(s=>tunnelPoint(survey,tube,stationAt(s))),shape:arch,
        cornerType:CornerType.MITERED,material:Color.fromCssColorString('#7c929f')}}))
    }
  }
  const updateSurfaces = addTunnelInterior(viewer, survey)
  const updateDetails = addTunnelDetails(viewer, survey)

  if (!ClippingPolygonCollection.isSupported(viewer.scene)) throw new Error('当前浏览器不支持地形开挖，请使用支持 WebGL 2 的浏览器')
  const sites = await Promise.all(([0, 1] as const).map(end => addPortalSite(viewer, survey, end, progress)))
  viewer.scene.globe.clippingPolygons = new ClippingPolygonCollection({ polygons: sites.map(site => site.excavation) })
  return { sites,dispose(){for(const site of sites)site.dispose()},isReady:()=>sites.every(site=>site.isReady()), setCanopyVisible(visible:boolean) {for(const entity of canopies)entity.show=visible}, setUnderground(enabled:boolean) { for (const site of sites) site.setUnderground(enabled) }, setWallsVisible(visible:boolean) { updateSurfaces.setWallsVisible(visible); updateDetails.setWallsVisible(visible) }, setLighting(state:import('./tunnelSystemsState').SystemsState) { updateSurfaces.setLighting(state); updateDetails.setLighting(state); for (const site of sites) site.setLighting(state) } }
}
