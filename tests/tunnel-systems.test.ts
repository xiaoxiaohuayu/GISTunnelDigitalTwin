import { test } from 'node:test'
import assert from 'node:assert/strict'
import { basicLampOn, changeSystems, crossPassages, enhancedZone, illuminationAt, initialSystems, laneSignal, incidentCatalog, incidentStation, entranceSignal, trafficSpeedFactor, informationMessage, trafficStopStations } from '../src/engines/tunnelSystemsState.ts'
test('PLC auto policy switches day/night/fog and manual preserves individual switches',()=>{
  for(const environment of ['night','fog'] as const){const s=changeSystems(initialSystems,{environment});assert.equal(s.basic,'all');assert.equal(s.street,true)}
  const manual=changeSystems(initialSystems,{plc:'manual',basic:'off',enhanced:false,street:false})
  assert.equal(changeSystems(manual,{environment:'night'}).basic,'off')
  assert.equal(changeSystems(manual,{plc:'auto'}).basic,'alternating')
})
test('day alternates physical fixtures; enhanced zones are exactly 50 m at both physical portals',()=>{
  assert.equal(basicLampOn(-50,initialSystems),true);assert.equal(basicLampOn(-42,initialSystems),false)
  for(const s of [-60,-10,1910,1960]) assert.equal(enhancedZone(s,1900),true)
  for(const s of [-60.01,-9.99,1909.99,1960.01,950]) assert.equal(enhancedZone(s,1900),false)
})
test('removing lighting energy actually darkens deep tunnel while retaining portal daylight spill',()=>{
  const off=changeSystems(initialSystems,{plc:'manual',basic:'off',enhanced:false,street:false})
  assert.ok(illuminationAt(900,1900,off)<.02)
  assert.ok(illuminationAt(900,1900,initialSystems)>.4)
  assert.ok(illuminationAt(-58,1900,off)>.5)
  assert.ok(illuminationAt(-58,1900,{...off,environment:'night'})<.08)
})
test('all reverse faces are red crosses; evacuation arrows face the median in either travel direction',()=>{
  for(const tube of [0,1])assert.equal(laneSignal(400,tube,1900,initialSystems,true),'cross')
  assert.equal(laneSignal(400,0,1900,initialSystems),'down')
  const fire=changeSystems(initialSystems,{incident:'fire'})
  assert.equal(laneSignal(25,0,1900,fire),'cross')
  assert.equal(laneSignal(475,0,1900,fire),'left')
  assert.equal(laneSignal(475,1,1900,fire),'down')
  assert.equal(fire.pumps,true);assert.equal(fire.fans,true);assert.equal(fire.shuttersOpen,true)
  const clear=changeSystems(fire,{incident:'none'});assert.equal(clear.broadcast,false);assert.equal(clear.entrance,'green')
})
test('middle passage accommodates vehicles, flanking passages pedestrians',()=>{
  const p=crossPassages(1900);assert.equal(p[1]!.halfWidth*2,7);assert.equal(p[1]!.height,4.8)
  assert.equal(p[0]!.halfWidth*2,4);assert.equal(p[2]!.vehicle,false)
})

test('incident routing can be moved to the down bore without closing the up bore',()=>{
  const s=changeSystems(initialSystems,{incident:'fire',incidentTube:1})
  assert.equal(laneSignal(475,1,1900,s),'left')
  assert.equal(laneSignal(25,1,1900,s),'cross')
  assert.equal(laneSignal(475,0,1900,s),'down')
  assert.equal(s.entrance,'green')
})


test('every video event clears its controls, affects only its bore and uses its own message',()=>{
  for(const definition of incidentCatalog)for(const tube of [0,1] as const){
    const state=changeSystems(initialSystems,{incident:definition.kind,incidentTube:tube})
    assert.equal(entranceSignal(1-tube,state),'green')
    assert.equal(informationMessage(1-tube,state),initialSystems.message)
    assert.equal(entranceSignal(tube,state),definition.closed?'red':definition.kind==='vehicle'?'green':'yellow')
    assert.ok(informationMessage(tube,state)!==initialSystems.message)
    assert.equal(state.broadcast,['fire','smoke','collision'].includes(definition.kind))
    if(definition.kind==='construction')assert.equal(laneSignal(475,tube,1900,state),'cross')
    const restored=changeSystems(state,{incident:'none'})
    assert.equal(restored.fans,false);assert.equal(restored.pumps,false);assert.equal(restored.broadcast,false)
    assert.equal(entranceSignal(tube,restored),'green')
  }
})
test('congestion slows one bore, rock is at the entrance, emergency occupancy is in the layby',()=>{
  const state=changeSystems(initialSystems,{incident:'congestion',incidentTube:1})
  assert.equal(trafficSpeedFactor(0,state),1);assert.equal(trafficSpeedFactor(1,state),.16)
  assert.equal(incidentStation(1900,{...state,incident:'rock',incidentTube:0}),-40)
  assert.equal(incidentStation(1900,{...state,incident:'rock'}),1940)
  assert.equal(incidentStation(1900,{...state,incident:'emergency'}),1900*.68)
})


test('queues release after event relocation and only the parked lane is held for parking',()=>{
  const parked=changeSystems(initialSystems,{incident:'parking'})
  assert.equal(trafficStopStations(0,0,1900,parked).length,1)
  assert.deepEqual(trafficStopStations(0,1,1900,parked),[])
  assert.deepEqual(trafficStopStations(1,0,1900,parked),[])
  const moved=changeSystems(parked,{incident:'rock',incidentTube:1})
  assert.deepEqual(trafficStopStations(0,0,1900,moved),[])
  assert.deepEqual(trafficStopStations(1,0,1900,moved),[1980,1986])
  const clear=changeSystems(moved,{incident:'none'})
  assert.deepEqual(trafficStopStations(1,0,1900,clear),[])
})
