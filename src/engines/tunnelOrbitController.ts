// @env browser
import {
  Cartesian3,
  Cartographic,
  HeadingPitchRange,
  Matrix4,
  PerspectiveFrustum,
  Transforms,
} from 'cesium'
import type { Viewer } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import { PORTAL_EXTENSION, tunnelPoint } from './tunnelDetails'
import { boreIndices, surveyFrame } from './projectSurvey'
import {
  EXTERIOR_ORBIT_CONSTRAINTS,
  INTERIOR_ORBIT_CONSTRAINTS,
  UNDERGROUND_ORBIT_CONSTRAINTS,
  applyOrbitRotate,
  applyOrbitZoom,
  clampOrbitState,
  clampTargetElevation,
  computePanScale,
} from './orbitCameraMath'
import type { OrbitConstraints, OrbitState } from './orbitCameraMath'

export interface TunnelOrbitControllerOptions {
  viewer: Viewer
  getSurvey: () => TunnelSurvey
  isIntroPlaying: () => boolean
  isRoaming: () => boolean
  isUnderground: () => boolean
}

export interface TunnelOrbitController {
  setTarget: (point: Cartesian3) => void
  getTarget: () => Cartesian3
  dispose: () => void
}

const DRAG_THRESHOLD_PX = 3
const MIN_CAMERA_FLOOR_CLEARANCE = 0.85

