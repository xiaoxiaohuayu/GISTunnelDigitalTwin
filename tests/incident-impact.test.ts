import test from 'node:test'
import assert from 'node:assert/strict'
import { incidentImpact } from '../src/engines/incidentImpact.ts'
import { initialSystems, changeSystems, changeDevice } from '../src/engines/tunnelSystemsState.ts'
import type { SceneDevice } from '../src/engines/tunnelSystemsState.ts'

const devices:SceneDevice[]=[0,1].flatMap(tube=>[
  {id:`fan-${tube+1}`,kind:'fan' as const,tube,station:950,lateral:0,height:6},
  {id:`signal-${tube+1}`,kind:'signal' as const,tube,station:0,lateral:0,height:4},
  {id:`covi-${tube+1}`,kind:'covi' as const,tube,station:950,lateral:0,height:4},
])
test('incident impact reports the affected bore and the exact recovery readings',()=>{
  const state=changeSystems(initialSystems,{incident:'fire',incidentTube:1})
  const impact=incidentImpact(devices,state,1900)
  assert.deepEqual(impact.map(item=>item.device.id),['fan-2','signal-2','covi-2'])
  assert.equal(impact[0]!.active.value,'1480 r/min')
  assert.equal(impact[0]!.restored.value,'0 r/min')
  assert.equal(impact[1]!.active.value,'红灯')
  assert.equal(impact[1]!.restored.value,'绿灯')
  assert.equal(impact[2]!.active.severity,'alarm')
  assert.deepEqual(incidentImpact(devices,changeSystems(state,{incident:'none'}),1900),[])
})
test('manual settings and independent faults remain intact and are not presented as event recovery',()=>{
  let state=changeDevice(initialSystems,'fan-2',{enabled:true})
  state=changeDevice(state,'fan-1',{alarm:'fan'})
  state=changeSystems(state,{incident:'smoke',incidentTube:1})
  const impact=incidentImpact(devices,state,1900)
  assert.ok(!impact.some(item=>item.device.kind==='fan'))
  assert.equal(state.devices['fan-2']?.enabled,true)
  assert.equal(state.devices['fan-1']?.alarm,'fan')
})
