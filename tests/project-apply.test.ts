import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultProject } from '../src/engines/projectConfig.ts'
import type { TunnelProject } from '../src/engines/projectConfig.ts'
import { applyTunnelProject, projectUpdateKind } from '../src/engines/projectApply.ts'
import type { ProjectApplyHost } from '../src/engines/projectApply.ts'

function asset(id: string, kind: TunnelProject['assets'][number]['kind']): TunnelProject['assets'][number] {
  return { id, code: id, name: id, kind, boreId: 'bore-1', chainage: 100, lateral: 0, height: 4, heading: 0 }
}

test('a station edit stays on the record path, a section edit rebuilds', () => {
  const previous = defaultProject()
  previous.assets = [asset('basic-kept', 'basic')]
  const moved = structuredClone(previous)
  moved.assets[0]!.chainage = 800
  assert.equal(projectUpdateKind(previous, moved), 'records')
  const widened = structuredClone(previous)
  widened.section = { templateHalf: 5 }
  assert.equal(projectUpdateKind(previous, widened), 'rebuild')
  const lamp = structuredClone(previous)
  lamp.assets.push(asset('camera-2', 'camera'))
  assert.equal(projectUpdateKind(previous, lamp), 'inventory')
  const passage = structuredClone(previous)
  passage.assets.push(asset('walk-1', 'pedestrian'))
  assert.equal(projectUpdateKind(previous, passage), 'rebuild')
  const lanes = structuredClone(previous)
  lanes.bores[0]!.laneWidth = 4
  assert.equal(projectUpdateKind(previous, lanes), 'inventory')
  const renamed = structuredClone(previous)
  renamed.mouths = [{ boreId: 'bore-1', end: 0, name: '青山西口' }]
  assert.equal(projectUpdateKind(previous, renamed), 'records')
})

test('a failed update restores the previous project once', async () => {
  const previous = defaultProject()
  const next = structuredClone(previous)
  next.section = { basicSpacing: 12 }
  const calls: string[] = []
  const host: ProjectApplyHost = {
    async moveRecords() { calls.push('records') },
    async updateInventory() { calls.push('inventory') },
    async rebuild() { calls.push('rebuild'); throw new Error('模型重建失败') },
    async restore(project) { calls.push(`restore:${project.name}`) },
  }
  await assert.rejects(applyTunnelProject(host, previous, next), /模型重建失败/)
  assert.deepEqual(calls, ['rebuild', `restore:${previous.name}`])
})

test('a failed restore reports both errors and a recovery rebuild does not try again', async () => {
  const previous = defaultProject()
  const next = structuredClone(previous)
  next.origin = { ...next.origin, heading: 10 }
  const host: ProjectApplyHost = {
    async moveRecords() {},
    async updateInventory() {},
    async rebuild() { throw new Error('首帧失败') },
    async restore() { throw new Error('缓存写入失败') },
  }
  await assert.rejects(applyTunnelProject(host, previous, next), /首帧失败；恢复上一版配置失败：缓存写入失败/)
  await assert.rejects(applyTunnelProject(host, previous, previous, true), /首帧失败/)
})
