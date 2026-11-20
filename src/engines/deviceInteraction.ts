import { CallbackProperty, Cartesian2, Cartesian3, Color, ConstantPositionProperty, DistanceDisplayCondition, Matrix3, Matrix4, Quaternion, ScreenSpaceEventHandler, ScreenSpaceEventType } from 'cesium'
import type { Entity, Model, Viewer } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import type { DeviceKind, SceneDevice, SystemsState } from './tunnelSystemsState'
import { pickedDevice } from './devicePicking'
import { deviceTelemetry } from './deviceTelemetry'
import { tunnelPoint } from './tunnelDetails'
import { surveyFrame } from './projectSurvey'
import { highlightPortalGroup } from './portalPosition'

export const deviceHeight=(d:SceneDevice)=>['lane','vms'].includes(d.kind)?(d.position?d.height:5.85):d.kind==='fan'?6.68:d.kind==='camera'?d.height+.35:d.kind==='tank'?1.8:d.kind==='pump'?.8:d.height

export function deviceBoxSize(kind: DeviceKind): [number, number, number] {
  switch (kind) {
    case 'basic': return [1.9, 0.72, 0.56]
    case 'enhanced': return [2.0, 0.78, 0.56]
    case 'fan': return [3.2, 1.35, 1.35]
    case 'vms': return [0.75, 6.9, 1.25]
    case 'lane': return [0.65, 1.1, 1.1]
    case 'signal': return [0.65, 2.35, 1.0]
    case 'cabinet': return [1.05, 0.55, 1.85]
    case 'camera': return [0.85, 0.55, 0.55]
    case 'detector': return [0.95, 0.85, 0.65]
    case 'plc': case 'distribution': return [0.85, 0.55, 1.35]
    case 'speaker': return [0.65, 0.55, 0.65]
    case 'telephone': return [0.65, 0.45, 1.2]
    case 'escape': return [1.1, 0.35, 0.65]
    case 'manual': case 'flame': case 'covi': case 'no2': case 'wind': case 'fbg': case 'humidity': return [0.75, 0.55, 0.65]
    case 'shutter': return [4.2, 0.75, 3.6]
    case 'pedestrian': return [4.4, 2.4, 3.2]
    case 'vehicle': return [7.2, 3.0, 5.2]
    case 'layby': return [3.0, 2.8, 2.2]
    case 'pump': return [1.6, 1.2, 1.2]
    case 'tank': return [4.2, 3.2, 3.0]
    case 'substation': return [12.0, 8.0, 5.0]
    case 'street': return [1.2, 2.0, 8.2]
    default: return [1.2, 1.2, 1.2]
  }
}

export function deviceBoxOffset(d: SceneDevice): [number, number, number] {
  if (d.kind === 'street') {
    // Streetlight anchor sits at the top luminaire head (z ~ 7.81 m), offset ~1.14 m from the pole.
    return [0, Math.sign(d.lateral || 1) * 0.55, -3.85]
  }
  return [0, 0, 0]
}

