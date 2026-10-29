import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Quaternion, Vector3 } from 'three'
import { advanceLampPower, streetlightHead } from '../src/engines/portalStreetlights.ts'

test('lamp power visibly ramps, reverses from its current level and reaches exact on/off endpoints',()=>{
  assert.equal(advanceLampPower(0,1,210),.5)
  assert.equal(advanceLampPower(.5,1,210),1)
  assert.equal(advanceLampPower(.5,0,105),.25)
  assert.equal(advanceLampPower(.25,0,1000),0)
  assert.equal(advanceLampPower(0,1,-1),0)
})
test('halos align with the emissive head of every shipped pole, including reversed single arms',()=>{
  const bytes=readFileSync(new URL('../src/assets/modelAssets/portal/portal-structures.glb',import.meta.url))
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const lamps=JSON.parse(readFileSync(new URL('../src/config/portalLamps.json',import.meta.url),'utf8'))
  for(const lamp of lamps){
    const node=doc.nodes.find((n:any)=>n.name===lamp.node),mesh=doc.meshes[node.mesh]
    const light=mesh.primitives.find((p:any)=>doc.materials[p.material].name==='lights')
    const bounds=doc.accessors[light.attributes.POSITION]
    const center=new Vector3().fromArray(bounds.min).add(new Vector3().fromArray(bounds.max)).multiplyScalar(.5)
    center.applyQuaternion(new Quaternion().fromArray(node.rotation??[0,0,0,1])).add(new Vector3().fromArray(node.translation))
    const head=streetlightHead(lamp)
    assert.ok(Math.abs(head.x-center.x)<.015,lamp.node)
    assert.ok(Math.abs(head.y+center.z)<.015,lamp.node)
    assert.ok(Math.abs(head.z-center.y)<.015,lamp.node)
  }
})
