import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isRoadMarking, roadArrow, roadPaint } from '../src/engines/roadMarkings.ts'

test('painted arrows and lane lines stay white instead of taking the tunnel light',()=>{
  assert.equal(roadPaint,'#ffffff')
  for(const id of ['direction-arrow-0-1-80','lane-0-12-1','edge-1-1-24','bay-dash-0-40','bay-edge-0-48'])assert.equal(isRoadMarking(id),true)
  assert.equal(isRoadMarking('light-diffuser-0-1-8'),false)
  assert.equal(isRoadMarking('walkway-0-1-0'),false)
})
test('the arrow head follows the traffic direction in each bore',()=>{
  const up=roadArrow(0),down=roadArrow(1)
  assert.ok(up[5]![0]!>up[0]![0]!)
  assert.ok(down[5]![0]!<down[0]![0]!)
  assert.deepEqual(down,up.map(([x,y])=>[-x!,-y!]))
  for(const arrow of [up,down])assert.ok(arrow.every(([,y])=>Math.abs(y!)<=.85))
})
test('the shaft and arrow head both face upward after rotating for opposite traffic',()=>{
  for(const tube of [0,1])for(const [a,b,c] of [[0,1,2],[0,2,3],[4,5,6]]) {
    const vertices=roadArrow(tube),p=vertices[a!]!,q=vertices[b!]!,r=vertices[c!]!
    const cross=(q[0]!-p[0]!)*(r[1]!-p[1]!)-(q[1]!-p[1]!)*(r[0]!-p[0]!)
    assert.ok(cross>0)
  }
})
