// Compass and travel helpers shared by the demo line and a configured project.
// Station bearing is degrees clockwise from north. Cesium heading uses the same sense.

export const DEMO_LONGITUDE = 103.56
export const DEMO_LATITUDE = 30.91
export const DEMO_HEADING = 90

const CARDINALS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'] as const

export function stationBearing(heading?: number): number {
  return heading ?? DEMO_HEADING
}

export function wrapDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

export function cardinalName(degrees: number): string {
  return CARDINALS[Math.round(wrapDegrees(degrees) / 45) % 8]!
}

/** Bearing of increasing station, or the opposite when traffic runs against station. */
export function travelBearingDegrees(heading: number | undefined, direction: 1 | -1): number {
  return wrapDegrees(direction === 1 ? stationBearing(heading) : stationBearing(heading) + 180)
}

/** Cesium camera heading in radians. 0 looks north. */
export function travelHeadingRadians(heading: number | undefined, direction: 1 | -1): number {
  return travelBearingDegrees(heading, direction) * Math.PI / 180
}

/** Positive pitch looks uphill. Grade rises with increasing station. */
export function travelPitchRadians(gradePercent: number, direction: 1 | -1): number {
  return direction * Math.atan(gradePercent / 100)
}

/**
 * RotZ that points a model +X axis along travel in an east-north-up frame
 * whose +X has already been aligned to the station bearing.
 * Eastbound is 0. Due west normalizes to +π so a small extra yaw keeps its sign.
 */
export function travelModelYaw(heading: number | undefined, direction: 1 | -1): number {
  let yaw = (90 - travelBearingDegrees(heading, direction)) * Math.PI / 180
  if (yaw <= -Math.PI) yaw += 2 * Math.PI
  return yaw
}

/** End 0 is the low-station portal. Heading 90 keeps the demo labels 西洞口 / 东洞口. */
export function portalEndName(heading: number | undefined, end: 0 | 1): string {
  const compass = end === 0 ? stationBearing(heading) + 180 : stationBearing(heading)
  return `${cardinalName(compass)}洞口`
}

export function boreTravelLabel(name: string, heading: number | undefined, direction: 1 | -1, suffix = ''): string {
  return `${name} · 向${cardinalName(travelBearingDegrees(heading, direction))}${suffix}`
}
