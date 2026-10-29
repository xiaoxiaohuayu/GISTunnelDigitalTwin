import type { PortalSignConfig } from '../types/scene'
export const defaultPortalSign=():PortalSignConfig=>({mode:'text',name:'青山隧道',length:'',subtitle:'Qingshan Tunnel',notice:'请开灯行驶'})
export function validPortalSign(value:unknown):value is PortalSignConfig {
  if(!value||typeof value!=='object')return false
  const sign=value as PortalSignConfig
  return ['text','mixed','image'].includes(sign.mode)&&typeof sign.name==='string'&&!!sign.name.trim()&&sign.name.length<=40&&typeof sign.length==='string'&&sign.length.length<=40
    &&(sign.subtitle===undefined||typeof sign.subtitle==='string'&&sign.subtitle.length<=80)
    &&(sign.notice===undefined||typeof sign.notice==='string'&&sign.notice.length<=30)
    &&(sign.mode==='text'||sign.image instanceof Blob)
}
export function openSceneSettings():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('tunnel-scene-settings',1)
    request.onupgradeneeded=()=>request.result.createObjectStore('settings')
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>reject(new Error('无法打开本地标牌存储'))
  })
}
export async function readPortalSign():Promise<PortalSignConfig> {
  const db=await openSceneSettings()
  try{return await new Promise((resolve,reject)=>{
    const request=db.transaction('settings').objectStore('settings').get('portal-sign')
    request.onsuccess=()=>resolve(validPortalSign(request.result)?request.result:defaultPortalSign())
    request.onerror=()=>reject(new Error('无法读取本地标牌配置'))
  })}finally{db.close()}
}
export async function savePortalSign(config:PortalSignConfig):Promise<void> {
  if(!validPortalSign(config))throw new Error('请填写名称并为图片模式选择图片')
  const db=await openSceneSettings()
  try{await new Promise<void>((resolve,reject)=>{
    const transaction=db.transaction('settings','readwrite')
    transaction.objectStore('settings').put(config,'portal-sign')
    transaction.oncomplete=()=>resolve()
    transaction.onerror=()=>reject(new Error('标牌保存失败，请检查浏览器存储空间'))
    transaction.onabort=()=>reject(new Error('标牌保存已中止'))
  })}finally{db.close()}
}
export async function portalSignImage(config:PortalSignConfig,length:number):Promise<HTMLCanvasElement> {
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=900
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#007d65';ctx.fillRect(0,0,1200,900)
  let image:ImageBitmap|undefined
  const fitted=(text:string,x:number,y:number,width:number,size:number,color='#fff')=>{
    ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle'
    while(size>20){ctx.font=`600 ${size}px "PingFang SC",sans-serif`;if(ctx.measureText(text).width<=width)break;size-=2}
    ctx.fillText(text,x,y)
  }
  try {
    if(config.mode!=='text') {
      if(!config.image)throw new Error('请选择标牌图片')
      image=await createImageBitmap(config.image)
      const area=config.mode==='image'?{x:24,y:24,w:1152,h:852}:{x:95,y:95,w:200,h:210}
      const scale=Math.min(area.w/image.width,area.h/image.height)
      ctx.drawImage(image,area.x+(area.w-image.width*scale)/2,area.y+(area.h-image.height*scale)/2,image.width*scale,image.height*scale)
    } else {
      // Road tunnel pictogram, drawn as a filled arch and perspective carriageway.
      ctx.fillStyle='#29483f';ctx.beginPath();ctx.moveTo(105,305);ctx.lineTo(105,195);ctx.arc(200,195,95,Math.PI,0);ctx.lineTo(295,305);ctx.closePath();ctx.fill()
      ctx.fillStyle='#0d302c';ctx.beginPath();ctx.moveTo(140,305);ctx.lineTo(140,198);ctx.arc(200,198,60,Math.PI,0);ctx.lineTo(260,305);ctx.closePath();ctx.fill()
      ctx.fillStyle='#bac6b5';ctx.beginPath();ctx.moveTo(153,305);ctx.lineTo(185,225);ctx.lineTo(215,225);ctx.lineTo(247,305);ctx.closePath();ctx.fill()
      ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(200,285);ctx.lineTo(200,251);ctx.stroke()
    }
    if(config.mode!=='image') {
      fitted(config.name,735,177,800,112)
      fitted(config.subtitle??'Qingshan Tunnel',735,294,800,53)
      ctx.strokeStyle='#fff';ctx.lineWidth=9
      ctx.beginPath();ctx.moveTo(26,390);ctx.lineTo(1174,390);ctx.moveTo(26,660);ctx.lineTo(1174,660);ctx.stroke()
      fitted('长 度',218,496,300,91);fitted('Length',218,585,300,49)
      fitted(config.length.trim()||`${Math.round(length)} m`,795,533,690,150)
      ctx.fillStyle='#ffca35';ctx.fillRect(26,665,1148,209)
      fitted(config.notice??'请开灯行驶',600,770,1060,116,'#182621')
    }
    ctx.strokeStyle='#fff';ctx.lineWidth=12;ctx.lineJoin='round';ctx.beginPath();ctx.roundRect(20,20,1160,860,22);ctx.stroke()
    return canvas
  }finally{image?.close()}
}
