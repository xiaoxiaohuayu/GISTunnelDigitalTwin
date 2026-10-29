// @env browser
import { Cartesian3, Cartographic, Matrix4, sampleTerrainMostDetailed, Transforms } from 'cesium'
import type { TerrainProvider } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'

const STEP = 50
const COUNT = 65
const ROWS = 9

export async function surveyTunnel(terrain: TerrainProvider): Promise<TunnelSurvey> {
  const frame = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(103.56, 30.91))
  function location(x: number, y: number): Cartographic {
    return Cartographic.fromCartesian(Matrix4.multiplyByPoint(frame, new Cartesian3(x, y, 0), new Cartesian3()))
  }
  const samples = Array.from({ length: COUNT * ROWS }, (_, index) =>
    location((index % COUNT - 32) * STEP, (Math.floor(index / COUNT) - 4) * 200))
  await sampleTerrainMostDetailed(terrain, samples, true)
  if (samples.some(point => !Number.isFinite(point.height))) throw new Error('山区高程采样不完整，请重试')
  let best: { start: number; end: number; row: number; score: number } | undefined
  for (let row = 0; row < ROWS; row++) {
    for (let start = 0; start < COUNT - 20; start++) {
      for (let end = start + 20; end < COUNT; end++) {
        const a = samples[row * COUNT + start]!
        const b = samples[row * COUNT + end]!
        if (Math.abs(b.height - a.height) / ((end - start) * STEP) > 0.04) continue
        const cover = []
        for (let i = start + 2; i <= end - 2; i++) {
          const roof = a.height + (b.height - a.height) * (i - start) / (end - start) + 5
          cover.push(samples[row * COUNT + i]!.height - roof)
        }
        if (Math.min(...cover) < 12) continue
        const score = cover.reduce((sum, value) => sum + value, 0) / cover.length
        if (!best || score > best.score) best = { start, end, row, score }
      }
    }
  }
  if (!best) throw new Error('当前采样范围未找到满足埋深和坡度条件的演示线路')
  const { start, end, row } = best
  const a = samples[row * COUNT + start]!
  const b = samples[row * COUNT + end]!
  const centerY = (row - 4) * 200
  const length = (end - start) * STEP
  const floorStart = a.height - 4
  const floorEnd = b.height - 4
  const checks: Cartographic[] = []
  const tubes = [-12, 12].map(offset => {
    const positions: Cartesian3[] = []
    for (let i = start; i <= end; i++) {
      const point = location((i - 32) * STEP, centerY + offset)
      point.height = floorStart + (floorEnd - floorStart) * (i - start) / (end - start)
      positions.push(Cartesian3.fromRadians(point.longitude, point.latitude, point.height))
      if (i >= start + 2 && i <= end - 2) {
        for (const edge of [-6, 0, 6]) checks.push(location((i - 32) * STEP, centerY + offset + edge))
      }
    }
    return positions
  })
  await sampleTerrainMostDetailed(terrain, checks, true)
  let minCover = Infinity
  for (let i = 0; i < checks.length; i++) {
    const station = Math.floor(i / 3) % (end - start - 3) + 2
    const roof = floorStart + (floorEnd - floorStart) * station / (end - start) + 8.5
    minCover = Math.min(minCover, checks[i]!.height - roof)
  }
  if (!Number.isFinite(minCover) || minCover < 3) throw new Error('双洞断面校核未通过，当前线路存在地表穿出风险')
  return {
    tubes,
    length,
    minCover,
    grade: (floorEnd - floorStart) / length * 100,
    center: tubes[0]![Math.floor(tubes[0]!.length / 2)]!,
  }
}
