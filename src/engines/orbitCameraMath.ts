export interface OrbitState {
  /** Camera heading in radians (0 = North, PI/2 = East). */
  heading: number
  /** Camera pitch in radians (negative = looking down, positive = looking up). */
  pitch: number
  /** Distance from camera to orbit target in metres. */
  range: number
}

export interface OrbitConstraints {
  minPitch: number
  maxPitch: number
  minRange: number
  maxRange: number
}

const DEG_TO_RAD = Math.PI / 180
const TWO_PI = Math.PI * 2

export const EXTERIOR_ORBIT_CONSTRAINTS: OrbitConstraints = {
  minPitch: -86 * DEG_TO_RAD,
  maxPitch: -3 * DEG_TO_RAD,
  minRange: 1.8,
  maxRange: 8000,
}

export const INTERIOR_ORBIT_CONSTRAINTS: OrbitConstraints = {
  minPitch: -65 * DEG_TO_RAD,
  maxPitch: 36 * DEG_TO_RAD,
  minRange: 1.5,
  maxRange: 4000,
}

export const UNDERGROUND_ORBIT_CONSTRAINTS: OrbitConstraints = {
  minPitch: -88 * DEG_TO_RAD,
  maxPitch: 80 * DEG_TO_RAD,
  minRange: 1.5,
  maxRange: 8000,
}

export function normalizeRadians(rad: number): number {
  const wrapped = ((rad % TWO_PI) + TWO_PI) % TWO_PI
  return wrapped
}

export function clampOrbitState(state: OrbitState, constraints: OrbitConstraints): OrbitState {
  return {
    heading: normalizeRadians(state.heading),
    pitch: Math.max(constraints.minPitch, Math.min(constraints.maxPitch, state.pitch)),
    range: Math.max(constraints.minRange, Math.min(constraints.maxRange, state.range)),
  }
}

export function applyOrbitRotate(
  state: OrbitState,
  dxPx: number,
  dyPx: number,
  constraints: OrbitConstraints,
  sensitivity = 0.0055,
): OrbitState {
  return clampOrbitState(
    {
      heading: state.heading + dxPx * sensitivity,
      pitch: state.pitch - dyPx * sensitivity,
      range: state.range,
    },
    constraints,
  )
}

export function applyOrbitZoom(
  state: OrbitState,
  wheelDeltaY: number,
  constraints: OrbitConstraints,
  zoomSpeed = 0.0014,
): OrbitState {
  const clampedDelta = Math.max(-400, Math.min(400, wheelDeltaY))
  const factor = Math.exp(clampedDelta * zoomSpeed)
  return clampOrbitState(
    {
      heading: state.heading,
      pitch: state.pitch,
      range: state.range * factor,
    },
    constraints,
  )
}

/**
 * Computes metres per screen pixel at the orbit target plane so panning tracks
 * the cursor naturally at both 1500m overview and 5m close-up inspection.
 */
export function computePanScale(range: number, viewportHeight: number, fovY = Math.PI / 3): number {
  const safeHeight = Math.max(200, viewportHeight)
  const visibleHeightMetres = 2 * Math.max(1.5, range) * Math.tan(fovY * 0.5)
  return visibleHeightMetres / safeHeight
}

/**
 * Ensures the orbit target never drops below the tunnel floor / ground plane
 * unless underground transparency mode is explicitly enabled.
 */
export function clampTargetElevation(
  targetHeight: number,
  floorHeight: number,
  allowUnderground: boolean,
  minClearance = 0.2,
): number {
  if (allowUnderground) return targetHeight
  return Math.max(floorHeight + minClearance, targetHeight)
}
