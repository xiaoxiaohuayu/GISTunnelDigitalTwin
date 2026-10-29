import { test } from 'node:test'
import assert from 'node:assert/strict'
import { workZoneLayout } from '../src/engines/incidentMotion.ts'
import { escapeSignDirection, crossPassages, radarHeading } from '../src/engines/tunnelSystemsState.ts'

test('the work barrier and cone taper are upstream for both travel directions',()=>{
  for(const tube of [0,1]) {
    const direction=tube===0?1:-1,layout=workZoneLayout(tube)
    assert.ok(layout.barrier*direction<0)
    assert.ok(layout.cones[0]!*direction<layout.cones.at(-1)!*direction)
    assert.ok(layout.workers.every(s=>s*direction>0))
  }
  const up=workZoneLayout(0),down=workZoneLayout(1)
  assert.deepEqual(down.cones,up.cones.map(s=>-s))
  assert.equal(down.barrier,-up.barrier)
})
test('each wall sign points to its nearest cross passage in world station coordinates',()=>{
  for(const length of [1900,2400])for(const tube of [0,1])for(const p of crossPassages(length))for(const offset of [-30,30]) {
    const station=p.station+offset,sign=escapeSignDirection(station,tube,length)
    // Left on the outer-wall face maps to +station in the up bore, -station in the down bore.
    const worldDirection=(sign==='left'?1:-1)*(tube===0?1:-1)
    assert.ok((p.station-station)*worldDirection>0)
  }
})
test('radar optical faces oppose approaching traffic rather than pointing at a side wall',()=>{
  for(const tube of [0,1]) {
    const angle=radarHeading(tube),direction=tube===0?1:-1
    assert.ok(Math.abs(Math.sin(angle)+direction)<1e-9)
    assert.ok(Math.abs(Math.cos(angle))<1e-9)
  }
})
