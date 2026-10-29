import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fallingRock } from '../src/engines/incidentMotion.ts'

test('falling rocks start above the road, bounce without sinking and eventually stop',()=>{
  for(let index=0;index<7;index++) {
    assert.equal(fallingRock(0,index).height,5.6)
    for(let t=0;t<6;t+=.02)assert.ok(fallingRock(t,index).height>=.25-1e-9)
    assert.deepEqual(fallingRock(7,index),fallingRock(30,index))
    assert.equal(fallingRock(7,index).height,.25)
  }
})
test('all seven stones settle at distinct positions and reduced motion shows their final state',()=>{
  const positions=new Set<string>()
  for(let index=0;index<7;index++) {
    const pose=fallingRock(10,index)
    positions.add(`${pose.along}:${pose.lateral}`)
    assert.deepEqual(fallingRock(0,index,true),pose)
  }
  assert.equal(positions.size,7)
})
test('a newly triggered event restarts from its initial pose without retaining old animation state',()=>{
  const first=fallingRock(.4,2)
  fallingRock(20,2)
  assert.deepEqual(fallingRock(.4,2),first)
  assert.ok(fallingRock(0,2).height>fallingRock(.8,2).height)
})
