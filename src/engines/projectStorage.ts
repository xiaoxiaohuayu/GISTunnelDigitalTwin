import { openSceneSettings } from './portalSignConfig'
import { projectErrors } from './projectConfig'
import type { TunnelProject } from './projectConfig'
import type { DeviceSettings } from './tunnelSystemsState'
export async function readControlOverrides(projectId:string):Promise<Record<string,DeviceSettings>> {
  const db=await openSceneSettings()
  try{return await new Promise((resolve,reject)=>{const r=db.transaction('settings').objectStore('settings').get(`project-controls:${projectId}`);r.onsuccess=()=>resolve(r.result??{});r.onerror=()=>reject(new Error('无法读取设备控制设置'))})}finally{db.close()}
}
export async function saveControlOverrides(projectId:string,devices:Record<string,DeviceSettings>):Promise<void>{
  const db=await openSceneSettings()
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put(devices,`project-controls:${projectId}`);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('设备控制设置保存失败'));tx.onabort=()=>reject(new Error('设备控制设置保存已中止'))})}finally{db.close()}
}
export async function readTunnelProject():Promise<TunnelProject|null> {
  const db=await openSceneSettings()
  try{return await new Promise((resolve,reject)=>{
    const request=db.transaction('settings').objectStore('settings').get('tunnel-project-v1')
    request.onsuccess=()=>{if(request.result===undefined){resolve(null);return}const errors=projectErrors(request.result);errors.length?reject(new Error(`已保存配置无效：${errors[0]}`)):resolve(request.result)}
    request.onerror=()=>reject(new Error('无法读取隧道配置，请检查浏览器存储权限'))
  })}finally{db.close()}
}
export async function saveTunnelProject(project:TunnelProject|null):Promise<void> {
  if(project){const errors=projectErrors(project);if(errors.length)throw new Error(errors.join('\n'))}
  const db=await openSceneSettings()
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('settings','readwrite'),store=tx.objectStore('settings')
    if(project)store.put(project,'tunnel-project-v1');else store.delete('tunnel-project-v1')
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('隧道配置保存失败'));tx.onabort=()=>reject(new Error('配置保存已中止'))
  })}finally{db.close()}
}
