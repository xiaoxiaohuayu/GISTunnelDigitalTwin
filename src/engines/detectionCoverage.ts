// @env browser
import { Cartesian2, Color, DistanceDisplayCondition, PolygonHierarchy } from 'cesium'
import type { Entity, Viewer } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import type { SceneDevice } from './tunnelSystemsState'
import { tunnelPoint } from './tunnelDetails'

export function addDetectionCoverage(viewer:Viewer,survey:TunnelSurvey,devices:SceneDevice[]) {
  const entities:Entity[]=[]
  for(const device of devices.filter(d=>d.kind==='camera')) {
    const direction=device.tube===0?1:-1
    const camera=tunnelPoint(survey,device.tube,device.station,device.lateral,device.height)
    const footprint=[[-3.9,10],[3.9,10],[3.9,28],[-3.9,28]].map(([y,s])=>tunnelPoint(survey,device.tube,device.station+direction*s!,y!, .24))
    for(let i=0;i<4;i++)entities.push(viewer.entities.add({show:false,polygon:{hierarchy:new PolygonHierarchy([camera,footprint[i]!,footprint[(i+1)%4]!]),
      perPositionHeight:true,material:Color.fromCssColorString('#e968b1').withAlpha(.12),distanceDisplayCondition:new DistanceDisplayCondition(0,400)}}))
    entities.push(viewer.entities.add({show:false,polyline:{positions:[...footprint,footprint[0]!],width:1.5,material:Color.fromCssColorString('#f89bce'),distanceDisplayCondition:new DistanceDisplayCondition(0,400)}}))
  }
  for(const d of devices.filter(d=>d.kind==='detector')) {
    entities.push(viewer.entities.add({show:false,position:tunnelPoint(survey,d.tube,d.station,0,6.7),label:{
      text:`车辆检测区 · ${d.tube===0?'上行':'下行'}`,font:'12px sans-serif',fillColor:Color.LIGHTSKYBLUE,
      showBackground:true,backgroundColor:Color.fromCssColorString('#101d39'),pixelOffset:new Cartesian2(0,-12),
      distanceDisplayCondition:new DistanceDisplayCondition(0,130)}}))
    for(const lane of [-2.15,2.15]) {
    const loop=[[-1.5,-2],[1.5,-2],[1.7,-1],[1.7,1],[1.5,2],[-1.5,2],[-1.7,1],[-1.7,-1],[-1.5,-2]]
      .map(([y,s])=>tunnelPoint(survey,d.tube,d.station+s!,lane+y!,.24))
    entities.push(viewer.entities.add({show:false,polyline:{positions:loop,width:2,material:Color.fromCssColorString('#cfecff'),distanceDisplayCondition:new DistanceDisplayCondition(0,220)}}))
  }
  }
  return {setVisible(visible:boolean){for(const entity of entities)entity.show=visible;viewer.scene.requestRender()}}
}