export function addTunnelOrbitController(options: TunnelOrbitControllerOptions): TunnelOrbitController {
  const { viewer, getSurvey, isIntroPlaying, isRoaming, isUnderground } = options
  const canvas = viewer.canvas
  const controller = viewer.scene.screenSpaceCameraController

  // Replace Cesium's globe-centric mouse bindings with our tunnel-centered orbit controller.
  // Keep `enableInputs` untouched so positionGizmo.ts can still temporarily lock camera input during drags.
  controller.enableRotate = false
  controller.enableTranslate = false
  controller.enableZoom = false
  controller.enableTilt = false
  controller.enableLook = false

  const target = Cartesian3.clone(getSurvey().center)
  let orbitState: OrbitState = { heading: 0, pitch: -0.45, range: 250 }

  const scratchEnu = new Matrix4()
  const scratchInvEnu = new Matrix4()
  const scratchLocal = new Cartesian3()
  const scratchDelta = new Cartesian3()
  const scratchUp = new Cartesian3()
  const scratchRight = new Cartesian3()
  const scratchForward = new Cartesian3()
  const scratchCarto = new Cartographic()

  function isInsideTunnelCorridor(point: Cartesian3): boolean {
    const survey = getSurvey()
    const minStation = -PORTAL_EXTENSION - 20
    const maxStation = survey.length + PORTAL_EXTENSION + 20
    const gradeRatio = survey.grade / 100

    for (const tube of boreIndices(survey)) {
      const origin = tunnelPoint(survey, tube, 0, 0, 0)
      const frame = surveyFrame(survey, origin)
      Matrix4.inverse(frame, scratchInvEnu)
      const local = Matrix4.multiplyByPoint(scratchInvEnu, point, scratchLocal)
      if (local.x < minStation || local.x > maxStation) continue
      const height = local.z - local.x * gradeRatio
      if (Math.abs(local.y) <= 10.5 && height >= -1.5 && height <= 10.5) return true
    }
    return false
  }

  function tunnelFloorElevation(): number {
    const survey = getSurvey()
    const centerCarto = Cartographic.fromCartesian(survey.center, undefined, scratchCarto)
    return centerCarto ? centerCarto.height - 1.5 : 0
  }

  function activeConstraints(): OrbitConstraints {
    if (isUnderground()) return UNDERGROUND_ORBIT_CONSTRAINTS
    if (isInsideTunnelCorridor(viewer.camera.positionWC) || isInsideTunnelCorridor(target)) {
      return INTERIOR_ORBIT_CONSTRAINTS
    }
    return EXTERIOR_ORBIT_CONSTRAINTS
  }

  function syncStateFromCamera(): void {
    const camPos = viewer.camera.positionWC
    const range = Math.max(1.5, Cartesian3.distance(camPos, target))
    Transforms.eastNorthUpToFixedFrame(target, undefined, scratchEnu)
    Matrix4.inverse(scratchEnu, scratchInvEnu)
    const rel = Matrix4.multiplyByPoint(scratchInvEnu, camPos, scratchLocal)
    // rel is vector from target -> camera in local ENU (x = East, y = North, z = Up)
    // HeadingPitchRange looks FROM camera TO target, so camera sits opposite to view direction.
    const horiz = Math.hypot(rel.x, rel.y)
    const pitch = Math.atan2(-rel.z, Math.max(1e-6, horiz))
    const heading = Math.atan2(-rel.x, -rel.y)
    orbitState = clampOrbitState({ heading, pitch, range }, activeConstraints())
  }

  function applyOrbitToCamera(): void {
    const constraints = activeConstraints()
    orbitState = clampOrbitState(orbitState, constraints)

    // Keep target above tunnel floor when not in underground mode.
    if (!isUnderground()) {
      const targetCarto = Cartographic.fromCartesian(target, undefined, scratchCarto)
      if (targetCarto) {
        const floor = tunnelFloorElevation()
        const safeHeight = clampTargetElevation(targetCarto.height, floor, false, 0.2)
        if (safeHeight !== targetCarto.height) {
          Cartesian3.fromRadians(targetCarto.longitude, targetCarto.latitude, safeHeight, undefined, target)
        }
      }
    }

    viewer.camera.lookAt(target, new HeadingPitchRange(orbitState.heading, orbitState.pitch, orbitState.range))
    viewer.camera.lookAtTransform(Matrix4.IDENTITY)

    // Final safety floor check so camera never dips below tunnel floor / ground when outside underground mode.
    if (!isUnderground()) {
      const camCarto = Cartographic.fromCartesian(viewer.camera.positionWC, undefined, scratchCarto)
      if (camCarto) {
        const floor = tunnelFloorElevation()
        const minCamHeight = floor + MIN_CAMERA_FLOOR_CLEARANCE
        if (camCarto.height < minCamHeight) {
          const corrected = Cartesian3.fromRadians(camCarto.longitude, camCarto.latitude, minCamHeight)
          viewer.camera.setView({
            destination: corrected,
            orientation: {
              heading: viewer.camera.heading,
              pitch: viewer.camera.pitch,
              roll: 0,
            },
          })
          syncStateFromCamera()
        }
      }
    }

    viewer.scene.requestRender()
  }

  function panInHorizontalPlane(dxPx: number, dyPx: number): void {
    const fovY = viewer.camera.frustum instanceof PerspectiveFrustum
      ? (viewer.camera.frustum.fovy ?? Math.PI / 3)
      : Math.PI / 3
    const metersPerPx = computePanScale(orbitState.range, canvas.clientHeight || window.innerHeight, fovY)

    Transforms.eastNorthUpToFixedFrame(target, undefined, scratchEnu)
    Matrix4.multiplyByPointAsVector(scratchEnu, Cartesian3.UNIT_Z, scratchUp)
    Cartesian3.normalize(scratchUp, scratchUp)

    // Project camera right & direction onto local horizontal tangent plane so panning stays level.
    const camRight = viewer.camera.rightWC
    const rightDotUp = Cartesian3.dot(camRight, scratchUp)
    Cartesian3.subtract(
      camRight,
      Cartesian3.multiplyByScalar(scratchUp, rightDotUp, scratchDelta),
      scratchRight,
    )
    if (Cartesian3.magnitudeSquared(scratchRight) < 1e-6) return
    Cartesian3.normalize(scratchRight, scratchRight)

    Cartesian3.cross(scratchUp, scratchRight, scratchForward)
    Cartesian3.normalize(scratchForward, scratchForward)

    // Dragging mouse right moves the scene right -> moves camera/target left (-right).
    // Dragging mouse down moves the scene down -> moves camera/target forward/backward along ground plane.
    const shiftRight = Cartesian3.multiplyByScalar(scratchRight, -dxPx * metersPerPx, scratchDelta)
    Cartesian3.add(target, shiftRight, target)
    const shiftForward = Cartesian3.multiplyByScalar(scratchForward, dyPx * metersPerPx, scratchDelta)
    Cartesian3.add(target, shiftForward, target)

    // Keep target within reasonable distance of tunnel center (max 4500m) so user never gets lost in space.
    const surveyCenter = getSurvey().center
    const offsetFromTunnel = Cartesian3.subtract(target, surveyCenter, scratchDelta)
    const maxPanRadius = Math.max(2500, getSurvey().length * 1.8)
    const dist = Cartesian3.magnitude(offsetFromTunnel)
    if (dist > maxPanRadius) {
      Cartesian3.multiplyByScalar(offsetFromTunnel, maxPanRadius / dist, offsetFromTunnel)
      Cartesian3.add(surveyCenter, offsetFromTunnel, target)
    }

    applyOrbitToCamera()
  }

  let drag:
    | { mode: 'pan' | 'orbit'; pointerId: number; startX: number; startY: number; lastX: number; lastY: number; moved: boolean }
    | null = null

  function isInteractive(): boolean {
    return !viewer.isDestroyed() && controller.enableInputs && !isIntroPlaying() && !isRoaming()
  }

  function onPointerDown(event: PointerEvent): void {
    if (!isInteractive()) return
    // Scheme 1: Left button (0) = pan, Right button (2) or Middle button (1) = orbit around target.
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return
    syncStateFromCamera()
    drag = {
      mode: event.button === 0 ? 'pan' : 'orbit',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    }
    if (event.button !== 0) {
      event.preventDefault()
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return
    if (!isInteractive()) {
      drag = null
      return
    }
    const dx = event.clientX - drag.lastX
    const dy = event.clientY - drag.lastY
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD_PX) return
      drag.moved = true
      canvas.setPointerCapture(event.pointerId)
    }
    drag.lastX = event.clientX
    drag.lastY = event.clientY

    if (drag.mode === 'orbit') {
      orbitState = applyOrbitRotate(orbitState, dx, dy, activeConstraints())
      applyOrbitToCamera()
    } else {
      panInHorizontalPlane(dx, dy)
    }
  }

  function endDrag(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return
    if (drag.moved && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }
    drag = null
  }

  function onWheel(event: WheelEvent): void {
    if (!isInteractive()) return
    event.preventDefault()
    syncStateFromCamera()
    orbitState = applyOrbitZoom(orbitState, event.deltaY, activeConstraints())
    applyOrbitToCamera()
  }

  function onContextMenu(event: MouseEvent): void {
    event.preventDefault()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('contextmenu', onContextMenu)

  syncStateFromCamera()

  return {
    setTarget(point: Cartesian3) {
      Cartesian3.clone(point, target)
      syncStateFromCamera()
    },
    getTarget() {
      return Cartesian3.clone(target)
    },
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContextMenu)
    },
  }
}
