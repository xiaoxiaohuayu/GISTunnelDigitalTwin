import test from 'node:test'
import assert from 'node:assert/strict'
import { portalFinishLayout, cliffRelief } from '../src/engines/portalFinishLayout.ts'
test('approach drainage stays outside traffic lanes and leaves the median crossover open',()=>{
  const {boxes}=portalFinishLayout()
  const road=boxes.filter(box=>box.position[0]<-3)
  assert.ok(road.length>100)
  for(const box of road){
    const [x,y]=box.position,[length,width]=box.size
    assert.ok(Math.min(Math.abs(y-12),Math.abs(y+12))-width/2>5)
    if(Math.abs(y)<8)assert.ok(x+length/2<=-92||x-length/2>=-68)
  }
})
test('cliff relief preserves the portal collars and fades at the ground and crest',()=>{
  for(const y of [-20,-12,-4,4,12,20])for(const z of [0,4,8,12])assert.equal(cliffRelief(y,z),0)
  assert.equal(cliffRelief(45,-1),0)
  assert.equal(cliffRelief(45,40),0)
  assert.ok(cliffRelief(45,5)>.2)
  assert.ok(cliffRelief(45,5)<3)
})
test('new rock masses and toe rubble keep both portal facades clear and are deterministic',()=>{
  const {rocks}=portalFinishLayout()
  assert.deepEqual(portalFinishLayout().rocks,rocks)
  assert.ok(rocks.length>50)
  for(const rock of rocks){
    const halfWidth=1.1*rock.scale[2]+1.2*rock.scale[0]*Math.abs(Math.sin(rock.angle))
    assert.ok([-12,12].every(center=>Math.abs(rock.position[1]-center)-halfWidth>8.5))
    assert.ok(rock.scale.every(scale=>scale>0))
  }
})
