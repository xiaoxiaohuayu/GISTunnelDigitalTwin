import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EXTERIOR_ORBIT_CONSTRAINTS,
  INTERIOR_ORBIT_CONSTRAINTS,
  UNDERGROUND_ORBIT_CONSTRAINTS,
  applyOrbitRotate,
  applyOrbitZoom,
  clampTargetElevation,
  computePanScale,
} from '../src/engines/orbitCameraMath.ts'

test('applyOrbitRotate prevents flipping underneath the tunnel in exterior mode', () => {
  const initial = { heading: 0, pitch: -0.3, range: 200 }
  // Dragging upward aggressively should clamp at maxPitch (-3 deg), never looking up from underground.
  const tiltedUp = applyOrbitRotate(initial, 0, -5000, EXTERIOR_ORBIT_CONSTRAINTS)
  assert.equal(tiltedUp.pitch, EXTERIOR_ORBIT_CONSTRAINTS.maxPitch)
  assert.ok(tiltedUp.pitch < 0)

  // Dragging downward aggressively clamps at minPitch (-86 deg).
  const tiltedDown = applyOrbitRotate(initial, 0, 5000, EXTERIOR_ORBIT_CONSTRAINTS)
  assert.equal(tiltedDown.pitch, EXTERIOR_ORBIT_CONSTRAINTS.minPitch)

  // Interior mode allows looking upward at ceiling fans/VMS while still bounding pitch.
  const interiorUp = applyOrbitRotate(initial, 0, -5000, INTERIOR_ORBIT_CONSTRAINTS)
  assert.equal(interiorUp.pitch, INTERIOR_ORBIT_CONSTRAINTS.maxPitch)
  assert.ok(interiorUp.pitch > 0)

  // Underground mode allows inspecting tunnel underside.
  const undergroundUp = applyOrbitRotate(initial, 0, -5000, UNDERGROUND_ORBIT_CONSTRAINTS)
  assert.equal(undergroundUp.pitch, UNDERGROUND_ORBIT_CONSTRAINTS.maxPitch)
})

test('applyOrbitZoom scales range smoothly and respects min/max bounds', () => {
  const initial = { heading: 1, pitch: -0.4, range: 100 }
  const zoomedIn = applyOrbitZoom(initial, -120, EXTERIOR_ORBIT_CONSTRAINTS)
  assert.ok(zoomedIn.range < initial.range)
  const zoomedOut = applyOrbitZoom(initial, 120, EXTERIOR_ORBIT_CONSTRAINTS)
  assert.ok(zoomedOut.range > initial.range)

  // Extreme zoom in/out clamps strictly.
  let state = initial
  for (let i = 0; i < 40; i += 1) state = applyOrbitZoom(state, -400, EXTERIOR_ORBIT_CONSTRAINTS)
  assert.equal(state.range, EXTERIOR_ORBIT_CONSTRAINTS.minRange)

  for (let i = 0; i < 60; i += 1) state = applyOrbitZoom(state, 400, EXTERIOR_ORBIT_CONSTRAINTS)
  assert.equal(state.range, EXTERIOR_ORBIT_CONSTRAINTS.maxRange)
})

test('computePanScale scales with distance and clampTargetElevation blocks dropping below floor', () => {
  const closeScale = computePanScale(20, 1000)
  const farScale = computePanScale(200, 1000)
  assert.ok(farScale > closeScale * 9)

  assert.equal(clampTargetElevation(690, 700, false, 0.2), 700.2)
  assert.equal(clampTargetElevation(710, 700, false, 0.2), 710)
  assert.equal(clampTargetElevation(680, 700, true, 0.2), 680)
})
