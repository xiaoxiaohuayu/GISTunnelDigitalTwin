import test from 'node:test'
import assert from 'node:assert/strict'
import { updateDrillHistory } from '../src/engines/drillHistory.ts'
const fan={key:'fan-1',name:'风机故障'},fire={key:'incident:fire:0',name:'火灾事件'}
test('retriggering a recovered event creates a new occurrence without reviving old history',()=>{
  const first=updateDrillHistory([],[fan],1000)
  const recovered=updateDrillHistory(first,[],4000)
  const repeated=updateDrillHistory(recovered,[fan],7000)
  assert.equal(first[0]!.endedAt,undefined)
  assert.equal(repeated.length,2)
  assert.equal(repeated[0]!.startedAt,7000)
  assert.equal(repeated[0]!.endedAt,undefined)
  assert.equal(repeated[1]!.endedAt,4000)
  assert.notEqual(repeated[0]!.id,repeated[1]!.id)
})
test('recovering one event preserves another active event and its original start time',()=>{
  const both=updateDrillHistory(updateDrillHistory([],[fan],1000),[fan,fire],2000)
  const next=updateDrillHistory(both,[fan],3000)
  assert.equal(next.find(r=>r.key===fan.key)!.startedAt,1000)
  assert.equal(next.find(r=>r.key===fan.key)!.endedAt,undefined)
  assert.equal(next.find(r=>r.key===fire.key)!.endedAt,3000)
  assert.equal(updateDrillHistory(next,[fan],5000).length,2)
})
