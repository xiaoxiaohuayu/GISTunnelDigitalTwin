import test from 'node:test'
import assert from 'node:assert/strict'
import { lightSampleRange, sampleLights, sampleUniforms, SAMPLE_LIGHT_LIMIT } from '../src/engines/tunnelLightSample.ts'
import { Material } from 'cesium'
import { initialSystems, changeDevice } from '../src/engines/tunnelSystemsState.ts'
import type { SceneDevice } from '../src/engines/tunnelSystemsState.ts'

const lamp=(id:string,tube=0):SceneDevice=>({id,kind:'basic',tube,station:450,lateral:4.2,height:4.65})
const position=(device:SceneDevice)=>({x:device.station-440,y:device.lateral,z:device.height})
const state={...initialSystems,plc:'manual' as const,basic:'all' as const}

test('matrix uniforms survive Fabric template reuse for both bores and subsequent rebuilds',()=>{
  for(let i=0;i<4;i++){
    const material=new Material({fabric:{type:'TunnelSampleMatrixRegression',uniforms:{u_eyeToSample:sampleUniforms().u_eyeToSample},source:'czm_material czm_getMaterial(czm_materialInput inputValue) { return czm_getDefaultMaterial(inputValue); }'}})
    assert.match(material.shaderSource,/uniform mat4 u_eyeToSample/)
    material.destroy()
  }
})

test('sample follows the default interior view and stays within a short bore',()=>{
  assert.deepEqual(lightSampleRange(1900),{start:440,length:100})
  assert.deepEqual(lightSampleRange(60),{start:0,length:60})
})

test('live longitudinal, lateral and height edits move the light without touching other lamps',()=>{
  const a=lamp('basic-101'),b=lamp('basic-102')
  const before=sampleLights([a,b],state,0,100,position)
  a.station+=7;a.lateral-=1;a.height-=.5
  const after=sampleLights([a,b],state,0,100,position)
  assert.deepEqual(after.find(l=>l.id===a.id),{id:a.id,x:17,y:3.2,z:4.15,power:1})
  assert.deepEqual(after.find(l=>l.id===b.id),before.find(l=>l.id===b.id))
})

test('individual dimming and off state affect only that lamp, and opposite bores do not leak',()=>{
  const devices=[lamp('basic-101'),lamp('basic-102'),lamp('basic-103',1)]
  const dim=changeDevice(state,'basic-101',{level:25})
  const selected=sampleLights(devices,dim,0,100,position)
  assert.equal(selected.find(l=>l.id==='basic-101')!.power,.25)
  assert.equal(selected.find(l=>l.id==='basic-102')!.power,1)
  assert.equal(selected.some(l=>l.id==='basic-103'),false)
  assert.deepEqual(sampleLights(devices,changeDevice(dim,'basic-101',{enabled:false}),0,100,position).map(l=>l.id),['basic-102'])
  assert.equal(sampleLights(devices,{...state,basic:'off'},0,100,position).length,0)
})

test('moving a light outside its influence range removes it and dense inventories have a stable bound',()=>{
  const devices=Array.from({length:80},(_,i)=>({...lamp(`basic-${i}`),station:440+i}))
  const first=sampleLights(devices,state,0,100,position)
  assert.equal(first.length,SAMPLE_LIGHT_LIMIT)
  assert.deepEqual(sampleLights([...devices].reverse(),state,0,100,position),first)
  assert.equal(sampleLights([{...lamp('moved'),station:570}],state,0,100,position).length,0)
})

test('explicitly enabled lamp still lights the sample when the default strategy is off',()=>{
  const device=lamp('basic-101')
  const off={...state,basic:'off' as const}
  assert.equal(sampleLights([device],changeDevice(off,device.id,{enabled:true,level:60}),0,100,position)[0]!.power,.6)
})
