import { boreLength } from './projectConfig.ts'
import type { BoreConfig } from './projectConfig.ts'

export interface BoreLocalSample {
  bore: BoreConfig
  /** Longitudinal station in metres along bore from bore.start. */
  station: number
  /** Local lateral offset in tunnel coordinates (Cesium local Y, opposite sign of AssetRecord.lateral). */
  localY: number
  /** Local vertical height above bore roadway in metres. */
  height: number
}

export interface TunnelDropLocation {
  boreId: string
  chainage: number
  lateral: number
  height: number
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Selects the closest bore from local-frame samples and converts the hit point
 * into valid, clamped AssetRecord coordinates.
 */
export function resolveDropLocation(samples: BoreLocalSample[]): TunnelDropLocation | null {
  if (samples.length === 0) return null

  let best = samples[0]!
  let bestScore = Infinity
  for (const sample of samples) {
    const len = boreLength(sample.bore)
    const stationOverflow =
      sample.station < -200
        ? -200 - sample.station
        : sample.station > len + 200
          ? sample.station - (len + 200)
          : 0
    const score = Math.abs(sample.localY) + stationOverflow * 2
    if (score < bestScore) {
      bestScore = score
      best = sample
    }
  }

  const len = boreLength(best.bore)
  const clampedStation = Math.max(-200, Math.min(len + 200, best.station))
  const dirSign = Math.sign(best.bore.end - best.bore.start) || 1
  const chainage = round1(best.bore.start + clampedStation * dirSign)
  // AssetRecord.lateral has opposite sign to local tunnel Y used in tunnelPoint(tube, station, -lateral, height).
  const lateral = round1(Math.max(-30, Math.min(30, -best.localY)))
  const height = round1(Math.max(0, Math.min(12, best.height)))

  return {
    boreId: best.bore.id,
    chainage,
    lateral,
    height,
  }
}
