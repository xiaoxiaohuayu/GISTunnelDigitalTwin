import test from 'node:test'
import assert from 'node:assert/strict'
import { activeDeviceAlerts } from '../src/engines/deviceTelemetry.ts'
import { initialSystems, changeSystems, incidentStation } from '../src/engines/tunnelSystemsState.ts'
import type { SceneDevice } from '../src/engines/tunnelSystemsState.ts'
const devices:SceneDevice[]=[
  {id:'fan-1',kind:'fan',tube:0,station:80,lateral:0,height:6.68},
  {id:'fan-2',kind:'fan',tube:1,station:80,lateral:0,height:6.68},
  {id:'camera-1',kind:'camera',tube:0,station:75,lateral:4.5,height:4.5},
]
test('fan fault persists independently of selection until recovery and never treats idle fans as faulty',()=>{
  assert.deepEqual(activeDeviceAlerts(devices,initialSystems,1900),[])
  const faulty=changeSystems(initialSystems,{deviceAlarm:'fan'})
  for(let i=0;i<3;i++)assert.deepEqual(activeDeviceAlerts(devices,faulty,1900).map(a=>a.device.id),['fan-1'])
  const alert=activeDeviceAlerts(devices,faulty,1900)[0]!
  assert.equal(alert.value,'0 r/min');assert.equal(alert.device.station,80)
  assert.deepEqual(activeDeviceAlerts(devices,changeSystems(faulty,{deviceAlarm:'none',fans:false}),1900),[])
})
test('camera offline and incident sensors use the same severity as device readings and clear on recovery',()=>{
  assert.equal(activeDeviceAlerts(devices,changeSystems(initialSystems,{deviceAlarm:'camera'}),1900)[0]?.device.id,'camera-1')
  const fire=changeSystems(initialSystems,{incident:'fire',incidentTube:1})
  const station=incidentStation(1900,fire)
  const sensors:SceneDevice[]=[0,1].map(tube=>({id:`flame-${tube+1}`,kind:'flame',tube,station,lateral:4.5,height:4}))
  assert.deepEqual(activeDeviceAlerts(sensors,fire,1900).map(a=>a.device.id),['flame-2'])
  assert.deepEqual(activeDeviceAlerts(sensors,changeSystems(fire,{incident:'none'}),1900),[])
})
