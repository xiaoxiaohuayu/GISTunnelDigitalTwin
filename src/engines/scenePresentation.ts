import type { LoadProgress, OverlayRect, PlacedOverlay, SceneOverlay, VehicleInfo } from '../types/scene.ts'

export function createLoadReporter(emit:(progress:LoadProgress)=>void) {
  let percent=0
  return (next:number,stage:string,resource='') => {
    percent=Math.max(percent,Math.min(100,next))
    emit({percent:Math.round(percent),stage,resource})
  }
}
export const trafficShowDistance=650
export function vehicleInfo(index:number):VehicleInfo {
  const plateColor=index%5===0?'黄牌':index%3===0?'绿牌':'蓝牌'
  return {id:`traffic-${index+1}`,plate:`新${String.fromCharCode(65+index%4)}${String(12345+index*137).padStart(5,'0')}${plateColor==='绿牌'?'D':''}`,plateColor,vehicleType:'客一'}
}
export function layoutOverlays(items:SceneOverlay[],width:number,height:number,blocked:OverlayRect[],previous:PlacedOverlay[]=[]):PlacedOverlay[] {
  const placed:PlacedOverlay[]=[], occupied=[...blocked]
  const previousById=new Map(previous.map((item,index)=>[item.id,{item,index}]))
  const intersects=(a:OverlayRect,b:OverlayRect)=>a.x<b.x+b.width+8&&a.x+a.width+8>b.x&&a.y<b.y+b.height+8&&a.y+a.height+8>b.y
  const rank=(a:SceneOverlay,b:SceneOverlay)=>Number(b.selected)-Number(a.selected)||Number(b.severity!=='normal')-Number(a.severity!=='normal')||(previousById.get(a.id)?.index??Infinity)-(previousById.get(b.id)?.index??Infinity)||a.distance-b.distance
  const onScreen=(item:SceneOverlay)=>item.x>=0&&item.x<=width&&item.y>=0&&item.y<=height
  const candidates=items.filter(item=>onScreen(item)&&(item.plateColor?item.distance<=trafficShowDistance:item.distance<=150))
  const place=(item:SceneOverlay,force:boolean)=>{
    const old=previousById.get(item.id)?.item
    const offsets=item.selected?[[-110,-185],[20,-185],[-240,-185],[-110,-105],[-110,25]]:[[-110,-105],[20,-105],[-240,-105],[-110,-185],[-110,25]]
    if(force)for(let row=2;row<=8;row++)for(const dx of [-110,20,-240,130])offsets.push([dx,-105-row*90])
    if(old&&old.selected===item.selected)offsets.unshift([old.left-old.x,old.top-old.y])
    for(const [dx,dy] of offsets) {
      const rect={x:Math.max(8,Math.min(width-228,item.x+dx!)),y:item.y+dy!,width:220,height:82}
      if(rect.y<65||rect.y+rect.height>height-130||occupied.some(other=>intersects(rect,other)))continue
      placed.push({...item,left:rect.x,top:rect.y});occupied.push(rect);return
    }
    if(!force)return
    const [dx,dy]=offsets[0]!
    const rect={x:Math.max(8,Math.min(width-228,item.x+dx!)),y:Math.max(65,Math.min(height-212,item.y+dy!)),width:220,height:82}
    placed.push({...item,left:rect.x,top:rect.y});occupied.push(rect)
  }
  const readings=candidates.filter(item=>!item.plateColor).sort(rank)
  for(const item of readings){if(placed.length===4)break;place(item,false)}
  for(const item of candidates.filter(item=>item.plateColor).sort(rank))place(item,true)
  return placed
}
