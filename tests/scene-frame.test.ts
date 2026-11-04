import test from 'node:test'
import assert from 'node:assert/strict'
import { boreTravelLabel, portalEndName, travelBearingDegrees, travelHeadingRadians, travelModelYaw, travelPitchRadians } from '../src/engines/sceneFrame.ts'

test('east-west demo keeps portal names, camera heading and model yaw', () => {
  assert.equal(portalEndName(90, 0), '西洞口')
  assert.equal(portalEndName(90, 1), '东洞口')
  assert.equal(travelBearingDegrees(90, 1), 90)
  assert.equal(travelBearingDegrees(90, -1), 270)
  assert.ok(Math.abs(travelHeadingRadians(90, 1) - Math.PI / 2) < 1e-12)
  assert.ok(Math.abs(travelHeadingRadians(90, -1) - Math.PI * 1.5) < 1e-12)
  assert.equal(travelModelYaw(90, 1), 0)
  assert.ok(Math.abs(travelModelYaw(90, -1) - Math.PI) < 1e-12)
  assert.ok(travelPitchRadians(1.42, 1) > 0)
  assert.ok(travelPitchRadians(1.42, -1) < 0)
  assert.equal(boreTravelLabel('上行洞', 90, 1), '上行洞 · 向东')
  assert.equal(boreTravelLabel('下行洞', 90, -1, '行驶'), '下行洞 · 向西行驶')
})

test('a northbound bore is labeled from its bearing, not from tube index', () => {
  assert.equal(portalEndName(0, 0), '南洞口')
  assert.equal(portalEndName(0, 1), '北洞口')
  assert.equal(travelBearingDegrees(0, 1), 0)
  assert.equal(travelBearingDegrees(0, -1), 180)
  assert.ok(Math.abs(travelModelYaw(0, 1) - Math.PI / 2) < 1e-12)
  assert.ok(Math.abs(travelModelYaw(0, -1) + Math.PI / 2) < 1e-12)
  assert.equal(boreTravelLabel('左洞', 0, 1), '左洞 · 向北')
})
