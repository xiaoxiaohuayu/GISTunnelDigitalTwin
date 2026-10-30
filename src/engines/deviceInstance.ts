import { Cartesian3, ConstantPositionProperty, ConstantProperty, JulianDate, Matrix3, Matrix4, Quaternion } from 'cesium'
import type { Entity, Model, Viewer } from 'cesium'
import type { SceneDevice } from './tunnelSystemsState'

/** One movable device owns its model, screens, lamps and picking geometry. */
export class DeviceInstance {
  private delta=Matrix4.clone(Matrix4.IDENTITY)
  private parts:{key?:string;apply:(delta:Matrix4)=>void}[]=[]
  readonly device:SceneDevice
  private frame:Matrix4
  private viewer:Viewer
  constructor(device:SceneDevice,frame:Matrix4,viewer:Viewer){this.device=device;this.frame=frame;this.viewer=viewer}
  addModel(model:Model):void{const base=Matrix4.clone(model.modelMatrix);this.parts.push({apply:delta=>{model.modelMatrix=Matrix4.multiply(delta,base,new Matrix4())}})}
  addEntity(entity:Entity):void{
    const time=JulianDate.now(),position=entity.position?.getValue(time),orientation=entity.orientation?.getValue(time)
    if(!position)return
    this.parts.push({apply:delta=>{entity.position=new ConstantPositionProperty(Matrix4.multiplyByPoint(delta,position,new Cartesian3()));if(orientation)entity.orientation=new ConstantProperty(Quaternion.multiply(Quaternion.fromRotationMatrix(Matrix4.getMatrix3(delta,new Matrix3())),orientation,new Quaternion()))}})
  }
  get currentTransform():Matrix4{return Matrix4.clone(this.delta)}
  get referenceFrame():Matrix4{return Matrix4.clone(this.frame)}
  addTransform(apply:(delta:Matrix4)=>void,key?:string):void{if(key)this.parts=this.parts.filter(p=>p.key!==key);this.parts.push({apply,key})}
  move(frame:Matrix4):void{
    const delta=Matrix4.multiply(frame,Matrix4.inverse(this.frame,new Matrix4()),new Matrix4())
    this.delta=delta
    this.parts.forEach(part=>part.apply(delta));this.viewer.scene.requestRender()
  }
}
