import test from 'node:test'
import assert from 'node:assert/strict'
import { Cartesian3, ConstantProperty, JulianDate, Matrix3, Matrix4, Quaternion, Transforms } from 'cesium'
import { computeSelectionBoxPose, computeSelectionRotation, deviceBoxOffset, deviceBoxSize } from '../src/engines/deviceBounds.ts'
import { initialSystems } from '../src/engines/tunnelSystemsState.ts'
import type { SceneDevice } from '../src/engines/tunnelSystemsState.ts'

test('ConstantProperty preserves full Quaternion w component across 0/90/180 deg rotations', () => {
  const pos = Cartesian3.fromDegrees(118.8, 32.1, 700)
  const base = Transforms.eastNorthUpToFixedFrame(pos)

  for (const deg of [0, 90, 180, -90]) {
    const rot = computeSelectionRotation(base, deg)
    const q = Quaternion.fromRotationMatrix(rot)
    const prop = new ConstantProperty(q)
    const read = prop.getValue(JulianDate.now()) as Quaternion
    assert.ok(Number.isFinite(read.w))
    const reconstructed = Matrix3.fromQuaternion(read)
    const origY = Matrix3.multiplyByVector(rot, Cartesian3.UNIT_Y, new Cartesian3())
    const readY = Matrix3.multiplyByVector(reconstructed, Cartesian3.UNIT_Y, new Cartesian3())
    assert.ok(Cartesian3.dot(origY, readY) > 0.9999)
  }
})

test('deviceBoxSize and deviceBoxOffset scale proportionally and reflect dynamic VMS size', () => {
  const vms: SceneDevice = { id: 'vms-18', kind: 'vms', tube: 1, station: -172, lateral: 0, height: 7.05, scale: 1 }
  const defaultBox = deviceBoxSize('vms', vms, initialSystems)
  assert.ok(defaultBox[1] > 6.5 && defaultBox[0] < 1.0)

  const customState = {
    ...initialSystems,
    devices: { 'vms-18': { vms: { width: 8.4, height: 1.4 } } },
  }
  const widerBox = deviceBoxSize('vms', vms, customState)
  assert.ok(widerBox[1] > defaultBox[1] + 1.5)
  assert.ok(widerBox[2] > defaultBox[2] + 0.4)

  const cabinet: SceneDevice = { id: 'cab-1', kind: 'cabinet', tube: 0, station: 100, lateral: -5, height: 0.45, scale: 2 }
  assert.deepEqual(deviceBoxOffset(cabinet), [0, 0, 1.5])
  assert.deepEqual(deviceBoxSize('cabinet', cabinet), [2.2, 1.2, 3.24])
})

test('computeSelectionBoxPose honors generic device.box offsetSpace (survey vs local) without kind special-casing', () => {
  const pos = Cartesian3.fromDegrees(118.8, 32.1, 700)
  const base = Transforms.eastNorthUpToFixedFrame(pos)
  const baseY = Matrix3.multiplyByVector(Matrix4.getMatrix3(base, new Matrix3()), Cartesian3.UNIT_Y, new Cartesian3())

  // Survey-space offset stays aligned with tunnel frame even when device heading is 180 deg.
  for (const [tube, heading, lateral] of [
    [0, 0, -5.1],
    [0, 0, 5.1],
    [1, 180, -5.1],
    [1, 180, 5.1],
  ] as const) {
    const compositeLamp: SceneDevice = {
      id: `street-${tube}`,
      kind: 'street',
      tube,
      station: -100,
      lateral,
      height: 7.8,
      heading,
      box: { size: [0.8, 2.0, 8.2], offset: [0, Math.sign(lateral) * 0.55, -3.75], offsetSpace: 'survey' },
    }
    const pose = computeSelectionBoxPose(base, pos, compositeLamp)
    const shift = Cartesian3.subtract(pose.position, pos, new Cartesian3())
    const alongSurveyY = Cartesian3.dot(shift, baseY)
    assert.equal(Math.sign(alongSurveyY), Math.sign(lateral))
    assert.ok(Math.abs(Math.abs(alongSurveyY) - 0.55) < 1e-4)
  }

  // Standalone streetlight.glb without custom device.box falls back cleanly to table profile (base origin z = 0..8m).
  const standaloneLamp: SceneDevice = { id: 'street-new', kind: 'street', tube: 0, station: -80, lateral: -5, height: 0, heading: 0 }
  assert.deepEqual(deviceBoxOffset(standaloneLamp), [0, 0, 4.0])
})
