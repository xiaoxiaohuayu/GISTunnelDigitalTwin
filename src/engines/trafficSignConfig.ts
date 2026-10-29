import noLaneChange from '../assets/traffic-signs/no-lane-change.png?url'
import speed80 from '../assets/traffic-signs/speed-80.png?url'
import height19 from '../assets/traffic-signs/height-1-9.png?url'
import type { TrafficSignsConfig } from '../types/scene'
import { openSceneSettings } from './portalSignConfig'
export const trafficSignNames=['禁止变更车道','限速 80','限高 1.9 m'] as const
export const defaultTrafficSignImages=[noLaneChange,speed80,height19]
export const defaultTrafficSigns=():TrafficSignsConfig=>({images:[null,null,null]})
export function validTrafficSigns(value:unknown):value is TrafficSignsConfig {
  if(!value||typeof value!=='object')return false
  const config=value as TrafficSignsConfig
  return Array.isArray(config.images)&&config.images.length===3&&config.images.every(image=>image===null||image instanceof Blob)
}
export async function readTrafficSigns():Promise<TrafficSignsConfig> {
  const db=await openSceneSettings()
  try{return await new Promise((resolve,reject)=>{
    const request=db.transaction('settings').objectStore('settings').get('traffic-signs')
    request.onsuccess=()=>resolve(validTrafficSigns(request.result)?request.result:defaultTrafficSigns())
    request.onerror=()=>reject(new Error('无法读取交通标志配置'))
  })}finally{db.close()}
}
export async function saveTrafficSigns(config:TrafficSignsConfig):Promise<void> {
  if(!validTrafficSigns(config))throw new Error('交通标志配置不完整')
  const db=await openSceneSettings()
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put(config,'traffic-signs')
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('交通标志保存失败，请检查浏览器存储空间'));tx.onabort=()=>reject(new Error('交通标志保存已中止'))
  })}finally{db.close()}
}
export async function trafficSignImage(index:number,image:Blob|null):Promise<string> {
  if(!image)return defaultTrafficSignImages[index]!
  const bitmap=await createImageBitmap(image)
  try{const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,1024,1024);const scale=Math.min(1024/bitmap.width,1024/bitmap.height);ctx.drawImage(bitmap,(1024-bitmap.width*scale)/2,(1024-bitmap.height*scale)/2,bitmap.width*scale,bitmap.height*scale);return canvas.toDataURL()}finally{bitmap.close()}
}
