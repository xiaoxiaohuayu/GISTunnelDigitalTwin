import { deviceName, deviceTelemetry } from '../engines/deviceTelemetry.ts'
import type { AssetRecord, TelemetryBinding } from '../engines/projectConfig.ts'
import type { SceneDevice, SystemsState } from '../engines/tunnelSystemsState.ts'
import type { TelemetryReading, TelemetrySeverity, TelemetrySnapshot } from '../services/types.ts'
import type { SceneOverlay } from '../types/scene.ts'

export interface EvaluatedBindingReading {
  pointId: string
  metric: string
  formattedValue: string
  severity: TelemetrySeverity
  source: 'live' | 'mock' | 'unbound'
  note: string
}

export interface RuntimeDeviceAlert {
  device: SceneDevice
  name: string
  status: string
  value: string
  severity: string
  note: string
  pointId?: string
  source?: 'live' | 'mock'
}

function extractNumeric(value: string): number | null {
  const match = value.match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const num = Number(match[0])
  return Number.isFinite(num) ? num : null
}

function severityRank(severity: string): number {
  return severity === 'alarm' ? 2 : severity === 'warning' ? 1 : 0
}

function normalizeSeverity(severity: string): TelemetrySeverity {
  return severity === 'alarm' ? 'alarm' : severity === 'warning' ? 'warning' : 'normal'
}

export function evaluateTelemetryBinding(
  binding: TelemetryBinding,
  snapshot: TelemetrySnapshot,
  fallbackReading?: TelemetryReading,
): EvaluatedBindingReading {
  const live = snapshot.readings[binding.pointId]
  const raw = live ?? fallbackReading
  const metric = binding.metric?.trim() || '监测值'

  if (!raw) {
    return {
      pointId: binding.pointId,
      metric,
      formattedValue: '—',
      severity: 'normal',
      source: 'unbound',
      note: '等待点位上报',
    }
  }

  let severity: TelemetrySeverity = raw.severity
  const numeric = extractNumeric(raw.value)
  if (numeric !== null) {
    if (binding.alarmThreshold !== undefined && numeric >= binding.alarmThreshold) {
      if (severityRank('alarm') > severityRank(severity)) severity = 'alarm'
    } else if (binding.warningThreshold !== undefined && numeric >= binding.warningThreshold) {
      if (severityRank('warning') > severityRank(severity)) severity = 'warning'
    }
  }

  const unit = binding.unit?.trim()
  const formattedValue =
    unit && !raw.value.includes(unit) && raw.value !== '—'
      ? `${raw.value} ${unit}`
      : raw.value

  return {
    pointId: binding.pointId,
    metric,
    formattedValue,
    severity,
    source: live ? 'live' : raw.source,
    note: raw.note,
  }
}

export function resolveBoundDeviceReading(
  device: SceneDevice,
  asset: AssetRecord | undefined,
  snapshot: TelemetrySnapshot,
  state: SystemsState,
  length: number,
  liveFallback?: TelemetryReading,
): TelemetryReading | undefined {
  const binding = asset?.telemetry
  if (!binding) return liveFallback

  const mockBase = deviceTelemetry(device, state, length)
  const fallback: TelemetryReading | undefined =
    liveFallback ??
    (device.kind === 'custom'
      ? undefined
      : {
          deviceId: device.id,
          status: mockBase.status,
          value: mockBase.value,
          severity: normalizeSeverity(mockBase.severity),
          note: mockBase.note,
          updatedAt: 0,
          source: 'mock',
        })

  const livePoint = snapshot.readings[binding.pointId]
  const evaluated = evaluateTelemetryBinding(binding, snapshot, fallback)
  const baseStatus = livePoint?.status ?? fallback?.status ?? '等待上报'
  const baseSeverity = livePoint?.severity ?? fallback?.severity ?? 'normal'

  let status = baseStatus
  let note = evaluated.note
  if (evaluated.source === 'unbound') {
    status = '等待上报'
    note = `已绑定点位 ${binding.pointId}，等待现场数据上报`
  } else if (evaluated.severity === 'alarm' && severityRank(baseSeverity) < 2 && binding.alarmThreshold !== undefined) {
    status = '阈值告警'
    note = `点位 ${binding.pointId} · ${evaluated.metric} 达到告警阈值 ${binding.alarmThreshold}${binding.unit ? ` ${binding.unit}` : ''}`
  } else if (evaluated.severity === 'warning' && severityRank(baseSeverity) < 1 && binding.warningThreshold !== undefined) {
    status = '阈值预警'
    note = `点位 ${binding.pointId} · ${evaluated.metric} 达到预警阈值 ${binding.warningThreshold}${binding.unit ? ` ${binding.unit}` : ''}`
  } else {
    note = `点位 ${binding.pointId} · ${evaluated.note}`
  }

  return {
    deviceId: device.id,
    status,
    value: evaluated.formattedValue,
    severity: evaluated.severity,
    note,
    updatedAt: livePoint?.updatedAt ?? fallback?.updatedAt ?? 0,
    source: evaluated.source === 'live' ? 'live' : 'mock',
  }
}

export function mergeBoundDeviceAlerts(
  baseAlerts: RuntimeDeviceAlert[],
  devices: SceneDevice[],
  assets: AssetRecord[],
  snapshot: TelemetrySnapshot,
  state: SystemsState,
  length: number,
): RuntimeDeviceAlert[] {
  const assetById = new Map(assets.map(asset => [asset.id, asset]))
  const merged = new Map<string, RuntimeDeviceAlert>(
    baseAlerts.map(alert => [alert.device.id, alert]),
  )

  for (const device of devices) {
    const asset = assetById.get(device.id)
    if (!asset?.telemetry) continue
    const bound = resolveBoundDeviceReading(device, asset, snapshot, state, length)
    if (!bound || bound.severity === 'normal') continue

    const existing = merged.get(device.id)
    if (!existing || severityRank(bound.severity) >= severityRank(existing.severity)) {
      merged.set(device.id, {
        device,
        name: deviceName(device),
        status: bound.status,
        value: bound.value,
        severity: bound.severity,
        note: bound.note,
        pointId: asset.telemetry.pointId,
        source: bound.source,
      })
    }
  }

  return [...merged.values()].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity),
  )
}

export function applyTelemetryToOverlays(
  overlays: SceneOverlay[],
  assets: AssetRecord[],
  snapshot: TelemetrySnapshot,
  devices: SceneDevice[],
  state: SystemsState,
  length: number,
): SceneOverlay[] {
  if (overlays.length === 0) return overlays
  const assetById = new Map(assets.map(asset => [asset.id, asset]))
  const deviceById = new Map(devices.map(device => [device.id, device]))

  return overlays.map(item => {
    if (item.plateColor) return item
    const asset = assetById.get(item.id)
    if (!asset?.telemetry) return item
    const device = deviceById.get(item.id)
    if (!device) return item

    const bound = resolveBoundDeviceReading(device, asset, snapshot, state, length)
    if (!bound) return item

    return {
      ...item,
      value: bound.value,
      status: bound.status,
      severity: bound.severity,
      sourceTag: bound.source === 'live' ? '实时' : '映射',
    }
  })
}
