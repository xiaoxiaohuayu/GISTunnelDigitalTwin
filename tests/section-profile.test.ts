import test from 'node:test'
import assert from 'node:assert/strict'
import { profileLateral, sectionErrors } from '../src/engines/sectionProfile.ts'
import { changeDevice, crossPassages, illuminationAt, initialSystems, laneSignal } from '../src/engines/tunnelSystemsState.ts'

test('widening keeps the kerb clearance in metres and scales only the carriageway', () => {
  assert.equal(profileLateral(4.3, 4.3), 4.3)
  assert.equal(profileLateral(5, 4.3), 5)
  assert.ok(Math.abs(profileLateral(2.15, 6.45) - 2.15 * 6.45 / 4.3) < 1e-12)
  assert.ok(Math.abs(profileLateral(-6, 6.45) - (-6 - (6.45 - 4.3))) < 1e-12)
  assert.deepEqual(sectionErrors({ templateHalf: 1 }), ['断面半宽须为 3～8 m'])
  assert.deepEqual(sectionErrors(undefined), [])
})

test('a moved lamp keeps its id and shifts the local dimming with it', () => {
  const off = changeDevice(initialSystems, 'basic-kept', { enabled: false })
  const home = [{ id: 'basic-kept', kind: 'basic' as const, tube: 0, station: 110 }]
  const moved = [{ id: 'basic-kept', kind: 'basic' as const, tube: 0, station: 800 }]
  assert.ok(illuminationAt(110, 1900, off, 0, home) < illuminationAt(110, 1900, initialSystems, 0, home))
  assert.equal(illuminationAt(800, 1900, off, 0, home), illuminationAt(800, 1900, initialSystems, 0, home))
  assert.ok(illuminationAt(800, 1900, off, 0, moved) < illuminationAt(800, 1900, initialSystems, 0, moved))
  assert.equal(illuminationAt(110, 1900, off, 0, moved), illuminationAt(110, 1900, initialSystems, 0, moved))
})

test('lane arrows follow the recorded cross-passage station', () => {
  const fire = { ...initialSystems, incident: 'fire' as const, incidentTube: 0 as const, fans: true, pumps: true, shuttersOpen: true, broadcast: true }
  const moved = crossPassages(1900, [{ station: 100, vehicle: false }, { station: 900, vehicle: true }, { station: 1600, vehicle: false }])
  assert.equal(laneSignal(100, 0, 1900, fire, false, moved), 'left')
  assert.equal(laneSignal(475, 0, 1900, fire, false, moved), 'cross')
  assert.equal(moved[1]!.halfWidth, 3.5)
})
