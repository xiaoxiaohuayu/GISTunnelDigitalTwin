import type { SceneDevice } from './tunnelSystemsState'

export function pickedDevice(picked:{id?:string|{id?:string};detail?:{node?:{node?:{name?:string}}}}|undefined,devices:SceneDevice[]):SceneDevice|undefined {
  const raw=picked?.id,id=typeof raw==='string'?raw:raw?.id
  if(!id)return undefined
  const normalized=id.replace(/^device-(target|alarm|part|lens):/,'').replace(/:(-?\d+(\.\d+)?)$/,'')
  const node=picked?.detail?.node?.node?.name
  const direct=devices.find(device=>device.id===normalized || (node!==undefined && device.pickId===`${id}/${node}`))
  if(direct)return direct

  // Match procedural & ledger tunnel lamp primitives:
  // 1) Ledger lamp: light-(housing|diffuser|bracket)-<assetId> / boost-(housing|diffuser)-<assetId>
  const lampMatch=id.match(/^(light|boost)-(?:housing|diffuser|bracket)-(.+)$/)
  if(lampMatch){
    const kind=lampMatch[1]==='light'?'basic':'enhanced'
    const rest=lampMatch[2]!
    const byId=devices.find(device=>device.id===rest)
    if(byId)return byId
    // 2) Procedural demo lamp: <tube>-<side>-<station>
    const parts=rest.match(/^(\d+)-(-?1)-(-?\d+(?:\.\d+)?)$/)
    if(parts){
      const tube=Number(parts[1]),side=Number(parts[2]),station=Number(parts[3])
      return devices.find(d=>d.kind===kind&&d.tube===tube&&Math.sign(d.lateral||side)===side&&Math.abs(d.station-station)<1.5)
    }
  }
  return undefined
}
