import { Cartesian3, Matrix4, Ray, SceneTransforms } from 'cesium'
import type { Viewer } from 'cesium'
import type { OverlayPosition, SceneOverlay, VehicleInfo } from '../types/scene'
import type { TunnelSurvey } from '../types/tunnel'
import type { SceneDevice, SystemsState } from './tunnelSystemsState'
import { crossPassages, passageShuttersOpen } from './tunnelSystemsState'
import { projectLayByWidth, layoutPassages } from './facilityLayout'
import { surveyFrame } from './projectSurvey'
import { boreLength } from './projectConfig'
import { deviceName, deviceTelemetry } from './deviceTelemetry'
import { deviceHeight } from './deviceInteraction'
import { tunnelPoint } from './tunnelDetails'
import { liningBlocksSight } from './overlayVisibility'
import type { TunnelViewPoint } from './overlayVisibility'

const monitored=['covi','no2','wind','humidity','fbg','flame','detector']
export function addSceneOverlays(viewer:Viewer,survey:TunnelSurvey,devices:SceneDevice[],cars:{info:VehicleInfo;position:Cartesian3;tube:number;lane:number;station:number}[],getState:()=>SystemsState,getSelected:()=>SceneDevice|undefined,emit:(items:SceneOverlay[])=>void,move:(positions:OverlayPosition[])=>void,wallsVisible:()=>boolean) {
  const inverse=Matrix4.inverse(surveyFrame(survey,survey.tubes[0]![0]!),new Matrix4())
  const end=Matrix4.multiplyByPoint(inverse,survey.tubes[0]!.at(-1)!,new Cartesian3())
  const spacing=Matrix4.multiplyByPoint(inverse,(survey.tubes[1]??survey.tubes[0])![0]!,new Cartesian3()).y
  const anchors=devices.map(device=>({device,get position(){return device.position??tunnelPoint(survey,device.tube,device.station,device.lateral,deviceHeight(device))},get local(){const p=Matrix4.multiplyByPoint(inverse,this.position,new Cartesian3());return {station:device.station,lateral:p.y,height:deviceHeight(device)}}}))
  const carTargets=cars.map(car=>({car,local:{station:0,lateral:car.tube*spacing+(car.lane===0?-2.15:2.15),height:2.1}}))
  const passages=survey.project?layoutPassages(survey):crossPassages(survey.length),delta=new Cartesian3(),pixelScratch=new Cartesian3()
  let previous= -Infinity,lastState:SystemsState|undefined,lastSelected:string|undefined,lastWalls=true,lastUnderground=false
  let active:{id:string;position:Cartesian3}[]=[]
  const cameraPrevious=new Cartesian3(),directionPrevious=new Cartesian3()
  const project=(id:string,position:Cartesian3):OverlayPosition|undefined=>{
    Cartesian3.subtract(position,viewer.camera.positionWC,delta)
    const distance=Cartesian3.magnitude(delta)
    if(distance>150||Cartesian3.dot(delta,viewer.camera.directionWC)<=0)return
    const pixel=SceneTransforms.worldToWindowCoordinates(viewer.scene,position)
    if(!pixel||pixel.x<0||pixel.x>viewer.canvas.clientWidth||pixel.y<0||pixel.y>viewer.canvas.clientHeight)return
    return {id,x:pixel.x,y:pixel.y,distance}
  }
  const remove=viewer.scene.postRender.addEventListener(()=>{
    const now=performance.now(),state=getState(),selected=getSelected(),walls=wallsVisible(),underground=viewer.scene.globe.translucency.enabled
    if(now-previous>=250||state!==lastState||selected?.id!==lastSelected||walls!==lastWalls||underground!==lastUnderground||Cartesian3.distance(viewer.camera.positionWC,cameraPrevious)>3||Cartesian3.dot(viewer.camera.directionWC,directionPrevious)<.995) {
      previous=now;lastState=state;lastSelected=selected?.id;lastWalls=walls;lastUnderground=underground
      Cartesian3.clone(viewer.camera.positionWC,cameraPrevious);Cartesian3.clone(viewer.camera.directionWC,directionPrevious)
      const camera=Matrix4.multiplyByPoint(inverse,viewer.camera.positionWC,new Cartesian3()),station=camera.x/end.x*survey.length
      const floor=Matrix4.multiplyByPoint(inverse,tunnelPoint(survey,0,station),pixelScratch)
      const from={station,lateral:camera.y,height:camera.z-floor.z}
      const geometry={length:survey.length,spacing,wallsVisible:walls,shuttersOpen:state.shuttersOpen,shutterOpen:(index:number)=>passageShuttersOpen(index,state),passages,boreCount:survey.tubes.length,radiusAt:(tube:number)=>{const b=survey.project?.bores[tube];return b?5.5+b.lanes.length*b.laneWidth/2-4.3:5.5},lengthAt:(tube:number)=>survey.project?boreLength(survey.project.bores[tube]!):survey.length,widthAt:(s:number,tube:number)=>projectLayByWidth(s,survey,tube)}
      const visible=(position:Cartesian3,local:TunnelViewPoint,distance:number)=>{
        if(liningBlocksSight(from,local,geometry))return false
        if(!underground){
          const direction=Cartesian3.normalize(Cartesian3.subtract(position,viewer.camera.positionWC,delta),new Cartesian3())
          const hit=viewer.scene.globe.pick(new Ray(viewer.camera.positionWC,direction),viewer.scene)
          if(hit&&Cartesian3.distance(viewer.camera.positionWC,hit)<distance-1.2)return false
        }
        return true
      }
      const items:SceneOverlay[]=[];active=[]
      for(const {device,position,local} of anchors) {
        const isSelected=device.id===selected?.id
        if(!isSelected&&!monitored.includes(device.kind))continue
        const point=project(device.id,position);if(!point||!visible(position,local,point.distance))continue
        const reading=deviceTelemetry(device,state,survey.length)
        items.push({...point,title:deviceName(device),value:device.kind==='wind'?`风向 未知 · 风速 ${reading.value}`:reading.value,status:reading.status,severity:reading.severity,selected:isSelected});active.push({id:device.id,position})
      }
      for(const {car,local} of carTargets) {
        local.station=car.station;local.lateral=Matrix4.multiplyByPoint(inverse,car.position,new Cartesian3()).y
        const point=project(car.info.id,car.position);if(!point||!visible(car.position,local,point.distance))continue
        items.push({...point,title:car.info.plate,value:`${car.info.plateColor} · ${car.info.vehicleType}`,plateColor:car.info.plateColor,status:'本地演示',severity:'normal',selected:false});active.push({id:car.info.id,position:car.position})
      }
      emit(items)
    }
    move(active.flatMap(target=>{const point=project(target.id,target.position);return point?[point]:[]}))
  })
  return ()=>{remove();emit([]);move([])}
}
