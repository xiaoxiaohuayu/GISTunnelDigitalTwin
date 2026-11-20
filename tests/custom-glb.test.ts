import test from 'node:test'
import assert from 'node:assert/strict'
import { parseGlbBounds } from '../src/engines/glbBounds.ts'
import { isValidRemoteModelUrl } from '../src/engines/customModelLibrary.ts'
import { defaultProject, projectErrors } from '../src/engines/projectConfig.ts'

function createMinimalGlb(doc: unknown): ArrayBuffer {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(doc))
  const paddedLen = Math.ceil(jsonBytes.byteLength / 4) * 4
  const totalLen = 12 + 8 + paddedLen
  const buffer = new ArrayBuffer(totalLen)
  const view = new DataView(buffer)
  view.setUint32(0, 0x46546c67, true) // 'glTF'
  view.setUint32(4, 2, true) // version 2
  view.setUint32(8, totalLen, true)
  view.setUint32(12, paddedLen, true)
  view.setUint32(16, 0x4e4f534a, true) // 'JSON'
  const out = new Uint8Array(buffer, 20, paddedLen)
  out.fill(0x20)
  out.set(jsonBytes)
  return buffer
}

test('parseGlbBounds extracts glTF 2.0 POSITION bounds mapped to Cesium ENU frame', () => {
  const glb = createMinimalGlb({
    asset: { version: '2.0' },
    accessors: [
      { min: [-1.5, 0, -0.8], max: [1.5, 2.4, 0.8] },
    ],
    meshes: [
      { primitives: [{ attributes: { POSITION: 0 } }] },
    ],
  })

  const result = parseGlbBounds(glb)
  assert.equal(result.primitiveCount, 1)
  // glTF X -> Cesium X (3.0), glTF Z -> Cesium Y (1.6), glTF Y -> Cesium Z (2.4)
  assert.deepEqual(result.bounds, [3, 1.6, 2.4])
  assert.deepEqual(result.centerOffset, [0, 0, 1.2])
})

test('parseGlbBounds rejects non-GLB binaries and falls back cleanly when meshes have no bounds', () => {
  const invalid = new Uint8Array(32).buffer
  assert.throws(() => parseGlbBounds(invalid), /格式无效/)

  const emptyMesh = createMinimalGlb({ asset: { version: '2.0' }, meshes: [] })
  const fallback = parseGlbBounds(emptyMesh)
  assert.equal(fallback.primitiveCount, 0)
  assert.deepEqual(fallback.bounds, [1.8, 1.8, 1.8])
})

test('isValidRemoteModelUrl and projectErrors validate custom GLB records', () => {
  assert.equal(isValidRemoteModelUrl('https://cdn.example.com/models/robot.glb'), true)
  assert.equal(isValidRemoteModelUrl('/models/local.glb'), true)
  assert.equal(isValidRemoteModelUrl('javascript:alert(1)'), false)
  assert.equal(isValidRemoteModelUrl(''), false)

  const project = defaultProject()
  project.assets = [
    {
      id: 'custom-1',
      code: 'GLB-1',
      name: '巡检机器人',
      kind: 'custom',
      boreId: 'bore-1',
      chainage: 180,
      lateral: 0,
      height: 0.5,
      heading: 0,
      customModelId: 'glb-demo',
    },
  ]
  assert.deepEqual(projectErrors(project), [])

  delete project.assets[0]!.customModelId
  assert.ok(projectErrors(project).some(msg => msg.includes('缺少模型资产引用')))
})
