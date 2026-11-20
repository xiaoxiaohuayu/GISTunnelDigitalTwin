import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultProject, projectErrors } from '../src/engines/projectConfig.ts'
import { wallOffset, roadHalfWidth } from '../src/engines/assetPlacement.ts'
import { normalizeHeading, snapHeading, snapScale, snapTunnelPosition } from '../src/engines/tunnelSnap.ts'

test('snapTunnelPosition respects none, grid and semantic surface modes', () => {
  const project = defaultProject()
  const bore = project.bores[0]!

  // Free mode without shift preserves raw numbers.
  const raw = snapTunnelPosition(bore, { chainage: 123.456, lateral: 1.234, height: 4.321 }, 'none')
  assert.equal(raw.chainage, 123.456)
  assert.equal(raw.lateral, 1.234)
  assert.equal(raw.snappedLabels.length, 0)

  // Grid mode snaps chainage to 1m and lateral/height to 0.1m.
  const grid = snapTunnelPosition(bore, { chainage: 123.6, lateral: 1.24, height: 4.37 }, 'grid')
  assert.equal(grid.chainage, 124)
  assert.equal(grid.lateral, 1.2)
  assert.equal(grid.height, 4.4)

  // Surface mode snaps near right wall and arch crown.
  const wall = wallOffset(bore)
  const surfaceWall = snapTunnelPosition(bore, { chainage: 200.4, lateral: wall - 0.2, height: 6.5 }, 'surface')
  assert.equal(surfaceWall.chainage, 200)
  assert.equal(surfaceWall.lateral, Math.round(wall * 1000) / 1000)
  assert.equal(surfaceWall.height, 6.68)
  assert.ok(surfaceWall.snappedLabels.includes('右墙'))
  assert.ok(surfaceWall.snappedLabels.includes('拱顶'))

  // Surface mode snaps near left kerb and roadway.
  const kerb = roadHalfWidth(bore)
  const surfaceKerb = snapTunnelPosition(bore, { chainage: 50.2, lateral: -kerb + 0.15, height: 0.2 }, 'surface')
  assert.equal(surfaceKerb.lateral, -kerb)
  assert.equal(surfaceKerb.height, 0)
  assert.ok(surfaceKerb.snappedLabels.includes('左路缘'))
  assert.ok(surfaceKerb.snappedLabels.includes('路面'))
})

test('snapHeading and snapScale handle grid, surface and bounds', () => {
  assert.equal(normalizeHeading(270), -90)
  assert.equal(snapHeading(43, 'surface'), 45)
  assert.equal(snapHeading(22, 'grid'), 15)
  assert.equal(snapHeading(23, 'grid'), 30)

  assert.equal(snapScale(1.04, 'surface'), 1)
  assert.equal(snapScale(1.48, 'surface'), 1.5)
  assert.equal(snapScale(1.24, 'grid'), 1.2)
  assert.equal(snapScale(10, 'none'), 4)
  assert.equal(snapScale(0.05, 'none'), 0.25)
})

test('projectErrors validates optional AssetRecord scale range', () => {
  const project = defaultProject()
  project.assets = [
    { id: 'cam-1', code: 'CAM-1', name: '枪机', kind: 'camera', boreId: 'bore-1', chainage: 100, lateral: 0, height: 4, heading: 0, scale: 1.5 },
  ]
  assert.deepEqual(projectErrors(project), [])

  project.assets[0]!.scale = 5
  assert.ok(projectErrors(project).some(msg => msg.includes('缩放比例')))
})
