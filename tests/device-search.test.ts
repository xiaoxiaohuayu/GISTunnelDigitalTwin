import test from 'node:test'
import assert from 'node:assert/strict'
import { searchDevices } from '../src/engines/deviceSearch.ts'
import { initialSystems, changeDevice } from '../src/engines/tunnelSystemsState.ts'
import type { SceneDevice } from '../src/engines/tunnelSystemsState.ts'

const devices: SceneDevice[] = [
  {id:'fan-1',kind:'fan',tube:0,station:1000,lateral:0,height:6},
  {id:'fan-10',kind:'fan',tube:1,station:1200,lateral:0,height:6},
  {id:'covi-1',kind:'covi',tube:0,station:-40,lateral:0,height:4},
]
const find=(query='',tube:'all'|'0'|'1'='all',abnormal=false,state=initialSystems)=>searchDevices(devices,state,1900,query,tube,abnormal).map(item=>item.device.id)
test('search accepts exact IDs, names, direction and chainage without matching fan-10 for fan-1',()=>{
  assert.deepEqual(find('FAN-1'),['fan-1'])
  assert.deepEqual(find('风机 下行'),['fan-10'])
  assert.deepEqual(find('K1+000'),['fan-1'])
  assert.deepEqual(find('-40'),['covi-1'])
  assert.deepEqual(find('1000'),['fan-1'])
  assert.deepEqual(find('  '),devices.map(device=>device.id))
})
test('direction and abnormal filters compose, follow recovery and never treat standby as a fault',()=>{
  const state=changeDevice(initialSystems,'fan-10',{alarm:'fan'})
  assert.deepEqual(find('','all',true,state),['fan-10'])
  assert.deepEqual(find('','0',true,state),[])
  assert.deepEqual(find('风机','1',true,state),['fan-10'])
  assert.deepEqual(find('','all',true,changeDevice(state,'fan-10',{alarm:'none'})),[])
  assert.deepEqual(find('missing'),[])
})
