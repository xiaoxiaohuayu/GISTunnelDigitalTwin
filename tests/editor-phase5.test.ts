import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SCENE_VISUALS, defaultProject, projectErrors } from '../src/engines/projectConfig.ts'
import type { CameraBookmark, TelemetryBinding } from '../src/engines/projectConfig.ts'
import { EditorStore, evaluateTelemetryBinding } from '../src/editor/index.ts'
import type { TelemetrySnapshot } from '../src/services/types.ts'

test('evaluateTelemetryBinding resolves live readings, escalates thresholds and formats units', () => {
  const binding: TelemetryBinding = {
    pointId: 'PLC-CO-01',
    metric: 'CO 浓度',
    unit: 'ppm',
    warningThreshold: 30,
    alarmThreshold: 50,
  }

  const snapshot: TelemetrySnapshot = {
    connection: 'connected',
    readings: {
      'PLC-CO-01': {
        deviceId: 'PLC-CO-01',
        status: '在线',
        value: '54.2',
        severity: 'normal',
        note: '实时上报',
        updatedAt: 1000,
        source: 'live',
      },
    },
  }

  const alarmEval = evaluateTelemetryBinding(binding, snapshot)
  assert.equal(alarmEval.severity, 'alarm')
  assert.equal(alarmEval.formattedValue, '54.2 ppm')
  assert.equal(alarmEval.source, 'live')

  // Warning threshold check
  snapshot.readings['PLC-CO-01']!.value = '35 ppm'
  const warnEval = evaluateTelemetryBinding(binding, snapshot)
  assert.equal(warnEval.severity, 'warning')
  assert.equal(warnEval.formattedValue, '35 ppm')

  // Missing live reading falls back cleanly to unbound when no fallback given
  const unbound = evaluateTelemetryBinding({ pointId: 'MISSING-01', metric: '风速' }, snapshot)
  assert.equal(unbound.source, 'unbound')
  assert.equal(unbound.formattedValue, '—')
})

test('projectErrors validates camera bookmarks, scene visuals and telemetry bindings', () => {
  const project = defaultProject()
  project.visuals = { ...DEFAULT_SCENE_VISUALS, sunIntensity: 3.1, fogDensity: 0.0015 }
  project.bookmarks = [
    { id: 'bm-1', name: '入口俯瞰', longitude: 118.8, latitude: 32.1, height: 820, heading: 90, pitch: -20, roll: 0 },
  ]
  project.assets = [
    {
      id: 'covi-1',
      code: 'COVI-01',
      name: 'CO/VI 监测器',
      kind: 'covi',
      boreId: 'bore-1',
      chainage: 200,
      lateral: -4.2,
      height: 2.5,
      heading: 0,
      telemetry: { pointId: 'SCADA-COVI-01', metric: 'CO', unit: 'ppm', warningThreshold: 30, alarmThreshold: 50 },
    },
  ]
  assert.deepEqual(projectErrors(project), [])

  // Alarm threshold < warning threshold should fail
  project.assets[0]!.telemetry!.alarmThreshold = 20
  assert.ok(projectErrors(project).some(msg => msg.includes('告警阈值不能小于预警阈值')))
  project.assets[0]!.telemetry!.alarmThreshold = 50

  // Invalid visuals should fail
  project.visuals.sunIntensity = 12
  assert.ok(projectErrors(project).some(msg => msg.includes('场景光影与雾效参数')))
  project.visuals.sunIntensity = 2.4

  // Invalid bookmark should fail
  project.bookmarks.push({ id: 'bm-2', name: '   ', longitude: 0, latitude: 0, height: 0, heading: 0, pitch: 0, roll: 0 })
  assert.ok(projectErrors(project).some(msg => msg.includes('相机视角书签')))
})

test('EditorStore records bookmark additions and visual tweaks in undo/redo stack', async () => {
  const store = new EditorStore({ project: defaultProject() })
  const bookmark: CameraBookmark = {
    id: 'bm-portal',
    name: '洞口视角',
    longitude: 118.81,
    latitude: 32.05,
    height: 740,
    heading: 75,
    pitch: -15,
    roll: 0,
  }

  await store.updateProject(draft => {
    draft.bookmarks = [...(draft.bookmarks ?? []), bookmark]
  }, '新增相机书签 洞口视角')
  assert.equal(store.getSnapshot().project.bookmarks?.length, 1)
  assert.equal(store.getSnapshot().lastUpdateKind, 'records')

  await store.updateProject(draft => {
    draft.visuals = { ...DEFAULT_SCENE_VISUALS, fogDensity: 0.002 }
  }, '调整场景光影')
  assert.equal(store.getSnapshot().project.visuals?.fogDensity, 0.002)

  assert.equal(await store.undo(), true)
  assert.equal(store.getSnapshot().project.visuals, undefined)
  assert.equal(store.getSnapshot().project.bookmarks?.length, 1)

  assert.equal(await store.undo(), true)
  assert.equal(store.getSnapshot().project.bookmarks?.length ?? 0, 0)
})
