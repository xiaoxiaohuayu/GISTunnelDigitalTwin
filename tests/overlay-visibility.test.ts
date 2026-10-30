import test from 'node:test'
import assert from 'node:assert/strict'
import { liningBlocksSight } from '../src/engines/overlayVisibility.ts'
import type { TunnelVisibilityGeometry } from '../src/engines/overlayVisibility.ts'
const geometry:TunnelVisibilityGeometry={length:1900,spacing:24,wallsVisible:true,shuttersOpen:false,passages:[{station:950,halfWidth:3,height:4.5,archRise:.8}],widthAt:()=>0}
const point=(station:number,lateral:number,height=2)=>({station,lateral,height})
test('same-bore traffic is visible while the other bore and outside roof views are occluded',()=>{
  assert.equal(liningBlocksSight(point(930,0),point(980,2.15),geometry),false)
  assert.equal(liningBlocksSight(point(930,0),point(980,24),geometry),true)
  assert.equal(liningBlocksSight(point(930,0,12),point(980,0),geometry),true)
})
test('cross-passage visibility follows the shutters and respects its opening height',()=>{
  assert.equal(liningBlocksSight(point(950,0),point(950,24),geometry),true)
  assert.equal(liningBlocksSight(point(950,0),point(950,24),{...geometry,shuttersOpen:true}),false)
  assert.equal(liningBlocksSight(point(950,0,6),point(950,24,6),{...geometry,shuttersOpen:true}),true)
})
test('lay-bys, portal approaches and hidden walls remain visible',()=>{
  assert.equal(liningBlocksSight(point(930,0),point(940,-7,2),{...geometry,widthAt:()=>3}),false)
  assert.equal(liningBlocksSight(point(-95,-4,7),point(-90,0,2),geometry),false)
  assert.equal(liningBlocksSight(point(930,0),point(980,24),{...geometry,wallsVisible:false}),false)
})

test('configured bore widths and a single bore do not use the old two-lane envelope',()=>{
  const wide={...geometry,boreCount:1,radiusAt:()=>9.8}
  assert.equal(liningBlocksSight(point(930,6),point(980,7),wide),false)
  assert.equal(liningBlocksSight(point(930,23),point(980,24),wide),true)
})
