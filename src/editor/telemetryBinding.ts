import type { TelemetryBinding } from '../engines/projectConfig.ts'
import type { TelemetryReading, TelemetrySeverity, TelemetrySnapshot } from '../services/types.ts'

export interface EvaluatedBindingReading {
  pointId: string
  metric: string
  formattedValue: string
  severity: TelemetrySeverity
  source: 'live' | 'mock' | 'unbound'
  note: string
}

function extractNumeric(value: string): number | null {
  const match = value.match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const num = Number(match[0])
  return Number.isFinite(num) ? num : null
}

function severityRank(severity: TelemetrySeverity): number {
  return severity === 'alarm' ? 2 : severity === 'warning' ? 1 : 0
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
