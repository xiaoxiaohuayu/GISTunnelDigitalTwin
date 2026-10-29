import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickedDevice } from '../src/engines/devicePicking.ts'
import type { SceneDevice } from '../src/engines/tunnelSystemsState.ts'
const devices:SceneDevice[]=[
  {id:'street-1',kind:'street',tube:0,station:-228,lateral:0,height:8,pickId:'portal-structures:0/streetlight.001'},
  {id:'street-27',kind:'street',tube:1,station:2200,lateral:0,height:8,pickId:'portal-structures:1/streetlight.001'},
  {id:'substation-1',kind:'substation',tube:0,station:-110,lateral:12,height:2.4},
  {id:'vms-17',kind:'vms',tube:0,station:-172,lateral:0,height:7.05},
]
test('combined portal lamp nodes resolve independently at both portals',()=>{
  for(const [end,id] of [[0,'street-1'],[1,'street-27']] as const)assert.equal(pickedDevice({id:`portal-structures:${end}`,detail:{node:{node:{name:'streetlight.001'}}}},devices)?.id,id)
  assert.equal(pickedDevice({id:'portal-structures:0',detail:{node:{node:{name:'structures / Galvanised guardrail'}}}},devices),undefined)
})
test('substation model, VMS surface and entity IDs select the registered device',()=>{
  assert.equal(pickedDevice({id:'substation-1'},devices)?.kind,'substation')
  assert.equal(pickedDevice({id:{id:'vms-17'}},devices)?.kind,'vms')
  assert.equal(pickedDevice({id:'device-part:vms-17:0'},devices)?.id,'vms-17')
  assert.equal(pickedDevice(undefined,devices),undefined)
})

test('portal lamp pick IDs and positions match the shipped GLB nodes',async()=>{
  const {readFileSync}=await import('node:fs')
  const layout=JSON.parse(readFileSync(new URL('../src/config/portalLamps.json',import.meta.url),'utf8'))
  const bytes=readFileSync(new URL('../src/assets/modelAssets/portal/portal-structures.glb',import.meta.url))
  const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const lamps=gltf.nodes.filter((node:{name:string})=>node.name?.startsWith('streetlight.'))
  assert.equal(layout.length,lamps.length)
  for(const lamp of layout){
    const node=lamps.find((node:{name:string})=>node.name===lamp.node)
    assert.ok(node,lamp.node)
    assert.ok(Math.abs(lamp.x-node.translation[0])<.01)
    assert.ok(Math.abs(lamp.y+node.translation[2])<.01)
  }
})
