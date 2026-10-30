import { CallbackProperty, Cartesian2, Color, ConstantPositionProperty, DistanceDisplayCondition, ScreenSpaceEventHandler, ScreenSpaceEventType } from 'cesium'
import type { Model, Viewer } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import type { SceneDevice, SystemsState } from './tunnelSystemsState'
import { pickedDevice } from './devicePicking'
import { deviceTelemetry } from './deviceTelemetry'
import { tunnelPoint } from './tunnelDetails'

export const deviceHeight=(d:SceneDevice)=>['lane','vms'].includes(d.kind)?(d.position?d.height:5.85):d.kind==='fan'?6.68:d.kind==='camera'?d.height+.35:d.kind==='tank'?1.8:d.kind==='pump'?.8:d.height
export function addDeviceInteraction(viewer:Viewer,survey:TunnelSurvey,devices:SceneDevice[],models:{model:Model;device:SceneDevice}[],onSelect:(device:SceneDevice)=>void,onSignEdit?:()=>void,onTrafficSignEdit?:(index:number)=>void) {
  let selected:SceneDevice|undefined,highlighted:Model|undefined
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const position=(d:SceneDevice)=>d.position??tunnelPoint(survey,d.tube,d.station,d.lateral,deviceHeight(d))
  const selection=viewer.entities.add({id:'device-selection',show:false,
    point:{pixelSize:22,color:Color.fromCssColorString('#80c7ff').withAlpha(.18),outlineColor:Color.fromCssColorString('#80c7ff'),outlineWidth:3}})
  for(const d of devices.filter(d=>['basic','enhanced','pedestrian','vehicle'].includes(d.kind))) {
    viewer.entities.add({id:`device-target:${d.id}`,position:position(d),point:{pixelSize:7,color:Color.LIGHTSKYBLUE.withAlpha(.6),distanceDisplayCondition:new DistanceDisplayCondition(0,38)}})
  }
  const alerts=devices.filter(d=>['fan','camera','covi'].includes(d.kind)).map(d=>{
    const color=Color.fromCssColorString(d.kind==='camera'?'#ffbb61':'#ff5d62')
    const entity=viewer.entities.add({id:`device-alarm:${d.id}`,position:position(d),show:false,
      point:{pixelSize:new CallbackProperty(()=>reduced?18:16+5*Math.sin(performance.now()/270),false),color:color.withAlpha(.35),outlineColor:color,outlineWidth:3}})
    return {device:d,entity}
  })
  const handler=new ScreenSpaceEventHandler(viewer.canvas)
  handler.setInputAction((event:{position:Cartesian2})=>{
    const picked=viewer.scene.pick(event.position),raw=picked?.id
    const id=typeof raw==='string'?raw:raw?.id
    if(String(id).startsWith('portal-traffic:')){onTrafficSignEdit?.(Number(String(id).split(':')[1]));return}
    if(String(id).startsWith('portal-sign:')){onSignEdit?.();return}
    const device=pickedDevice(picked,devices)
    if(device)onSelect(device)
    else if(id==='device-selection'&&selected)onSelect(selected)
  },ScreenSpaceEventType.LEFT_CLICK)
  function select(device?:SceneDevice):void {
    if(highlighted&&!highlighted.isDestroyed())highlighted.silhouetteSize=0
    selected=device;selection.show=!!device
    highlighted=device?models.find(entry=>entry.device.id===device.id)?.model:undefined
    if(highlighted){highlighted.silhouetteColor=Color.fromCssColorString('#80c7ff');highlighted.silhouetteSize=3}
    if(device)selection.position=new ConstantPositionProperty(position(device))
    viewer.scene.requestRender()
  }
  const owned=viewer.entities.values.filter(e=>e===selection||e.id.startsWith('device-target:')||e.id.startsWith('device-alarm:'))
  function refresh():void{for(const d of devices){for(const prefix of ['device-target:','device-alarm:']){const e=viewer.entities.getById(prefix+d.id);if(e)e.position=new ConstantPositionProperty(position(d))}}if(selected)select(selected)}
  return {select,refresh,get selected(){return selected},update(state:SystemsState){for(const alert of alerts)alert.entity.show=deviceTelemetry(alert.device,state,survey.length).severity!=='normal';viewer.scene.requestRender()},dispose(){handler.destroy();owned.forEach(e=>viewer.entities.remove(e))}}
}
