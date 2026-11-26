import test from 'node:test'
import assert from 'node:assert/strict'
import { initialSystems } from '../src/engines/tunnelSystemsState.ts'
import type { SceneDevice } from '../src/engines/tunnelSystemsState.ts'
import type { AssetRecord } from '../src/engines/projectConfig.ts'
import { activeDeviceAlerts } from '../src/engines/deviceTelemetry.ts'
import {
  applyTelemetryToOverlays,
  mergeBoundDeviceAlerts,
  resolveBoundDeviceReading,
} from '../src/editor/index.ts'
import type { TelemetrySnapshot } from '../src/services/types.ts'
import type { SceneOverlay } from '../src/types/scene.ts'

const coviDevice: SceneDevice = {
  id: 'covi-1',
  kind: 'covi',
  tube: 0,
  station: 300,
  lateral: -4.2,
  height: 2.5,
  name: 'CO/VI 监测器',
  code: 'COVI-01',
}

const customDevice: SceneDevice = {
  id: 'custom-1',
  kind: 'custom',
  tube: 0,
  station: 420,
  lateral: 0,
  height: 0.4,
  name: '巡检机器人',
  code: 'GLB-1',
  customModelId: 'glb-robot',
}

test('resolveBoundDeviceReading applies thresholds to live point and custom GLB devices', () => {
  const asset: AssetRecord = {
    id: 'custom-1',
    code: 'GLB-1',
    name: '巡检机器人',
    kind: 'custom',
    boreId: 'bore-1',
    chainage: 420,
    lateral: 0,
    height: 0.4,
    heading: 0,
    customModelId: 'glb-robot',
    telemetry: {
      pointId: 'ROBOT-TEMP-01',
      metric: '电机温度',
      unit: '°C',
      warningThreshold: 60,
      alarmThreshold: 80,
    },
  }

  // Unbound / awaiting live telemetry for custom GLB
  const emptySnapshot: TelemetrySnapshot = { connection: 'mock', readings: {} }
  const waiting = resolveBoundDeviceReading(customDevice, asset, emptySnapshot, initialSystems, 1800)
  assert.ok(waiting)
  assert.equal(waiting.status, '等待上报')
  assert.equal(waiting.value, '—')
  assert.equal(waiting.severity, 'normal')

  // Live telemetry crosses alarm threshold -> escalates to alarm
  const hotSnapshot: TelemetrySnapshot = {
    connection: 'connected',
    readings: {
      'ROBOT-TEMP-01': {
        deviceId: 'ROBOT-TEMP-01',
        status: '在线',
        value: '84.5',
        severity: 'normal',
        note: '实时上报',
        updatedAt: 2000,
        source: 'live',
      },
    },
  }
  const alarmed = resolveBoundDeviceReading(customDevice, asset, hotSnapshot, initialSystems, 1800)
  assert.ok(alarmed)
  assert.equal(alarmed.severity, 'alarm')
  assert.equal(alarmed.status, '阈值告警')
  assert.equal(alarmed.value, '84.5 °C')
  assert.equal(alarmed.source, 'live')
  assert.equal(alarmed.updatedAt, 2000)
  assert.match(alarmed.note, /ROBOT-TEMP-01/)
})

test('resolveBoundDeviceReading evaluates mock baseline against configured thresholds', () => {
  // Default mock COVI reading is '12 ppm / 0.002 m⁻¹'; setting warningThreshold=10 should escalate to warning.
  const coviAsset: AssetRecord = {
    id: 'covi-1',
    code: 'COVI-01',
    name: 'CO/VI 监测器',
    kind: 'covi',
    boreId: 'bore-1',
    chainage: 300,
    lateral: -4.2,
    height: 2.5,
    heading: 0,
    telemetry: {
      pointId: 'SCADA-CO-01',
      metric: 'CO 浓度',
      unit: 'ppm',
      warningThreshold: 10,
      alarmThreshold: 50,
    },
  }

  const snapshot: TelemetrySnapshot = { connection: 'mock', readings: {} }
  const reading = resolveBoundDeviceReading(coviDevice, coviAsset, snapshot, initialSystems, 1800)
  assert.ok(reading)
  assert.equal(reading.severity, 'warning')
  assert.equal(reading.status, '阈值预警')
  assert.equal(reading.source, 'mock')
})

