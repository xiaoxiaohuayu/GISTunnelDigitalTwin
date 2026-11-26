import { Cartesian3, Matrix3, Matrix4, Quaternion } from 'cesium'
import { deviceVms } from './tunnelSystemsState.ts'
import type { DeviceBoxDescriptor, DeviceKind, SceneDevice, SystemsState } from './tunnelSystemsState.ts'
import { getCachedCustomModelMeta } from './customModelLibrary.ts'

const ZERO_OFFSET: [number, number, number] = [0, 0, 0]
const DEFAULT_PROFILE: DeviceBoxDescriptor = { size: [1.2, 1.2, 1.2], offset: ZERO_OFFSET }

/**
 * Declarative default bounding-box profiles (in local device ENU frame) aligned
 * with the built-in GLB assets. Devices with custom anchors (such as composite
 * sub-nodes) provide `device.box` directly at creation time.
 */
const DEVICE_BOX_PROFILES: Partial<Record<DeviceKind, DeviceBoxDescriptor>> = {
  basic: { size: [1.9, 0.72, 0.56] },
  enhanced: { size: [2.0, 0.78, 0.56] },
  fan: { size: [3.8, 1.9, 1.9] },
  vms: { size: [0.65, 6.95, 1.24] },
  lane: { size: [0.55, 1.05, 1.15] },
  signal: { size: [0.65, 2.35, 1.0] },
  cabinet: { size: [1.1, 0.6, 1.62], offset: [0, 0, 0.75] },
  camera: { size: [0.55, 1.1, 0.65] },
  detector: { size: [0.45, 0.68, 0.95], offset: [0, -0.08, 0.24] },
  plc: { size: [0.85, 0.52, 1.52] },
  distribution: { size: [1.02, 0.52, 1.72] },
  speaker: { size: [0.58, 0.58, 0.82], offset: [0, 0, 0.17] },
  telephone: { size: [0.6, 0.78, 0.95] },
  escape: { size: [1.32, 0.32, 0.46] },
  covi: { size: [0.8, 0.52, 0.74] },
  no2: { size: [0.5, 0.52, 0.88] },
  wind: { size: [0.6, 0.6, 0.55] },
  fbg: { size: [0.55, 0.52, 0.74] },
  humidity: { size: [0.42, 0.54, 0.84] },
  manual: { size: [0.45, 0.45, 0.45] },
  flame: { size: [0.45, 0.45, 0.45] },
  shutter: { size: [4.6, 0.78, 3.8] },
  pedestrian: { size: [4.4, 2.4, 3.2] },
  vehicle: { size: [7.2, 3.0, 5.2] },
  layby: { size: [1.2, 1.2, 1.65] },
  pump: { size: [2.35, 1.65, 2.35], offset: [0, -0.17, 0.3] },
  tank: { size: [2.3, 1.7, 2.25], offset: [0, 0.67, -0.55] },
  substation: { size: [16.2, 12.2, 6.7], offset: [0, 0, 1.0] },
  // Standalone streetlight.glb has its origin at the base of the pole (z = 0..8m).
  street: { size: [0.8, 3.1, 8.2], offset: [0, 0, 4.0] },
}

export interface ResolvedDeviceBox {
  size: [number, number, number]
  offset: [number, number, number]
  offsetSpace: 'local' | 'survey'
}

export interface SelectionBoxPose {
  position: Cartesian3
  orientation: Quaternion
  dimensions: Cartesian3
}

function scaleTuple(tuple: [number, number, number], factor: number): [number, number, number] {
  return [tuple[0] * factor, tuple[1] * factor, tuple[2] * factor]
}

export function resolveDeviceBox(kind: DeviceKind, device?: SceneDevice, state?: SystemsState): ResolvedDeviceBox {
  const scale = device?.scale ?? 1
  if (device?.box) {
    return {
      size: scaleTuple(device.box.size, scale),
      offset: scaleTuple(device.box.offset ?? ZERO_OFFSET, scale),
      offsetSpace: device.box.offsetSpace ?? 'local',
    }
  }
  if (kind === 'custom' && device?.customModelId) {
    const meta = getCachedCustomModelMeta(device.customModelId)
    if (meta) {
      return {
        size: scaleTuple(meta.bounds, scale),
        offset: scaleTuple(meta.centerOffset, scale),
        offsetSpace: 'local',
      }
    }
  }
  if (kind === 'vms' && device && state) {
    const display = deviceVms(device, state)
    return {
      size: scaleTuple([0.65, display.width + 0.35, display.height + 0.36], scale),
      offset: ZERO_OFFSET,
      offsetSpace: 'local',
    }
  }
  const profile = DEVICE_BOX_PROFILES[kind] ?? DEFAULT_PROFILE
  return {
    size: scaleTuple(profile.size, scale),
    offset: scaleTuple(profile.offset ?? ZERO_OFFSET, scale),
    offsetSpace: profile.offsetSpace ?? 'local',
  }
}

export function deviceBoxSize(kind: DeviceKind, device?: SceneDevice, state?: SystemsState): [number, number, number] {
  return resolveDeviceBox(kind, device, state).size
}

export function deviceBoxOffset(d: SceneDevice): [number, number, number] {
  return resolveDeviceBox(d.kind, d).offset
}

export function computeSelectionRotation(baseFrame: Matrix4, headingDeg: number): Matrix3 {
  const yaw = Matrix3.fromRotationZ((headingDeg * Math.PI) / 180)
  return Matrix3.multiply(Matrix4.getMatrix3(baseFrame, new Matrix3()), yaw, new Matrix3())
}

/**
 * Shared helper that computes the exact world-space position, quaternion orientation,
 * and box dimensions for any selected device without kind-specific branching.
 */
export function computeSelectionBoxPose(
  baseFrame: Matrix4,
  anchor: Cartesian3,
  device: SceneDevice,
  state?: SystemsState,
): SelectionBoxPose {
  const box = resolveDeviceBox(device.kind, device, state)
  const headingDeg = device.heading ?? (device.tube === 0 ? 0 : 180)
  const localRot = computeSelectionRotation(baseFrame, headingDeg)
  const [ox, oy, oz] = box.offset
  let position = Cartesian3.clone(anchor)
  if (ox || oy || oz) {
    const offsetRot = box.offsetSpace === 'survey'
      ? Matrix4.getMatrix3(baseFrame, new Matrix3())
      : localRot
    const worldOffset = Matrix3.multiplyByVector(offsetRot, new Cartesian3(ox, oy, oz), new Cartesian3())
    position = Cartesian3.add(anchor, worldOffset, new Cartesian3())
  }
  return {
    position,
    orientation: Quaternion.fromRotationMatrix(localRot),
    dimensions: new Cartesian3(box.size[0], box.size[1], box.size[2]),
  }
}
