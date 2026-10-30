import { Cartesian2, Cartesian3, Matrix4, SceneTransforms } from 'cesium'
import type { Viewer } from 'cesium'

export function axisDistance(rayOrigin:Cartesian3,rayDirection:Cartesian3,origin:Cartesian3,axis:Cartesian3):number|undefined {
  const dot=Cartesian3.dot(rayDirection,axis),denominator=1-dot*dot
  if(denominator<.015)return undefined
  const offset=Cartesian3.subtract(rayOrigin,origin,new Cartesian3())
  return (Cartesian3.dot(offset,axis)-dot*Cartesian3.dot(offset,rayDirection))/denominator
}
export function positionGizmo(viewer:Viewer,frame:Matrix4,constrained:boolean,onMove:(offset:Cartesian3)=>void,onCancel:()=>void){
  const origin=Matrix4.getTranslation(frame,new Cartesian3()),axes=[Cartesian3.UNIT_X,Cartesian3.negate(Cartesian3.UNIT_Y,new Cartesian3()),Cartesian3.UNIT_Z].map(a=>Cartesian3.normalize(Matrix4.multiplyByPointAsVector(frame,a,new Cartesian3()),new Cartesian3()))
  const namespace='http://www.w3.org/2000/svg',svg=document.createElementNS(namespace,'svg'),offset=new Cartesian3()
  svg.setAttribute('class','position-axes');svg.setAttribute('aria-label','位置调整坐标轴');Object.assign(svg.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',overflow:'visible',zIndex:'5'})
  viewer.container.append(svg)
  const handles=axes.slice(0,constrained?1:3).map((_,i)=>{
    const group=document.createElementNS(namespace,'g'),line=document.createElementNS(namespace,'line'),hit=document.createElementNS(namespace,'line'),tip=document.createElementNS(namespace,'polygon'),label=document.createElementNS(namespace,'text'),color=['#ff5252','#52e380','#45bdff'][i]!
    line.setAttribute('stroke',color);line.setAttribute('stroke-width','3');hit.setAttribute('stroke','transparent');hit.setAttribute('stroke-width','18');hit.style.pointerEvents='stroke';hit.style.cursor='grab';hit.setAttribute('data-axis',String(i));hit.setAttribute('aria-label',['X 沿线路','Y 横向','Z 高度'][i]!);tip.setAttribute('fill',color);label.textContent=['X 沿线路','Y 横向','Z 高度'][i]!;label.setAttribute('fill',color);label.setAttribute('font-size','14');label.setAttribute('font-weight','600');label.setAttribute('stroke','#10212c');label.setAttribute('stroke-width','3');label.style.paintOrder='stroke';group.append(line,tip,label,hit);svg.append(group);return {group,line,hit,tip,label}
  })
  function render(){
    const center=Matrix4.multiplyByPoint(frame,new Cartesian3(offset.x,-offset.y,offset.z),new Cartesian3()),size=Math.max(1,Math.min(20,Cartesian3.distance(viewer.camera.positionWC,center)*.08)),start=SceneTransforms.worldToWindowCoordinates(viewer.scene,center)
    handles.forEach((h,i)=>{const end=SceneTransforms.worldToWindowCoordinates(viewer.scene,Cartesian3.add(center,Cartesian3.multiplyByScalar(axes[i]!,size,new Cartesian3()),new Cartesian3()));h.group.style.display=start&&end?'':'none';if(!start||!end)return;const dx=end.x-start.x,dy=end.y-start.y,n=Math.max(1,Math.hypot(dx,dy)),ux=dx/n,uy=dy/n;for(const line of [h.line,h.hit]){line.setAttribute('x1',String(start.x));line.setAttribute('y1',String(start.y));line.setAttribute('x2',String(end.x));line.setAttribute('y2',String(end.y))}h.tip.setAttribute('points',`${end.x},${end.y} ${end.x-ux*12-uy*5},${end.y-uy*12+ux*5} ${end.x-ux*12+uy*5},${end.y-uy*12-ux*5}`);h.label.setAttribute('x',String(end.x+7));h.label.setAttribute('y',String(end.y-7))})
  }
  let drag:{axis:number;start:number;offset:Cartesian3}|undefined,inputs=true
  const release=()=>{if(drag)viewer.scene.screenSpaceCameraController.enableInputs=inputs;drag=undefined}
  const rayAt=(event:PointerEvent)=>{const bounds=viewer.canvas.getBoundingClientRect();return viewer.camera.getPickRay(new Cartesian2(event.clientX-bounds.left,event.clientY-bounds.top))}
  handles.forEach((h,axis)=>h.hit.addEventListener('pointerdown',event=>{const ray=rayAt(event);if(!ray)return;const start=axisDistance(ray.origin,ray.direction,origin,axes[axis]!);if(start===undefined)return;event.preventDefault();inputs=viewer.scene.screenSpaceCameraController.enableInputs;drag={axis,start,offset:Cartesian3.clone(offset)};viewer.scene.screenSpaceCameraController.enableInputs=false;h.hit.setPointerCapture(event.pointerId)}))
  const move=(event:PointerEvent)=>{if(!drag)return;const ray=rayAt(event);if(!ray)return;const distance=axisDistance(ray.origin,ray.direction,origin,axes[drag.axis]!);if(distance===undefined)return;Cartesian3.clone(drag.offset,offset);const key=(['x','y','z'] as const)[drag.axis]!;offset[key]+=distance-drag.start;onMove(Cartesian3.clone(offset));render();viewer.scene.requestRender()}
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();onCancel()}}
  render();const tick=viewer.scene.preRender.addEventListener(render);window.addEventListener('keydown',key,true);window.addEventListener('pointermove',move);window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release)
  return {setEnabled(enabled:boolean){if(!enabled)release();handles.forEach(h=>h.hit.style.pointerEvents=enabled?'stroke':'none')},setOffset(value:Cartesian3){Cartesian3.clone(value,offset);render()},dispose(){release();tick();svg.remove();window.removeEventListener('keydown',key,true);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',release);viewer.scene.requestRender()}}
}
