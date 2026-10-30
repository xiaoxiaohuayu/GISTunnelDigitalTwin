export interface TunnelViewPoint { station:number; lateral:number; height:number }
export interface TunnelVisibilityGeometry {
  length:number; spacing:number; wallsVisible:boolean; shuttersOpen:boolean
  passages:readonly {station:number;halfWidth:number;height:number;archRise:number}[]
  shutterOpen?:(index:number)=>boolean
  boreCount?:number
  radiusAt?:(tube:number)=>number
  lengthAt?:(tube:number)=>number
  widthAt:(station:number,tube:number)=>number
}
// Test the segment against the same bore/lay-by/cross-passage envelope as the lining.
// This deliberately avoids framebuffer reads in the render loop.
export function liningBlocksSight(from:TunnelViewPoint,to:TunnelViewPoint,geometry:TunnelVisibilityGeometry):boolean {
  if(!geometry.wallsVisible)return false
  const distance=Math.hypot(to.station-from.station,to.lateral-from.lateral,to.height-from.height)
  const steps=Math.max(1,Math.ceil(distance))
  for(let step=1;step<steps;step++) {
    const t=step/steps,s=from.station+(to.station-from.station)*t
    if(s< -60||s>geometry.length+60)continue
    const y=from.lateral+(to.lateral-from.lateral)*t,z=from.height+(to.height-from.height)*t
    let inside=false
    for(let tube=0;tube<(geometry.boreCount??2);tube++) {
      if(s> (geometry.lengthAt?.(tube)??geometry.length)+60)continue
      const width=geometry.widthAt(s,tube),outer=tube===0?-1:1
      const center=tube*geometry.spacing+outer*width/2,radius=(geometry.radiusAt?.(tube)??5.5)+width/2
      const lateral=(y-center)/radius
      if(z>=-.15&&Math.abs(lateral)<=1.025&&z<=2.5+5.5*Math.sqrt(Math.max(0,1-lateral*lateral))+.15){inside=true;break}
    }
    if(!inside&&y>=5.35&&y<=geometry.spacing-5.35)inside=geometry.passages.some((p,index)=>{
      if(!(geometry.shutterOpen?.(index)??geometry.shuttersOpen))return false
      const offset=(s-p.station)/p.halfWidth
      return Math.abs(offset)<=1&&z>=-.15&&z<=p.height+p.archRise*Math.sqrt(1-offset*offset)+.15
    })
    if(!inside)return true
  }
  return false
}
