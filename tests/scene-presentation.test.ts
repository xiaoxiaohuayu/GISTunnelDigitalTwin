import test from 'node:test'
import assert from 'node:assert/strict'
import { createLoadReporter, layoutOverlays, vehicleInfo } from '../src/engines/scenePresentation.ts'
import { defaultPortalSign, validPortalSign } from '../src/engines/portalSignConfig.ts'
import type { SceneOverlay } from '../src/types/scene.ts'
const item=(id:string,x=400,y=400,distance=20):SceneOverlay=>({id,x,y,distance,title:id,value:'12 ppm',status:'正常',severity:'normal',selected:false})
test('initialization progress never reverses, caps at 100 and preserves current resource',()=>{
  const values:{percent:number;resource:string}[]=[]
  const report=createLoadReporter(value=>values.push(value))
  report(25,'地形','terrain');report(20,'模型','camera');report(110,'完成')
  assert.deepEqual(values.map(value=>value.percent),[25,25,100]);assert.equal(values[1]!.resource,'camera')
})
test('all 24 cars keep unique identities and plate color and class across laps',()=>{
  const first=Array.from({length:24},(_,i)=>vehicleInfo(i)),next=Array.from({length:24},(_,i)=>vehicleInfo(i))
  assert.deepEqual(first,next);assert.equal(new Set(first.map(v=>v.plate)).size,24)
  assert.ok(first.every(v=>['蓝牌','黄牌','绿牌'].includes(v.plateColor)&&v.vehicleType==='客一'))
})
test('overlay layout hides distant and offscreen targets and avoids drawer, edges and other cards',()=>{
  const blocked=[{x:650,y:65,width:326,height:600}]
  const placed=layoutOverlays([item('one'),item('two',420),item('far',450,400,151),item('behind',-1)],1000,800,blocked)
  assert.equal(placed.length,2)
  for(const p of placed){assert.ok(p.left>=8&&p.left+220<650);assert.ok(p.top>=65&&p.top+82<=670)}
  const [a,b]=placed;assert.ok(Math.abs(a!.left-b!.left)>=228||Math.abs(a!.top-b!.top)>=90)
})
test('selected and alarm targets take priority and floating card count stays bounded',()=>{
  const data=Array.from({length:40},(_,i)=>item(`item-${i}`,150+i%8*260,200+Math.floor(i/8)*190,1+i))
  data[39]!.selected=true;data[38]!.severity='alarm'
  const placed=layoutOverlays(data,2400,1300,[])
  assert.equal(placed[0]!.id,'item-39');assert.equal(placed[1]!.id,'item-38');assert.ok(placed.length<=4)
})
test('sign configuration accepts browser structured-clone data and rejects missing images and invalid content',()=>{
  const defaults=defaultPortalSign();assert.ok(validPortalSign(structuredClone(defaults)))
  assert.equal(defaults.length,'');assert.equal(defaults.name,'青山隧道')
  assert.equal(validPortalSign({...defaults,mode:'image'}),false)
  assert.ok(validPortalSign(structuredClone({...defaults,mode:'mixed',image:new Blob(['image'],{type:'image/png'})})))
  assert.ok(validPortalSign({mode:'text',name:'旧标牌',length:''}))
  assert.equal(validPortalSign({...defaults,subtitle:42}),false)
  assert.equal(validPortalSign({...defaults,notice:'超'.repeat(31)}),false)
  assert.equal(validPortalSign({...defaults,name:''}),false);assert.equal(validPortalSign({mode:'other'}),false)
})

test('cards keep their existing slots when nearby vehicles swap distance order',()=>{
  const first=layoutOverlays([item('one',400,400,20),item('two',420,400,21)],1000,800,[])
  const next=layoutOverlays([item('one',401,400,22),item('two',419,400,19)],1000,800,[],first)
  assert.deepEqual(next.map(v=>v.id),first.map(v=>v.id))
  for(const p of next){const old=first.find(v=>v.id===p.id)!;assert.equal(p.left-p.x,old.left-old.x);assert.equal(p.top-p.y,old.top-old.y)}
})
test('a drawer can invalidate an old slot without leaving a card underneath it',()=>{
  const first=layoutOverlays([item('one',700,400)],1000,800,[])
  const next=layoutOverlays([item('one',700,400)],1000,800,[{x:650,y:65,width:326,height:600}],first)
  assert.ok(next.every(p=>p.left+220<=650))
})

test('persistent alerts reserve space even when the camera points elsewhere',()=>{
  const blocked=[{x:620,y:72,width:360,height:145}]
  const placed=layoutOverlays([item('normal',700,240),{...item('selected',700,260),selected:true}],1000,800,blocked)
  for(const p of placed)assert.ok(p.left+220<=620||p.top>=225)
})

test('normal monitoring readings take the limited slots ahead of passing traffic',()=>{
  const vehicles=Array.from({length:8},(_,i)=>({...item(`car-${i}`,250+i%4*300,300+Math.floor(i/4)*200),plateColor:'蓝牌' as const}))
  const placed=layoutOverlays([...vehicles,item('CO',700,600)],1600,1000,[])
  assert.equal(placed[0]?.id,'CO')
  assert.ok(placed.length<=4)
})