export function addDeviceInteraction(viewer:Viewer,survey:TunnelSurvey,devices:SceneDevice[],models:{model:Model;device:SceneDevice}[],onSelect:(device:SceneDevice)=>void,onSignEdit?:()=>void,onTrafficSignEdit?:(index:number)=>void) {
  let selected:SceneDevice|undefined,highlighted:Model|undefined
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const position=(d:SceneDevice)=>d.position??tunnelPoint(survey,d.tube,d.station,d.lateral,deviceHeight(d))
  const selectionColor=Color.fromCssColorString('#ffe63b')
  const selection=viewer.entities.add({id:'device-selection',show:false,
    point:{pixelSize:14,color:selectionColor.withAlpha(.28),outlineColor:selectionColor,outlineWidth:2}})
  const selectionBox:Entity=viewer.entities.add({
    id:'device-selection-box',
    show:false,
    box:{
      dimensions:new Cartesian3(1.2,1.2,1.2),
      fill:true,
      material:selectionColor.withAlpha(0.11),
      outline:true,
      outlineColor:selectionColor,
      outlineWidth:2,
    },
  })
  for(const d of devices.filter(d=>['basic','enhanced','pedestrian','vehicle'].includes(d.kind))) {
    const isLamp=d.kind==='basic'||d.kind==='enhanced'
    viewer.entities.add({id:`device-target:${d.id}`,position:position(d),point:{
      pixelSize:isLamp?11:9,
      color:Color.fromCssColorString('#8ad4ff').withAlpha(isLamp?.48:.62),
      outlineColor:Color.fromCssColorString('#d4f0ff').withAlpha(isLamp?.72:.8),
      outlineWidth:1.5,
      distanceDisplayCondition:new DistanceDisplayCondition(0,isLamp?85:55),
    }})
  }
  const alerts=devices.filter(d=>['fan','camera','covi'].includes(d.kind)).map(d=>{
    const color=Color.fromCssColorString(d.kind==='camera'?'#ffbb61':'#ff5d62')
    const entity=viewer.entities.add({id:`device-alarm:${d.id}`,position:position(d),show:false,
      point:{pixelSize:new CallbackProperty(()=>reduced?18:16+5*Math.sin(performance.now()/270),false),color:color.withAlpha(.35),outlineColor:color,outlineWidth:3}})
    return {device:d,entity}
  })
  const handler=new ScreenSpaceEventHandler(viewer.canvas)
  handler.setInputAction((event:{position:Cartesian2})=>{
    const picked=viewer.scene.pick(event.position)
    const raw=picked?.id
    const id=typeof raw==='string'?raw:raw?.id
    if(String(id).startsWith('portal-traffic:')){
      const parts=String(id).split(':')
      const index=Number(parts[1]),end=Number(parts[2]??0)
      select(undefined)
      highlightPortalGroup(viewer,`traffic:${end}`)
      onTrafficSignEdit?.(index)
      return
    }
    if(String(id).startsWith('portal-sign:')){
      const parts=String(id).split(':')
      const direction=Number(parts[2]??1)
      select(undefined)
      highlightPortalGroup(viewer,`board:${direction===1?0:1}`)
      onSignEdit?.()
      return
    }
    let device=pickedDevice(picked,devices)
    if(!device){
      const drilled=viewer.scene.drillPick(event.position,6)
      for(const candidate of drilled){
        const hit=pickedDevice(candidate,devices)
        if(hit){device=hit;break}
      }
    }
    if(device)onSelect(device)
    else if((id==='device-selection'||id==='device-selection-box')&&selected)onSelect(selected)
  },ScreenSpaceEventType.LEFT_CLICK)
  function selectionOrientation(device:SceneDevice,pos:Cartesian3):Quaternion {
    const base=surveyFrame(survey,pos)
    const yaw=Matrix3.fromRotationZ(((device.heading??(device.tube===0?0:180))*Math.PI)/180)
    const rot=Matrix3.multiply(Matrix4.getMatrix3(base,new Matrix3()),yaw,new Matrix3())
    return Quaternion.fromRotationMatrix(rot)
  }
  function select(device?:SceneDevice):void {
    highlightPortalGroup(viewer,null)
    if(highlighted&&!highlighted.isDestroyed())highlighted.silhouetteSize=0
    selected=device;selection.show=!!device;selectionBox.show=!!device
    highlighted=device?models.find(entry=>entry.device.id===device.id)?.model:undefined
    if(highlighted){highlighted.silhouetteColor=selectionColor;highlighted.silhouetteSize=4}
    if(device){
      const pos=position(device)
      const [dx,dy,dz]=deviceBoxSize(device.kind)
      const [ox,oy,oz]=deviceBoxOffset(device)
      const boxPos=(ox||oy||oz)?Matrix4.multiplyByPoint(surveyFrame(survey,pos),new Cartesian3(ox,oy,oz),new Cartesian3()):pos
      selection.position=new ConstantPositionProperty(pos)
      selectionBox.position=new ConstantPositionProperty(boxPos)
      selectionBox.orientation=new ConstantPositionProperty(selectionOrientation(device,pos)) as unknown as Entity['orientation']
      if(selectionBox.box)selectionBox.box.dimensions=new ConstantPositionProperty(new Cartesian3(dx,dy,dz)) as unknown as NonNullable<Entity['box']>['dimensions']
    }
    viewer.scene.requestRender()
  }
  const owned=viewer.entities.values.filter(e=>e===selection||e===selectionBox||e.id.startsWith('device-target:')||e.id.startsWith('device-alarm:'))
  function refresh():void{for(const d of devices){for(const prefix of ['device-target:','device-alarm:']){const e=viewer.entities.getById(prefix+d.id);if(e)e.position=new ConstantPositionProperty(position(d))}}if(selected)select(selected)}
  return {select,refresh,get selected(){return selected},update(state:SystemsState){for(const alert of alerts)alert.entity.show=deviceTelemetry(alert.device,state,survey.length).severity!=='normal';viewer.scene.requestRender()},dispose(){handler.destroy();owned.forEach(e=>viewer.entities.remove(e))}}
}
