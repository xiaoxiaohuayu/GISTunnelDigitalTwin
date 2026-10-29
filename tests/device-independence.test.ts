import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialSystems, changeDevice, changeSystems, deviceEnabled, deviceVms, deviceMessage, deviceLane, deviceEntrance, lightDeviceId } from '../src/engines/tunnelSystemsState.ts'
import { deviceTelemetry } from '../src/engines/deviceTelemetry.ts'
import type { SceneDevice } from '../src/engines/tunnelSystemsState.ts'
const device=(kind:SceneDevice['kind'],index=1,tube=0):SceneDevice=>({id:`${kind}-${index}`,kind,tube,station:100,lateral:-4.55,height:2})
test('each controllable device changes independently, including peers in the same bore',()=>{
  for(const kind of ['fan','pump','speaker','shutter','basic','enhanced','street','camera'] as const){
    const a=device(kind),b=device(kind,2),c=device(kind,3,1)
    const before=deviceEnabled(a,initialSystems)
    const state=changeDevice(initialSystems,a.id,{enabled:!before})
    assert.equal(deviceEnabled(a,state),!before,kind)
    assert.equal(deviceEnabled(b,state),deviceEnabled(b,initialSystems),`${kind} same bore`)
    assert.equal(deviceEnabled(c,state),deviceEnabled(c,initialSystems),`${kind} other bore`)
    assert.notEqual(deviceTelemetry(a,state,1900).status,deviceTelemetry(a,initialSystems,1900).status,kind)
  }
})
test('VMS content, size, font and motion are isolated and nested updates preserve prior settings',()=>{
  const a=device('vms'),b=device('vms',2),portal={...device('vms',17),portalEnd:0 as const}
  let state=changeDevice(initialSystems,a.id,{message:'仅第一块',vms:{width:8,color:'#00ff00',scroll:'up'}})
  state=changeDevice(state,b.id,{message:'第二块内容',vms:{fontSize:32}})
  state=changeDevice(state,a.id,{vms:{height:1.4}})
  assert.equal(deviceMessage(a,state),'仅第一块');assert.equal(deviceMessage(b,state),'第二块内容')
  assert.equal(deviceMessage(portal,state),initialSystems.message)
  assert.equal(deviceVms(a,state).color,'#00ff00');assert.equal(deviceVms(a,state).width,8)
  assert.equal(deviceVms(a,state).height,1.4);assert.equal(deviceVms(b,state).width,6.6)
  assert.equal(deviceVms(portal,state).fontSize,56)
  assert.equal(initialSystems.devices[a.id],undefined)
  const cleared=changeSystems(changeSystems(state,{incident:'fire'}),{incident:'none'})
  assert.equal(deviceMessage(a,cleared),'仅第一块');assert.equal(deviceMessage(b,cleared),'第二块内容')
})
test('traffic indications and incident-controlled devices do not affect the opposite bore',()=>{
  const state=changeDevice(changeDevice(initialSystems,'signal-1',{entrance:'red'}),'lane-1',{lane:'cross'})
  assert.equal(deviceEntrance(device('signal'),state),'red')
  assert.equal(deviceEntrance(device('signal',2,1),state),'green')
  assert.equal(deviceLane(device('lane'),1900,state),'cross')
  assert.equal(deviceLane(device('lane',2),1900,state),'down')
  const fire=changeSystems(initialSystems,{incident:'fire',incidentTube:1})
  assert.equal(deviceEnabled(device('fan',1,0),fire),false)
  assert.equal(deviceEnabled(device('fan',2,1),fire),true)
  assert.equal(deviceEnabled(device('speaker',1,0),fire),false)
  assert.equal(deviceEnabled(device('speaker',2,1),fire),true)
})
test('physical fixture IDs match catalogue ordering at both ends and both sides',()=>{
  assert.equal(lightDeviceId('basic',0,-50,-1,1900),'basic-1')
  assert.equal(lightDeviceId('basic',0,-50,1,1900),'basic-2')
  assert.equal(lightDeviceId('basic',1,-50,-1,1900),'basic-505')
  assert.equal(lightDeviceId('enhanced',0,-58,-1,1900),'enhanced-1')
  assert.equal(lightDeviceId('enhanced',0,1912,-1,1900),'enhanced-25')
  assert.equal(lightDeviceId('enhanced',1,-58,-1,1900),'enhanced-49')
})

test('individual lights change local lighting only and unrelated wind sensors stay independent',async()=>{
  const {illuminationAt}=await import('../src/engines/tunnelSystemsState.ts')
  const off=changeDevice(initialSystems,'basic-41',{enabled:false})
  assert.ok(illuminationAt(110,1900,off,0)<illuminationAt(110,1900,initialSystems,0))
  assert.equal(illuminationAt(110,1900,off,1),illuminationAt(110,1900,initialSystems,1))
  assert.equal(illuminationAt(500,1900,off,0),illuminationAt(500,1900,initialSystems,0))
  const wind={...device('wind'),station:150}
  const fanOn=changeDevice(initialSystems,'fan-1',{enabled:true})
  assert.equal(deviceTelemetry(wind,fanOn,1900).value,'3.2 m/s')
  assert.equal(deviceTelemetry({...wind,id:'wind-2',tube:1},fanOn,1900).value,'1.4 m/s')
})
test('closing one shutter blocks only its own passage and recovery preserves other controls',async()=>{
  const {passageShuttersOpen}=await import('../src/engines/tunnelSystemsState.ts')
  const closed=changeDevice(initialSystems,'shutter-1',{enabled:false})
  assert.equal(passageShuttersOpen(0,closed),false)
  assert.equal(passageShuttersOpen(1,closed),true)
  const fire=changeSystems(closed,{incident:'fire'})
  const clear=changeSystems(fire,{incident:'none'})
  assert.equal(passageShuttersOpen(0,clear),false)
})

test('multiple device faults coexist and clearing one does not clear another',async()=>{
  const {deviceAlarmIds}=await import('../src/engines/tunnelSystemsState.ts')
  let state=changeDevice(initialSystems,'fan-2',{enabled:true,alarm:'fan'})
  state=changeDevice(state,'camera-2',{alarm:'camera'})
  assert.deepEqual(deviceAlarmIds(state).sort(),['camera-2','fan-2'])
  assert.equal(deviceTelemetry(device('fan',2),state,1900).status,'设备故障')
  assert.equal(deviceTelemetry(device('fan',1),state,1900).status,'待机')
  assert.equal(deviceTelemetry(device('camera',2),state,1900).status,'通信离线')
  state=changeDevice(state,'fan-2',{alarm:'none'})
  assert.deepEqual(deviceAlarmIds(state),['camera-2'])
  assert.equal(deviceTelemetry(device('fan',2),state,1900).status,'运行中')
})
test('environment policies and traffic drills preserve manual device records',()=>{
  const state=changeDevice(changeDevice(initialSystems,'street-1',{enabled:true}),'basic-1',{enabled:false})
  const night=changeSystems(state,{environment:'night'})
  assert.equal(deviceEnabled(device('street'),night),true)
  assert.equal(deviceEnabled({...device('basic'),station:-50},night),false)
  assert.equal(deviceEnabled({...device('basic',2),station:-50},night),true)
  const clear=changeSystems(changeSystems(night,{incident:'fire'}),{incident:'none'})
  assert.deepEqual(clear.devices,state.devices)
})
