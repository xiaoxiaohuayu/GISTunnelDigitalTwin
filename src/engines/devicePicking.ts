import type { SceneDevice } from './tunnelSystemsState'

export function pickedDevice(picked:{id?:string|{id?:string};detail?:{node?:{node?:{name?:string}}}}|undefined,devices:SceneDevice[]):SceneDevice|undefined {
  const raw=picked?.id,id=typeof raw==='string'?raw:raw?.id
  if(!id)return undefined
  const normalized=id.replace(/^device-(target|alarm|part|lens):/,'').replace(/:(-?\d+(\.\d+)?)$/,'')
  const node=picked?.detail?.node?.node?.name
  return devices.find(device=>device.id===normalized || (node!==undefined && device.pickId===`${id}/${node}`))
}
