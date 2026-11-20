import { roadHalfWidth, wallOffset } from './assetPlacement.ts'
import { laneLateral } from './projectConfig.ts'
import type { BoreConfig } from './projectConfig.ts'
import type { SnapMode } from '../editor/editorStore.ts'

export interface TunnelPosition {
  chainage: number
  lateral: number
  height: number
}

export interface TunnelSnapOptions {
  shiftHeld?: boolean
  gridStep?: number
  chainageStep?: number
  surfaceThreshold?: number
}

export interface TunnelSnapResult extends TunnelPosition {
  snappedLabels: string[]
}

const HEIGHT_TARGETS: readonly { value: number; label: string }[] = [
  { value: 0, label: '路面' },
  { value: 5.85, label: '净空 5.85m' },
  { value: 6.68, label: '拱顶' },
]

function roundStep(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(4))
}

export function normalizeHeading(degrees: number): number {
  let wrapped = ((degrees + 180) % 360 + 360) % 360 - 180
  if (Object.is(wrapped, -0) || wrapped === -180) wrapped = 180
  return Math.round(wrapped * 100) / 100
}

export function snapTunnelPosition(
  bore: BoreConfig,
  candidate: TunnelPosition,
  mode: SnapMode,
  options: TunnelSnapOptions = {},
): TunnelSnapResult {
  const shiftHeld = options.shiftHeld ?? false
  const gridStep = options.gridStep ?? 0.1
  const chainageStep = options.chainageStep ?? 1
  const threshold = options.surfaceThreshold ?? 0.55

  if (mode === 'none') {
    if (!shiftHeld) return { ...candidate, snappedLabels: [] }
    return {
      chainage: roundStep(candidate.chainage, gridStep),
      lateral: roundStep(candidate.lateral, gridStep),
      height: roundStep(candidate.height, gridStep),
      snappedLabels: ['0.1m 步进'],
    }
  }

  if (mode === 'grid') {
    const step = shiftHeld ? Math.max(0.05, gridStep / 2) : gridStep
    const stationStep = shiftHeld ? 0.5 : chainageStep
    return {
      chainage: roundStep(candidate.chainage, stationStep),
      lateral: roundStep(candidate.lateral, step),
      height: roundStep(candidate.height, step),
      snappedLabels: [`网格 ${stationStep}m / ${step}m`],
    }
  }

  // Semantic tunnel surface snapping: walls, kerbs, lane centers, bore axis, roadway, clearance, arch crown.
  const snappedLabels: string[] = []
  const stationStep = shiftHeld ? 5 : 1
  const chainage = roundStep(candidate.chainage, stationStep)
  snappedLabels.push(`桩号 ${stationStep}m`)

  const wall = wallOffset(bore)
  const edge = roadHalfWidth(bore)
  const lateralTargets: { value: number; label: string }[] = [
    { value: -wall, label: '左墙' },
    { value: wall, label: '右墙' },
    { value: -edge, label: '左路缘' },
    { value: edge, label: '右路缘' },
    { value: 0, label: '洞轴中心' },
    ...bore.lanes.map((_, index) => ({
      value: laneLateral(bore, index),
      label: `车道 ${index + 1} 中心`,
    })),
  ]

  let lateral = candidate.lateral
  let bestLateralDist = threshold
  let bestLateralLabel: string | undefined
  for (const target of lateralTargets) {
    const dist = Math.abs(candidate.lateral - target.value)
    if (dist <= bestLateralDist) {
      bestLateralDist = dist
      lateral = target.value
      bestLateralLabel = target.label
    }
  }
  if (bestLateralLabel) snappedLabels.push(bestLateralLabel)

  let height = candidate.height
  let bestHeightDist = threshold
  let bestHeightLabel: string | undefined
  for (const target of HEIGHT_TARGETS) {
    const dist = Math.abs(candidate.height - target.value)
    if (dist <= bestHeightDist) {
      bestHeightDist = dist
      height = target.value
      bestHeightLabel = target.label
    }
  }
  if (bestHeightLabel) snappedLabels.push(bestHeightLabel)

  return {
    chainage,
    lateral: Math.round(lateral * 1000) / 1000,
    height: Math.round(height * 1000) / 1000,
    snappedLabels,
  }
}

export function snapHeading(degrees: number, mode: SnapMode, shiftHeld = false): number {
  const normalized = normalizeHeading(degrees)
  if (mode === 'grid' || shiftHeld) return normalizeHeading(roundStep(normalized, 15))
  if (mode === 'surface') {
    const nearestCardinal = roundStep(normalized, 45)
    if (Math.abs(normalized - nearestCardinal) <= 6) return normalizeHeading(nearestCardinal)
    return normalizeHeading(roundStep(normalized, 5))
  }
  return Math.round(normalized * 10) / 10
}

export function snapScale(factor: number, mode: SnapMode, shiftHeld = false): number {
  const clamped = Math.max(0.25, Math.min(4, factor))
  if (mode === 'grid' || shiftHeld) return Math.round(clamped * 10) / 10
  if (mode === 'surface') {
    for (const standard of [0.5, 1, 1.5, 2, 3]) {
      if (Math.abs(clamped - standard) <= 0.08) return standard
    }
    return Math.round(clamped * 20) / 20
  }
  return Math.round(clamped * 100) / 100
}
