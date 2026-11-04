import assert from 'node:assert/strict'
import test from 'node:test'
import { Cartesian3, Cartographic, Math as CesiumMath, Matrix4, Transforms } from 'cesium'
import { centerlineProject } from '../src/engines/centerlineProject.ts'
import { projectSurvey } from '../src/engines/projectSurvey.ts'
import type { TunnelSurvey } from '../src/types/tunnel.ts'

function sampledTubes(length: number, grade: number): TunnelSurvey {
  const frame = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(103.56, 30.91))
  const location = (x: number, y: number) => Cartographic.fromCartesian(Matrix4.multiplyByPoint(frame, new Cartesian3(x, y, 0), new Cartesian3()))
  const step = 50
  const count = length / step
  const floorStart = 900
  const tubes = [-12, 12].map(offset => Array.from({ length: count + 1 }, (_, index) => {
    const point = location((index - 16) * step, offset)
    point.height = floorStart + grade / 100 * index * step
    return Cartesian3.fromRadians(point.longitude, point.latitude, point.height)
  }))
  return { tubes, length, grade, minCover: 20, center: tubes[0]![Math.floor(count / 2)]! }
}

test('a surveyed east-west centerline becomes one project and stays within half a metre', () => {
  const terrain = sampledTubes(1900, 1.42)
  const project = centerlineProject(terrain, '青山隧道')
  assert.equal(project.origin.heading, 90)
  assert.equal(project.bores[0]!.offset, 12)
  assert.equal(project.bores[1]!.offset, -12)
  assert.equal(project.bores[0]!.laneWidth, 4.3)
  assert.equal(project.bores[0]!.end, 1900)
  const fitted = projectSurvey(project)
  let max = 0
  for (const [tube, points] of terrain.tubes.entries()) {
    const step = terrain.length / (points.length - 1)
    points.forEach((point, index) => {
      max = Math.max(max, Cartesian3.distance(point, fitted.actualPointAt!(tube, index * step, 0, 0)))
    })
  }
  assert.ok(max < 0.6, `centerline drifted ${max} m`)
  assert.ok(Cartesian3.distance(terrain.tubes[0]![0]!, fitted.actualPointAt!(0, 0, 0, 0)) < 0.05)
})
