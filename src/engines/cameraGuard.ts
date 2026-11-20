// @env browser
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Matrix4,
  PerspectiveFrustum,
} from 'cesium'
import type { Viewer } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import { PORTAL_EXTENSION, tunnelPoint } from './tunnelDetails'
import { boreIndices, surveyFrame } from './projectSurvey'
import { layoutPassages, projectLayByWidth } from './facilityLayout'
import { PROFILE_HALF } from './sectionProfile'

export interface CameraGuardOptions {
  viewer: Viewer
  getSurvey: () => TunnelSurvey
  isRoaming: () => boolean
  isIntroPlaying: () => boolean
  isUnderground: () => boolean
  isWallsVisible: () => boolean
}

const MIN_GROUND_CLEARANCE = 1.5
const MIN_SURFACE_DISTANCE = 1.6
const BASE_LINING_HALF = 5.5
const SPRING_HEIGHT = 2.5
const ARCH_RADIUS = 5.5
const WALL_MARGIN = 0.65
const MIN_ROAD_HEIGHT = 0.85
const PASSAGE_MARGIN = 0.55
const PASSAGE_TOP_MARGIN = 0.45
const CORRIDOR_DETECT_MARGIN = 3.5

interface LocalSample {
  tube: number
  station: number
  lateral: number
  height: number
  frame: Matrix4
  gradeRatio: number
  halfWidth: number
  outer: -1 | 1
  layByWidth: number
}

