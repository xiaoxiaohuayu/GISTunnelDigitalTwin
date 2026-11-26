import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultProject, projectErrors } from '../src/engines/projectConfig.ts'
import { resolveDropLocation } from '../src/engines/dropPlacement.ts'
import { EditorStore } from '../src/editor/index.ts'

test('resolveDropLocation picks nearest bore, flips localY sign and clamps bounds', () => {
  const project = defaultProject()
  const [bore1, bore2] = project.bores as [typeof project.bores[0], typeof project.bores[0]]

  // Closer to bore2 (localY = -2.4 => AssetRecord.lateral = +2.4)
  const hit = resolveDropLocation([
    { bore: bore1, station: 320.44, localY: 21.6, height: 3.16 },
    { bore: bore2, station: 320.44, localY: -2.44, height: 3.16 },
  ])
  assert.ok(hit)
  assert.equal(hit.boreId, bore2.id)
  assert.equal(hit.chainage, 320.4)
  assert.equal(hit.lateral, 2.4)
  assert.equal(hit.height, 3.2)

  // Handles decreasing chainage bore and clamps extreme values
  const reverseBore = { ...bore1, id: 'bore-rev', start: 2000, end: 100 }
  const revHit = resolveDropLocation([
    { bore: reverseBore, station: 500, localY: -60, height: -4 },
  ])
  assert.ok(revHit)
  assert.equal(revHit.chainage, 1500)
  assert.equal(revHit.lateral, 30)
  assert.equal(revHit.height, 0)
})

test('EditorStore toggles visible and locked with incremental commit and Undo/Redo', async () => {
  const committed: string[] = []
  const project = defaultProject()
  project.assets = [
    { id: 'cam-1', code: 'CAM-01', name: '枪机 01', kind: 'camera', boreId: 'bore-1', chainage: 150, lateral: -3, height: 4.2, heading: 0 },
  ]
  assert.deepEqual(projectErrors(project), [])

  const store = new EditorStore({
    project,
    bridge: {
      async commitAssetRecord(record) {
        committed.push(`${record.id}:v=${record.visible !== false}:l=${Boolean(record.locked)}`)
      },
      async applyProject() {
        committed.push('applyProject')
      },
    },
  })

  await store.commitAssetTransform('cam-1', { visible: false }, { label: '隐藏设备 CAM-01' })
  assert.equal(store.getSnapshot().project.assets[0]!.visible, false)

  await store.commitAssetTransform('cam-1', { locked: true }, { label: '锁定设备 CAM-01' })
  assert.equal(store.getSnapshot().project.assets[0]!.locked, true)

  assert.equal(await store.undo(), true)
  assert.equal(store.getSnapshot().project.assets[0]!.locked, undefined)
  assert.equal(store.getSnapshot().project.assets[0]!.visible, false)

  assert.equal(await store.undo(), true)
  assert.equal(store.getSnapshot().project.assets[0]!.visible, undefined)

  assert.deepEqual(committed, [
    'cam-1:v=false:l=false',
    'cam-1:v=false:l=true',
    'cam-1:v=false:l=false',
    'cam-1:v=true:l=false',
  ])
})
