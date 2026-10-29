import access from '../config/portalAccess.json' with { type: 'json' }

export interface FinishBox { material:'shoulder'|'channel'|'concrete'|'joint'|'metal';position:[number,number,number];size:[number,number,number] }
export interface FinishRock { position:[number,number,number];scale:[number,number,number];angle:number;template:number }
export function cliffRelief(y:number,z:number):number {
  const side=Math.max(0,1-(Math.abs(y)/100)**2)
  const top=1.8+side*(15+3*Math.sin(y*.08)+1.8*Math.sin(y*.22))
  const clearance=Math.min(Math.abs(y-12),Math.abs(y+12))
  const blend=Math.max(0,Math.min(1,(clearance-9.8)/4))*Math.max(0,Math.min(1,(top-z)/2))*Math.max(0,Math.min(1,(z+.3)/1.5))
  return blend*(1.2+.7*Math.sin(y*.17+z*.31)+.4*Math.sin(y*.43-z*.57)+.35*Math.cos(z*1.8+y*.09))
}
export function portalFinishLayout() {
  const boxes:FinishBox[]=[],rocks:FinishRock[]=[]
  const box=(material:FinishBox['material'],position:FinishBox['position'],size:FinishBox['size'])=>boxes.push({material,position,size})
  for(const center of [-12,12])for(const side of [-1,1]) {
    const inner=Math.sign(center)!==side
    const intervals=inner?[[-172,access.start],[access.end,-3]]:[[-172,-3]]
    for(const [start,end] of intervals) {
      const length=end!-start!,mid=(start!+end!)/2
      box('shoulder',[mid,center+side*5.35,.04],[length,.55,.16])
      box('channel',[mid,center+side*5.89,.015],[length,.45,.08])
      for(const edge of [-1,1])box('concrete',[mid,center+side*5.89+edge*.27,.055],[length,.09,.23])
      for(let x=start!+3;x<end!-1;x+=12){
        box('joint',[x,center+side*5.89,.165],[.7,.48,.025])
        for(let bar=-2;bar<=2;bar++)box('metal',[x+bar*.13,center+side*5.89,.184],[.035,.45,.025])
      }
    }
  }
  for(const center of [-12,12]) {
    // Recessed panel breaks stay outside the arch and the portal lettering.
    for(const offset of [-7.25,7.25])box('joint',[-1.526,center+offset,5.35],[.028,.026,10.4])
    for(const height of [2.5,5.6,8.55]) {
      const opening=height<=2.5?5.95:Math.sqrt(Math.max(0,5.95**2-(height-2.5)**2))
      for(const side of [-1,1]){
        const width=8.45-opening
        box('joint',[-1.526,center+side*(opening+width/2),height],[.028,width,.022])
      }
    }
    box('joint',[-1.92,center,10.56],[.045,17.4,.055])
    box('metal',[-1.99,center,11.0],[.07,17.7,.035])
    for(const side of [-1,1])box('shoulder',[-1.54,center+side*7.3,.18],[.035,2.3,.23])
  }
  let seed=271029
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)
  for(const center of [-72,-54,-37,0,32,49,70])for(let i=0;i<10;i++){
    const y=center+(random()-.5)*(center===0?2.2:9)
    const big=i<2
    rocks.push({position:[-1.3-random()*3.4,y,-.13-random()*.1],scale:[big?.8+random()*.4:.18+random()*.45,big?1+random()*.6:.25+random()*.6,big?.8+random()*.5:.2+random()*.45],angle:random()*Math.PI*2,template:rocks.length%3})
  }
  return {boxes,rocks}
}
