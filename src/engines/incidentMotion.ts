// Bounded, deterministic motion so incident props settle and reset on relocation.
export function workZoneLayout(tube:number) {
  const direction=tube===0?1:-1
  return {barrier:-17*direction,cones:[-18,-12,-6,0,6,12].map(s=>s*direction),workers:[3,9].map(s=>s*direction)}
}

export function fallingRock(elapsed:number,index:number,reduced=false) {
  const along=Math.floor(index/3)*1.6+(index%3-1)*1.25-1.2,lateral=-3.45+(index%3)*.62
  const time=Math.max(0,elapsed-index*.13),fallTime=Math.sqrt(2*(5.6-.25)/9.81)
  if(reduced||time>fallTime+2.8)return {along,lateral,height:.25,roll:.4+index*.31}
  const progress=Math.min(1,time/fallTime),bounce=Math.max(0,time-fallTime)
  return {along:along-1.4*(1-progress),lateral:lateral-.5*(1-progress),
    height:time<fallTime?5.6-4.905*time*time:.25+.42*Math.exp(-2.8*bounce)*Math.abs(Math.sin(10*bounce)),
    roll:(.4+index*.31)*progress}
}
