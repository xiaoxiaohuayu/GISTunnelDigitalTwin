import assert from 'node:assert/strict'
import test from 'node:test'
import {
  computeAlignmentMetrics,
  computeEndPointFromVector,
  formatChainage,
} from '../src/studio/geometry/alignmentMath.ts'

test('computeAlignmentMetrics 与 computeEndPointFromVector 双向解算一致', () => {
  const start = { longitude: 103.8195, latitude: 30.6586, elevation: 520 }
  const end = computeEndPointFromVector(start, 1200, 75, 1.5)
  const metrics = computeAlignmentMetrics(start, end)

  assert.ok(Math.abs(metrics.horizontalLength - 1200) < 1, `水平长度偏差过大：${metrics.horizontalLength}`)
  assert.ok(Math.abs(metrics.headingDeg - 75) < 0.2, `方位角偏差过大：${metrics.headingDeg}`)
  assert.ok(Math.abs(metrics.gradePercent - 1.5) < 0.05, `纵坡偏差过大：${metrics.gradePercent}`)
})

test('formatChainage 正确格式化标准公路桩号', () => {
  assert.equal(formatChainage(10000), 'K10+000')
  assert.equal(formatChainage(10320), 'K10+320')
  assert.equal(formatChainage(85), 'K0+085')
})
