import { test } from 'node:test'
import assert from 'node:assert/strict'
import { changeSystems, initialSystems, incidentStation, incidentTelemetry } from '../src/engines/tunnelSystemsState.ts'
import type { DeviceKind, SceneDevice } from '../src/engines/tunnelSystemsState.ts'
const length=1900
const device=(kind:DeviceKind,tube=0,station=1030):SceneDevice=>({id:`${kind}-2`,kind,tube,station,lateral:0,height:2})

test('parking bay occupancy follows the incident bore and clears on release or relocation',()=>{
  const state=changeSystems(initialSystems,{incident:'emergency'})
  assert.equal(incidentTelemetry(device('layby'),state,length)?.value,'占用')
  assert.equal(incidentTelemetry(device('layby',1),state,length),undefined)
  const moved=changeSystems(state,{incidentTube:1})
  assert.equal(incidentTelemetry(device('layby'),moved,length),undefined)
  assert.equal(incidentTelemetry(device('layby',1),moved,length)?.value,'占用')
  assert.equal(incidentTelemetry(device('layby'),changeSystems(state,{incident:'none'}),length),undefined)
})
test('fire heats only nearby sensors in the affected bore, using the actual tunnel length',()=>{
  for(const size of [1900,2400])for(const tube of [0,1] as const){
    const state=changeSystems(initialSystems,{incident:'fire',incidentTube:tube})
    const station=incidentStation(size,state)
    for(const kind of ['fbg','humidity','flame'] as const){
      assert.equal(incidentTelemetry(device(kind,tube,station),state,size)?.severity,'alarm')
      assert.equal(incidentTelemetry(device(kind,1-tube,station),state,size),undefined)
      assert.equal(incidentTelemetry(device(kind,tube,station+121),state,size),undefined)
      assert.equal(incidentTelemetry(device(kind,tube,station),changeSystems(state,{incident:'none'}),size),undefined)
    }
  }
})
test('smoke affects visibility readings without inventing a fire or a temperature alarm',()=>{
  const state=changeSystems(initialSystems,{incident:'smoke'})
  assert.equal(incidentTelemetry(device('covi'),state,length)?.status,'能见度异常')
  assert.equal(incidentTelemetry(device('fbg'),state,length),undefined)
  assert.equal(incidentTelemetry(device('flame'),state,length),undefined)
  assert.equal(incidentTelemetry(device('covi',0,1251),state,length),undefined)
})
test('detectors reflect congestion and local road blockage without alarming the opposite bore',()=>{
  const jam=changeSystems(initialSystems,{incident:'congestion'})
  assert.equal(incidentTelemetry(device('detector'),jam,length)?.value,'9 km/h')
  assert.equal(incidentTelemetry(device('detector',1),jam,length),undefined)
  const fire=changeSystems(initialSystems,{incident:'fire'})
  assert.equal(incidentTelemetry(device('detector'),fire,length)?.value,'通行受阻')
  assert.equal(incidentTelemetry(device('detector',0,500),fire,length),undefined)
})
