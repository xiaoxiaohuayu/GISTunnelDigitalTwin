import type { LoadProgress, OverlayRect, PlacedOverlay, SceneOverlay, VehicleInfo } from '../types/scene.ts'

export function createLoadReporter(emit:(progress:LoadProgress)=>void) {
  let percent=0
  return (next:number,stage:string,resource='') => {
    percent=Math.max(percent,Math.min(100,next))
    emit({percent:Math.round(percent),stage,resource})
  }
}
export function vehicleInfo(index:number):VehicleInfo {
  const plateColor=index%5===0?'黄牌':index%3===0?'绿牌':'蓝牌'
  return {id:`traffic-${index+1}`,plate:`新${String.fromCharCode(65+index%4)}${String(12345+index*137).padStart(5,'0')}${plateColor==='绿牌'?'D':''}`,plateColor,vehicleType:'客一'}
}
export function layoutOverlays(items:SceneOverlay[],width:number,height:number,blocked:OverlayRect[],previous:PlacedOverlay[]=[]):PlacedOverlay[] {
  const placed:PlacedOverlay[]=[], occupied=[...blocked]
  const previousById=new Map(previous.map((item,index)=>[item.id,{item,index}]))
  const intersects=(a:OverlayRect,b:OverlayRect)=>a.x<b.x+b.width+8&&a.x+a.width+8>b.x&&a.y<b.y+b.height+8&&a.y+a.height+8>b.y
  const candidates=items.filter(item=>item.distance<=150&&item.x>=0&&item.x<=width&&item.y>=0&&item.y<=height)
    .sort((a,b)=>Number(b.selected)-Number(a.selected)||Number(b.severity!=='normal')-Number(a.severity!=='normal')||Number(!!a.plateColor)-Number(!!b.plateColor)||(previousById.get(a.id)?.index??Infinity)-(previousById.get(b.id)?.index??Infinity)||a.distance-b.distance)
  for(const item of candidates) {
    if(placed.length===4)break
    const old=previousById.get(item.id)?.item
    const offsets=item.selected?[[-110,-185],[20,-185],[-240,-185],[-110,-105],[-110,25]]:[[-110,-105],[20,-105],[-240,-105],[-110,-185],[-110,25]]
    if(old&&old.selected===item.selected)offsets.unshift([old.left-old.x,old.top-old.y])
    for(const [dx,dy] of offsets) {
      const rect={x:Math.max(8,Math.min(width-228,item.x+dx!)),y:item.y+dy!,width:220,height:82}
      if(rect.y<65||rect.y+rect.height>height-130||occupied.some(other=>intersects(rect,other)))continue
      placed.push({...item,left:rect.x,top:rect.y});occupied.push(rect);break
    }
  }
  return placed
}
