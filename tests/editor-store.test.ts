import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultProject } from '../src/engines/projectConfig.ts'
import type { AssetRecord, TunnelProject } from '../src/engines/projectConfig.ts'
import { CommandStack, EditorStore, createCesiumEditorBridge } from '../src/editor/index.ts'
import type { EditorCommand, EditorSceneBridge } from '../src/editor/index.ts'

function sampleAsset(overrides: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id: 'cam-1',
    code: 'CAM-01',
    name: '洞内枪机 01',
    kind: 'camera',
    boreId: 'bore-1',
    chainage: 120,
    lateral: -3.2,
    height: 4.5,
    heading: 0,
    ...overrides,
  }
}

function sampleProject(assets: AssetRecord[] = [sampleAsset()]): TunnelProject {
  const project = defaultProject()
  project.assets = assets
  return project
}

test('CommandStack supports execute, undo, redo, maxDepth and clean dirty tracking', () => {
  const stack = new CommandStack<number>({ maxDepth: 2 })
  const add = (delta: number, ts: number): EditorCommand<number> => ({
    id: `add-${delta}-${ts}`,
    label: `+${delta}`,
    timestamp: ts,
    apply: state => state + delta,
    revert: state => state - delta,
  })

  let value = 0
  assert.equal(stack.isDirty, false)

  value = stack.execute(value, add(1, 100))
  value = stack.execute(value, add(2, 200))
  value = stack.execute(value, add(3, 300))
  assert.equal(value, 6)
  assert.equal(stack.undoCount, 2)
  assert.equal(stack.isDirty, true)

  stack.markSaved()
  assert.equal(stack.isDirty, false)

  const undone = stack.undo(value)
  assert.ok(undone)
  value = undone.state
  assert.equal(value, 3)
  assert.equal(stack.isDirty, true)
  assert.equal(stack.canRedo, true)

  const redone = stack.redo(value)
  assert.ok(redone)
  value = redone.state
  assert.equal(value, 6)
  assert.equal(stack.isDirty, false)
})

test('CommandStack coalesces commands with matching mergeKey within time window', () => {
  const stack = new CommandStack<number>({ coalesceWindowMs: 500 })
  const setValue = (from: number, to: number, timestamp: number): EditorCommand<number> => ({
    id: `set-${to}`,
    label: `set ${to}`,
    timestamp,
    mergeKey: 'drag:x',
    apply: () => to,
    revert: () => from,
    merge(next) {
      const target = next.apply(to)
      return setValue(from, target, next.timestamp)
    },
  })

  let value = 10
  value = stack.execute(value, setValue(10, 12, 1000))
  value = stack.execute(value, setValue(12, 15, 1300))
  assert.equal(value, 15)
  assert.equal(stack.undoCount, 1)

  // Outside window should push a separate step.
  value = stack.execute(value, setValue(15, 20, 2000))
  assert.equal(value, 20)
  assert.equal(stack.undoCount, 2)

  value = stack.undo(value)!.state
  assert.equal(value, 15)
  value = stack.undo(value)!.state
  assert.equal(value, 10)
})

