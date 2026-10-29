import { deviceTelemetry } from '../src/engines/deviceTelemetry.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultVmsDisplay, vmsOffset, vmsWidth, vmsHeight } from '../src/engines/vmsDisplay.ts'
import { changeSystems, informationMessage, initialSystems } from '../src/engines/tunnelSystemsState.ts'
test('VMS scroll moves in all four directions and repeats after the full text exits',()=>{
  for(const direction of ['left','right','up','down'] as const) {
    const display={...defaultVmsDisplay,scroll:direction,speed:60}
    const start=vmsOffset(display,1000,200,0),next=vmsOffset(display,1000,200,1)
    if(direction==='left')assert.equal(next.x,start.x-60)
    if(direction==='right')assert.equal(next.x,start.x+60)
    if(direction==='up')assert.equal(next.y,start.y-60)
    if(direction==='down')assert.equal(next.y,start.y+60)
    const cycle=(direction==='left'||direction==='right'?vmsWidth+1000:vmsHeight+200)/60
    const repeated=vmsOffset(display,1000,200,cycle)
    assert.ok(Math.abs(repeated.x-start.x)<1e-6)
    assert.ok(Math.abs(repeated.y-start.y)<1e-6)
  }
  assert.deepEqual(vmsOffset(defaultVmsDisplay,1000,200,999),{x:0,y:0})
})
test('VMS editing preserves blank content and custom styles across incident activation and recovery',()=>{
  const edited=changeSystems(initialSystems,{message:'',vms:{...defaultVmsDisplay,color:'#00ff00',scroll:'up',enabled:false}})
  assert.equal(informationMessage(0,edited),'')
  const fire=changeSystems(edited,{incident:'fire',incidentTube:1})
  assert.equal(informationMessage(0,fire),'')
  assert.match(informationMessage(1,fire),/火情/)
  const clear=changeSystems(fire,{incident:'none'})
  assert.equal(informationMessage(1,clear),'')
  assert.deepEqual(clear.vms,edited.vms)
})

test('VMS inspector distinguishes disabled, blank, and active content',()=>{
  const board={id:'vms-1',kind:'vms' as const,tube:0,station:65,lateral:0,height:0}
  assert.equal(deviceTelemetry(board,initialSystems,1900).status,'显示中')
  assert.equal(deviceTelemetry(board,{...initialSystems,message:''},1900).value,'空屏')
  const off={...initialSystems,vms:{...defaultVmsDisplay,enabled:false}}
  assert.equal(deviceTelemetry(board,off,1900).status,'已关闭')
  assert.equal(deviceTelemetry(board,off,1900).value,'黑屏')
})

test('physical dimensions change pixel area and scrolling limits without stretching font size',async()=>{
  const {vmsSize}=await import('../src/engines/vmsDisplay.ts')
  const wide={...defaultVmsDisplay,width:9.9,height:1.76,scroll:'left' as const}
  assert.deepEqual(vmsSize(wide),{width:1152,height:204})
  assert.equal(vmsOffset(wide,1200,204,0).x,1152)
  assert.equal(vmsOffset({...wide,scroll:'up'},1200,204,0).y,204)
  assert.equal(defaultVmsDisplay.dots,false)
})