export function addCameraGuard(options: CameraGuardOptions): { setEnabled: (enabled: boolean) => void; dispose: () => void } {
  const { viewer, getSurvey, isRoaming, isIntroPlaying, isUnderground, isWallsVisible } = options
  let enabled = true

  // Reduce near clipping artifacts when inspecting walls, portals, or equipment up close.
  if (viewer.camera.frustum instanceof PerspectiveFrustum) {
    viewer.camera.frustum.near = 0.25
  }
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 1.5

  const scratchInv = new Matrix4()
  const scratchLocal = new Cartesian3()
  const scratchPoint = new Cartesian3()
  const scratchPickScreen = new Cartesian2()
  const scratchPicked = new Cartesian3()
  const scratchCarto = new Cartographic()

  function boreHalfWidth(survey: TunnelSurvey, tube: number): number {
    const bore = survey.project?.bores[tube]
    if (!bore) return BASE_LINING_HALF
    const carriagewayHalf = (bore.lanes.length * bore.laneWidth) * 0.5
    return BASE_LINING_HALF + Math.max(0, carriagewayHalf - PROFILE_HALF)
  }

  function findNearestTubeSample(cameraPos: Cartesian3): LocalSample | null {
    const survey = getSurvey()
    const minStation = -PORTAL_EXTENSION
    const maxStation = survey.length + PORTAL_EXTENSION
    const gradeRatio = survey.grade / 100
    let best: LocalSample | null = null
    let bestLateralDist = Infinity

    for (const tube of boreIndices(survey)) {
      const origin = tunnelPoint(survey, tube, 0, 0, 0)
      const frame = surveyFrame(survey, origin)
      Matrix4.inverse(frame, scratchInv)
      const local = Matrix4.multiplyByPoint(scratchInv, cameraPos, scratchLocal)
      if (local.x < minStation || local.x > maxStation) continue
      const height = local.z - local.x * gradeRatio
      const halfWidth = boreHalfWidth(survey, tube)
      const outer: -1 | 1 = tube === 0 ? -1 : 1
      const layByWidth = projectLayByWidth(local.x, survey, tube)
      const dist = Math.abs(local.y)
      if (dist < bestLateralDist) {
        bestLateralDist = dist
        best = {
          tube,
          station: local.x,
          lateral: local.y,
          height,
          frame,
          gradeRatio,
          halfWidth,
          outer,
          layByWidth,
        }
      }
    }
    return best
  }

  function clampInsidePassage(sample: LocalSample, survey: TunnelSurvey): boolean {
    if (survey.tubes.length < 2) return false
    const innerSign = -sample.outer
    const innerEdge = sample.halfWidth - WALL_MARGIN
    // Only engage passage corridor when camera is at or past the inner wall toward the sibling bore.
    if (sample.lateral * innerSign <= innerEdge) return false

    const passages = layoutPassages(survey, sample.tube)
    const passage = passages.find(p => Math.abs(sample.station - p.station) <= p.halfWidth + 1.0)
    if (!passage) return false

    const safeHalfSpan = Math.max(0.4, passage.halfWidth - PASSAGE_MARGIN)
    const clampedStation = Math.max(passage.station - safeHalfSpan, Math.min(passage.station + safeHalfSpan, sample.station))
    const ratio = (clampedStation - passage.station) / passage.halfWidth
    const archTop = passage.height + passage.archRise * Math.sqrt(Math.max(0, 1 - ratio * ratio))
    const maxHeight = Math.max(MIN_ROAD_HEIGHT + 0.3, archTop - PASSAGE_TOP_MARGIN)
    const clampedHeight = Math.max(MIN_ROAD_HEIGHT, Math.min(maxHeight, sample.height))

    if (Math.abs(clampedStation - sample.station) > 1e-3 || Math.abs(clampedHeight - sample.height) > 1e-3) {
      applyLocalPosition(sample, clampedStation, sample.lateral, clampedHeight)
    }
    return true
  }

  function applyLocalPosition(sample: LocalSample, station: number, lateral: number, height: number): void {
    const localZ = height + station * sample.gradeRatio
    const world = Matrix4.multiplyByPoint(
      sample.frame,
      Cartesian3.fromElements(station, lateral, localZ, scratchPoint),
      scratchPoint,
    )
    viewer.camera.setView({
      destination: world,
      orientation: {
        heading: viewer.camera.heading,
        pitch: viewer.camera.pitch,
        roll: viewer.camera.roll,
      },
    })
    viewer.scene.requestRender()
  }

  function clampInteriorEnvelope(sample: LocalSample, survey: TunnelSurvey): boolean {
    const outerLimit = sample.halfWidth + sample.layByWidth - WALL_MARGIN
    const innerLimit = sample.halfWidth - WALL_MARGIN
    const minY = sample.outer === -1 ? -outerLimit : -innerLimit
    const maxY = sample.outer === 1 ? outerLimit : innerLimit

    // Check if camera is within the detectable interior envelope (including slight overshoot from fast mouse drag).
    const maxRoof = SPRING_HEIGHT + ARCH_RADIUS + 2.0
    const inHeightBand = sample.height >= -2.5 && sample.height <= maxRoof
    const inLateralBand = sample.lateral >= minY - CORRIDOR_DETECT_MARGIN && sample.lateral <= maxY + CORRIDOR_DETECT_MARGIN

    if (!inHeightBand) return false

    // Allow smooth traversal through cross-passages between twin bores.
    if (clampInsidePassage(sample, survey)) return true

    if (!inLateralBand) return false

    if (!isWallsVisible()) return true

    let clampedY = Math.max(minY, Math.min(maxY, sample.lateral))
    let clampedZ = Math.max(MIN_ROAD_HEIGHT, sample.height)

    // Constrain against the arched crown above spring height.
    const safeArchRadius = Math.max(1.0, ARCH_RADIUS - WALL_MARGIN)
    const sideSpan = clampedY * sample.outer > 0 ? outerLimit : innerLimit
    const normY = sideSpan > 0 ? Math.min(1, Math.abs(clampedY) / sideSpan) : 0
    const maxCrownAtY = SPRING_HEIGHT + safeArchRadius * Math.sqrt(Math.max(0, 1 - normY * normY))
    if (clampedZ > maxCrownAtY) {
      // Project diagonally inward/downward onto the safe arch curve so camera slides along the ceiling smoothly.
      const dy = clampedY * (safeArchRadius / Math.max(0.5, sideSpan))
      const dz = clampedZ - SPRING_HEIGHT
      const radial = Math.hypot(dy, dz)
      if (radial > safeArchRadius && radial > 1e-4) {
        const scale = safeArchRadius / radial
        clampedY = Math.max(minY, Math.min(maxY, clampedY * scale))
        clampedZ = Math.max(MIN_ROAD_HEIGHT, SPRING_HEIGHT + dz * scale)
      } else {
        clampedZ = Math.max(MIN_ROAD_HEIGHT, maxCrownAtY)
      }
    }

    if (Math.abs(clampedY - sample.lateral) > 1e-3 || Math.abs(clampedZ - sample.height) > 1e-3) {
      applyLocalPosition(sample, sample.station, clampedY, clampedZ)
    }
    return true
  }

  function clampCameraBounds(): void {
    if (!enabled || viewer.isDestroyed() || isIntroPlaying() || isRoaming() || isUnderground()) return
    const cameraPos = viewer.camera.positionWC
    const survey = getSurvey()
    const sample = findNearestTubeSample(cameraPos)
    if (sample && clampInteriorEnvelope(sample, survey)) return

    // Exterior terrain clearance protection.
    const carto = Cartographic.fromCartesian(cameraPos, undefined, scratchCarto)
    if (!carto) return
    const groundHeight = viewer.scene.globe.getHeight(carto)
    if (groundHeight === undefined || !Number.isFinite(groundHeight)) return
    const minHeight = groundHeight + MIN_GROUND_CLEARANCE
    if (carto.height >= minHeight) return
    viewer.camera.setView({
      destination: Cartesian3.fromRadians(carto.longitude, carto.latitude, minHeight),
      orientation: {
        heading: viewer.camera.heading,
        pitch: viewer.camera.pitch,
        roll: viewer.camera.roll,
      },
    })
    viewer.scene.requestRender()
  }

  function pickSurfaceDistance(clientX: number, clientY: number): number | undefined {
    if (!viewer.scene.pickPositionSupported) return undefined
    const rect = viewer.canvas.getBoundingClientRect()
    scratchPickScreen.x = clientX - rect.left
    scratchPickScreen.y = clientY - rect.top
    let picked = viewer.scene.pickPosition(scratchPickScreen, scratchPicked)
    if (!picked) {
      scratchPickScreen.x = rect.width * 0.5
      scratchPickScreen.y = rect.height * 0.5
      picked = viewer.scene.pickPosition(scratchPickScreen, scratchPicked)
    }
    if (!picked) return undefined
    return Cartesian3.distance(viewer.camera.positionWC, picked)
  }

  function onWheel(event: WheelEvent): void {
    if (!enabled || viewer.isDestroyed() || event.deltaY >= 0 || isIntroPlaying() || isRoaming()) return
    const distance = pickSurfaceDistance(event.clientX, event.clientY)
    if (distance !== undefined && distance < MIN_SURFACE_DISTANCE) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }

  viewer.canvas.addEventListener('wheel', onWheel, { passive: false, capture: true })
  const stopPostUpdate = viewer.scene.postUpdate.addEventListener(clampCameraBounds)

  return {
    setEnabled(next: boolean) {
      enabled = next
      if (viewer.isDestroyed()) return
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = enabled ? 1.5 : 1.0
      if (enabled) clampCameraBounds()
    },
    dispose() {
      stopPostUpdate()
      if (!viewer.isDestroyed()) {
        viewer.canvas.removeEventListener('wheel', onWheel, { capture: true })
      }
    },
  }
}