test('EditorStore routes single-asset transforms to incremental commitAssetRecord and supports undo/redo', async () => {
  const calls: string[] = []
  let now = 1000
  const bridge: EditorSceneBridge = {
    previewAsset(record) {
      calls.push(`preview:${record.id}:${record.chainage}`)
    },
    async commitAssetRecord(record) {
      calls.push(`commit:${record.id}:${record.chainage}:${record.heading}`)
    },
    async applyProject() {
      calls.push('applyProject')
    },
  }

  const store = new EditorStore({
    project: sampleProject(),
    bridge,
    now: () => now,
  })

  const previewed = store.previewAssetTransform('cam-1', { chainage: 145 })
  assert.equal(previewed?.chainage, 145)
  assert.equal(store.getSnapshot().canUndo, false)

  await store.commitAssetTransform('cam-1', { chainage: 150, heading: 45 }, { mergeKey: 'gizmo:cam-1' })
  assert.equal(store.getSnapshot().project.assets[0]!.chainage, 150)
  assert.equal(store.getSnapshot().project.assets[0]!.heading, 45)
  assert.equal(store.getSnapshot().lastUpdateKind, 'records')
  assert.equal(store.getSnapshot().undoCount, 1)

  // Rapid follow-up within coalesce window merges into 1 undo entry.
  now += 200
  await store.commitAssetTransform('cam-1', { chainage: 165, heading: 90 }, { mergeKey: 'gizmo:cam-1' })
  assert.equal(store.getSnapshot().undoCount, 1)
  assert.equal(store.getSnapshot().project.assets[0]!.chainage, 165)

  assert.equal(await store.undo(), true)
  assert.equal(store.getSnapshot().project.assets[0]!.chainage, 120)
  assert.equal(store.getSnapshot().project.assets[0]!.heading, 0)

  assert.equal(await store.redo(), true)
  assert.equal(store.getSnapshot().project.assets[0]!.chainage, 165)
  assert.equal(store.getSnapshot().project.assets[0]!.heading, 90)

  assert.deepEqual(calls, [
    'preview:cam-1:145',
    'commit:cam-1:150:45',
    'commit:cam-1:165:90',
    'commit:cam-1:120:0',
    'commit:cam-1:165:90',
  ])
})

test('EditorStore handles add, duplicate, delete, selection cleanup and bridge failure rollback', async () => {
  let shouldFail = false
  const bridgeCalls: string[] = []
  let seq = 0
  const bridge = createCesiumEditorBridge({
    previewAsset() {},
    async commitAssetRecord(record) {
      if (shouldFail) throw new Error('写入失败')
      bridgeCalls.push(`commit:${record.id}`)
    },
    async applyProject(project) {
      if (shouldFail) throw new Error('重建失败')
      bridgeCalls.push(`apply:${project.assets.length}`)
    },
  })

  const store = new EditorStore({
    project: sampleProject(),
    bridge,
    idGenerator: () => `gen-${++seq}`,
  })

  await store.addAsset(sampleAsset({ id: 'fan-1', code: 'FAN-01', kind: 'fan', chainage: 200 }))
  assert.equal(store.getSnapshot().project.assets.length, 2)
  assert.deepEqual(store.getSnapshot().selectedIds, ['fan-1'])
  assert.equal(store.getSnapshot().lastUpdateKind, 'inventory')

  const clones = await store.duplicateAssets(['fan-1'], 10)
  assert.equal(clones.length, 1)
  assert.equal(clones[0]!.code, 'FAN-01-COPY')
  assert.equal(clones[0]!.chainage, 210)
  assert.equal(store.getSnapshot().project.assets.length, 3)

  await store.deleteAssets([clones[0]!.id])
  assert.equal(store.getSnapshot().project.assets.length, 2)
  assert.deepEqual(store.getSnapshot().selectedIds, [])

  // Bridge failure during undo must preserve stack and project state.
  shouldFail = true
  await assert.rejects(store.undo(), /重建失败/)
  assert.equal(store.getSnapshot().project.assets.length, 2)
  assert.equal(store.getSnapshot().canUndo, true)

  // Recovery after bridge works again.
  shouldFail = false
  assert.equal(await store.undo(), true)
  assert.equal(store.getSnapshot().project.assets.length, 3)
  assert.ok(bridgeCalls.includes('apply:2'))
})

test('EditorStore rejects invalid project edits before touching bridge or history', async () => {
  let called = false
  const store = new EditorStore({
    project: sampleProject(),
    bridge: {
      async applyProject() {
        called = true
      },
    },
  })

  await assert.rejects(
    store.updateProject(draft => {
      draft.name = '   '
    }, '清空隧道名'),
    /隧道名称/,
  )
  assert.equal(called, false)
  assert.equal(store.getSnapshot().canUndo, false)
  assert.ok(store.getSnapshot().error)
})