test('mergeBoundDeviceAlerts merges bound alarms, sorts alarm before warning and clears on recovery', () => {
  const assets: AssetRecord[] = [
    {
      id: 'covi-1',
      code: 'COVI-01',
      name: 'CO/VI 监测器',
      kind: 'covi',
      boreId: 'bore-1',
      chainage: 300,
      lateral: -4.2,
      height: 2.5,
      heading: 0,
      telemetry: { pointId: 'SCADA-CO-01', metric: 'CO', unit: 'ppm', warningThreshold: 10, alarmThreshold: 50 },
    },
    {
      id: 'custom-1',
      code: 'GLB-1',
      name: '巡检机器人',
      kind: 'custom',
      boreId: 'bore-1',
      chainage: 420,
      lateral: 0,
      height: 0.4,
      heading: 0,
      customModelId: 'glb-robot',
      telemetry: { pointId: 'ROBOT-TEMP-01', metric: '温度', unit: '°C', warningThreshold: 60, alarmThreshold: 80 },
    },
  ]

  const snapshot: TelemetrySnapshot = {
    connection: 'connected',
    readings: {
      'ROBOT-TEMP-01': {
        deviceId: 'ROBOT-TEMP-01',
        status: '在线',
        value: '88',
        severity: 'normal',
        note: '实时上报',
        updatedAt: 3000,
        source: 'live',
      },
    },
  }

  const base = activeDeviceAlerts([coviDevice, customDevice], initialSystems, 1800)
  const merged = mergeBoundDeviceAlerts(base, [coviDevice, customDevice], assets, snapshot, initialSystems, 1800)

  assert.equal(merged.length, 2)
  // Alarm (custom-1) must sort ahead of warning (covi-1)
  assert.equal(merged[0]!.device.id, 'custom-1')
  assert.equal(merged[0]!.severity, 'alarm')
  assert.equal(merged[0]!.pointId, 'ROBOT-TEMP-01')
  assert.equal(merged[0]!.source, 'live')
  assert.equal(merged[1]!.device.id, 'covi-1')
  assert.equal(merged[1]!.severity, 'warning')

  // Recovery clears custom-1 alert
  snapshot.readings['ROBOT-TEMP-01']!.value = '42'
  const recovered = mergeBoundDeviceAlerts(base, [coviDevice, customDevice], assets, snapshot, initialSystems, 1800)
  assert.equal(recovered.length, 1)
  assert.equal(recovered[0]!.device.id, 'covi-1')
})

test('applyTelemetryToOverlays updates bound device overlays while leaving vehicle cards untouched', () => {
  const overlays: SceneOverlay[] = [
    {
      id: 'veh-1',
      title: '苏A·88888',
      value: '62 km/h',
      status: '正常行驶',
      severity: 'normal',
      selected: false,
      x: 100,
      y: 120,
      distance: 35,
      plateColor: '蓝牌',
    },
    {
      id: 'covi-1',
      title: 'CO/VI 监测器',
      value: '12 ppm',
      status: '正常',
      severity: 'normal',
      selected: false,
      x: 200,
      y: 180,
      distance: 42,
    },
  ]

  const assets: AssetRecord[] = [
    {
      id: 'covi-1',
      code: 'COVI-01',
      name: 'CO/VI 监测器',
      kind: 'covi',
      boreId: 'bore-1',
      chainage: 300,
      lateral: -4.2,
      height: 2.5,
      heading: 0,
      telemetry: { pointId: 'SCADA-CO-01', metric: 'CO', unit: 'ppm', warningThreshold: 30, alarmThreshold: 50 },
    },
  ]

  const snapshot: TelemetrySnapshot = {
    connection: 'connected',
    readings: {
      'SCADA-CO-01': {
        deviceId: 'SCADA-CO-01',
        status: '在线',
        value: '62',
        severity: 'normal',
        note: '实时上报',
        updatedAt: 5000,
        source: 'live',
      },
    },
  }

  const next = applyTelemetryToOverlays(overlays, assets, snapshot, [coviDevice], initialSystems, 1800)
  assert.deepEqual(next[0], overlays[0])
  assert.equal(next[1]!.value, '62 ppm')
  assert.equal(next[1]!.status, '阈值告警')
  assert.equal(next[1]!.severity, 'alarm')
  assert.equal(next[1]!.sourceTag, '实时')
})
