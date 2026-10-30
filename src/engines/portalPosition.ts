import { Cartesian3, Matrix4 } from 'cesium'
import type { Viewer } from 'cesium'
import { DeviceInstance } from './deviceInstance'
import { positionGizmo } from './positionGizmo'
import { openSceneSettings } from './portalSignConfig'
const groups=new WeakMap<Viewer,Map<string,{frame:Matrix4;move:(p:Cartesian3)=>void;offset:Cartesian3}>>()
export async function portalPosition(viewer:Viewer,id:string,frame:Matrix4,entities:import('cesium').Entity[],primitives:any[]){
  const instance=new DeviceInstance({id,kind:'vms',tube:0,station:0,lateral:0,height:0},frame,viewer)
  entities.forEach(e=>instance.addEntity(e))
  for(const primitive of primitives){const base=Matrix4.clone(primitive.modelMatrix);instance.addTransform(delta=>primitive.modelMatrix=Matrix4.multiply(delta,base,new Matrix4()))}
  const group={frame,offset:new Cartesian3(),move(p:Cartesian3){instance.move(Matrix4.multiplyByTranslation(frame,new Cartesian3(p.x,-p.y,p.z),new Matrix4()))}}
  const db=await openSceneSettings()
  try{const value=await new Promise<any>((resolve,reject)=>{const r=db.transaction('settings').objectStore('settings').get(`portal-position:${id}`);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});if(value&&[value.x,value.y,value.z].every(Number.isFinite)){group.offset=new Cartesian3(value.x,value.y,value.z);group.move(group.offset)}}finally{db.close()}
  const map=groups.get(viewer)??new Map();map.set(id,group);groups.set(viewer,map)
}
export function editPortalPosition(viewer:Viewer,id:string){
  const group=groups.get(viewer)?.get(id);if(!group)return
  viewer.container.querySelector<HTMLButtonElement>('.portal-position-editor .cancel')?.click()
  const panel=document.createElement('aside');panel.className='portal-position-editor';Object.assign(panel.style,{position:'absolute',right:'24px',top:'110px',padding:'20px',background:'#122431',color:'white',zIndex:'30',border:'1px solid #638292'})
  const title=document.createElement('h3');title.textContent='调整标牌位置';panel.append(title)
  let draft=Cartesian3.clone(group.offset),busy=false
  const inputs=(['x','y','z'] as const).map((key,i)=>{const label=document.createElement('label');label.style.display='block';label.textContent=['X 沿线路','Y 横向','Z 高度'][i]+'（m）';const input=document.createElement('input');input.type='number';input.step='.1';input.value=String(draft[key]);input.oninput=()=>{if(busy)return;draft[key]=Number(input.value);group.move(draft);gizmo.setOffset(draft)};label.append(input);panel.append(label);return input})
  const message=document.createElement('p'),cancel=document.createElement('button'),save=document.createElement('button');cancel.className='cancel';cancel.textContent='取消';save.textContent='保存位置';panel.append(message,cancel,save)
  const close=()=>{gizmo.dispose();panel.remove()}
  cancel.onclick=()=>{if(busy)return;group.move(group.offset);close()}
  const gizmo=positionGizmo(viewer,group.frame,false,p=>{draft=p;inputs.forEach((input,i)=>input.value=String(Number([p.x,p.y,p.z][i]!.toFixed(3))));group.move(p)},()=>cancel.click());gizmo.setOffset(draft)
  save.onclick=async()=>{busy=true;save.disabled=true;cancel.disabled=true;gizmo.setEnabled(false);try{const db=await openSceneSettings();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({x:draft.x,y:draft.y,z:draft.z},`portal-position:${id}`);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}group.offset=Cartesian3.clone(draft);close()}catch(error){message.textContent=String(error)}finally{busy=false;save.disabled=false;cancel.disabled=false;gizmo.setEnabled(true)}}
  viewer.container.append(panel)
}
