// @env browser
import { Cartesian2, Cartesian3, Color, ConstantPositionProperty, ConstantProperty, DistanceDisplayCondition, Matrix4, PolygonHierarchy } from 'cesium'
import type { Entity, Viewer } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import type { SceneDevice } from './tunnelSystemsState'
import type { DeviceInstance } from './deviceInstance'
import { lanePositions } from './projectSurvey'
import { tunnelPoint } from './tunnelDetails'

export function addDetectionCoverage(viewer:Viewer,initialSurvey:TunnelSurvey,devices:SceneDevice[]) {
  const entities:Entity[]=[],transforms=new Map<string,((delta:Matrix4)=>void)[]>()
  let visible=false,survey=initialSurvey
  function attach(id:string,entity:Entity,points:Cartesian3[]){
    entities.push(entity)
    const actions=transforms.get(id)??[]
    actions.push(delta=>{const moved=points.map(point=>Matrix4.multiplyByPoint(delta,point,new Cartesian3()));if(entity.polygon)entity.polygon.hierarchy=new ConstantProperty(new PolygonHierarchy(moved));else if(entity.polyline)entity.polyline.positions=new ConstantProperty(moved);else entity.position=new ConstantPositionProperty(moved[0]!)})
    transforms.set(id,actions)
  }
  function build(){
    for(const device of devices.filter(d=>d.kind==='camera')) {
      const direction=device.tube===0?1:-1
      const camera=device.position??tunnelPoint(survey,device.tube,device.station,device.lateral,device.height)
      const footprint=[[-3.9,10],[3.9,10],[3.9,28],[-3.9,28]].map(([y,s])=>tunnelPoint(survey,device.tube,device.station+direction*s!,y!, .24))
      for(let i=0;i<4;i++){
        const points=[camera,footprint[i]!,footprint[(i+1)%4]!]
        attach(device.id,viewer.entities.add({show:visible,polygon:{hierarchy:new PolygonHierarchy(points),perPositionHeight:true,material:Color.fromCssColorString('#e968b1').withAlpha(.12),distanceDisplayCondition:new DistanceDisplayCondition(0,400)}}),points)
      }
      const outline=[...footprint,footprint[0]!]
      attach(device.id,viewer.entities.add({show:visible,polyline:{positions:outline,width:1.5,material:Color.fromCssColorString('#f89bce'),distanceDisplayCondition:new DistanceDisplayCondition(0,400)}}),outline)
    }
    for(const d of devices.filter(d=>d.kind==='detector')) {
      const position=d.position??tunnelPoint(survey,d.tube,d.station,0,6.7)
      attach(d.id,viewer.entities.add({show:visible,position,label:{text:`车辆检测区 · ${d.boreName??(d.tube===0?'上行':'下行')}`,font:'12px sans-serif',fillColor:Color.LIGHTSKYBLUE,showBackground:true,backgroundColor:Color.fromCssColorString('#101d39'),pixelOffset:new Cartesian2(0,-12),distanceDisplayCondition:new DistanceDisplayCondition(0,130)}}),[position])
      for(const {lateral:lane} of lanePositions(survey,d.tube)) {
        const loop=[[-1.5,-2],[1.5,-2],[1.7,-1],[1.7,1],[1.5,2],[-1.5,2],[-1.7,1],[-1.7,-1],[-1.5,-2]].map(([y,s])=>tunnelPoint(survey,d.tube,d.station+s!,lane+y!,.24))
        attach(d.id,viewer.entities.add({show:visible,polyline:{positions:loop,width:2,material:Color.fromCssColorString('#cfecff'),distanceDisplayCondition:new DistanceDisplayCondition(0,220)}}),loop)
      }
    }
  }
  function dispose(){entities.splice(0).forEach(e=>viewer.entities.remove(e));transforms.clear()}
  function bind(instances:Map<string,DeviceInstance>){for(const [id,actions] of transforms){const instance=instances.get(id);if(!instance)continue;const inverse=Matrix4.inverse(instance.currentTransform,new Matrix4());instance.addTransform(delta=>{const movement=Matrix4.multiply(delta,inverse,new Matrix4());actions.forEach(apply=>apply(movement))},'coverage')}}
  build()
  return {bind,refresh(next:TunnelSurvey,instances:Map<string,DeviceInstance>){dispose();survey=next;build();bind(instances)},dispose,setVisible(value:boolean){visible=value;for(const entity of entities)entity.show=visible;viewer.scene.requestRender()}}
}
