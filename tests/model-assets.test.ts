import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { Matrix4, Quaternion, Vector3, Vector4 } from 'three'

const root = new URL('../', import.meta.url).pathname
const assets = join(root, 'src/assets/modelAssets')
function files(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap(item =>
    item.isDirectory() ? files(join(path, item.name)) : [join(path, item.name)])
}
function glb(path: string) {
  const bytes = readFileSync(path)
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', path)
  assert.equal(bytes.readUInt32LE(4), 2, path)
  assert.equal(bytes.readUInt32LE(8), bytes.length, path)
  const length = bytes.readUInt32LE(12)
  const doc = JSON.parse(bytes.toString('utf8', 20, 20 + length))
  doc.binary = bytes.subarray(28 + length)
  return doc
}
function dimensions(doc: any): number[] {
  const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity)
  const worlds = new Map<number, Matrix4>()
  function visit(index: number, parent: Matrix4) {
    const n = doc.nodes[index]
    const local = n.matrix ? new Matrix4().fromArray(n.matrix) : new Matrix4().compose(
      new Vector3().fromArray(n.translation ?? [0, 0, 0]),
      new Quaternion().fromArray(n.rotation ?? [0, 0, 0, 1]),
      new Vector3().fromArray(n.scale ?? [1, 1, 1]))
    const world = parent.clone().multiply(local); worlds.set(index, world)
    for (const child of n.children ?? []) visit(child, world)
  }
  for (const index of doc.scenes[doc.scene ?? 0].nodes) visit(index, new Matrix4())
  function accessor(index: number): number[][] {
    const a = doc.accessors[index], view = doc.bufferViews[a.bufferView]
    const count = { VEC3: 3, VEC4: 4, MAT4: 16 }[a.type as 'VEC3' | 'VEC4' | 'MAT4']
    const size = a.componentType === 5126 ? 4 : a.componentType === 5123 ? 2 : 1
    return Array.from({ length: a.count }, (_, i) => Array.from({ length: count }, (_, j) => {
      const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (view.byteStride ?? count * size) + j * size
      const value = size === 4 ? doc.binary.readFloatLE(offset) : size === 2 ? doc.binary.readUInt16LE(offset) : doc.binary[offset]
      return a.normalized ? value / (size === 2 ? 65535 : 255) : value
    }))
  }
  for (const [index, world] of worlds) {
    const node = doc.nodes[index]
    if (node.mesh === undefined) continue
    for (const primitive of doc.meshes[node.mesh].primitives) {
      const positions = accessor(primitive.attributes.POSITION)
      if (node.skin === undefined) for (const p of positions) {
        const v = new Vector3().fromArray(p).applyMatrix4(world); min.min(v); max.max(v)
      }
      else {
        const skin = doc.skins[node.skin], binds = accessor(skin.inverseBindMatrices)
        const joints = accessor(primitive.attributes.JOINTS_0), weights = accessor(primitive.attributes.WEIGHTS_0)
        const matrices = skin.joints.map((joint: number, i: number) => worlds.get(joint)!.clone().multiply(new Matrix4().fromArray(binds[i]!)))
        positions.forEach((p, i) => {
          const result = new Vector4(0, 0, 0, 0)
          for (let k = 0; k < 4; k++) result.add(new Vector4(p[0], p[1], p[2], 1).applyMatrix4(matrices[joints[i]![k]!]).multiplyScalar(weights[i]![k]!))
          const v = new Vector3(result.x, result.y, result.z); min.min(v); max.max(v)
        })
      }
    }
  }
  return max.sub(min).toArray()
}

test('every migrated original is preserved byte-for-byte at its recorded destination', () => {
  const records = JSON.parse(readFileSync(join(root, 'docs/model-assets/migration.json'), 'utf8'))
  assert.equal(records.length, 147)
  for (const record of records) {
    const bytes = readFileSync(join(root, record.preservedAt ?? record.to))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256, record.from)
    assert.equal(existsSync(join(root, record.from)), false, record.from)
  }
})
test('runtime GLBs are self-contained and names are unique outside the archive', () => {
  const names = new Set<string>()
  for (const path of files(assets)) {
    if (path.endsWith('.md') || path.endsWith('/.DS_Store')) continue
    assert.ok(path.endsWith('.glb'), path)
    const doc = glb(path)
    for (const entry of [...(doc.buffers ?? []), ...(doc.images ?? [])]) assert.equal(entry.uri, undefined, path)
    if (!path.includes('/legacy/')) {
      const name = path.split('/').at(-1)!
      assert.ok(!names.has(name), name); names.add(name)
    }
  }
})
test('converted models have metre dimensions, single human detail and retained worker rig', () => {
  const van = glb(join(assets, 'vehicles/car-van.glb'))
  assert.ok(Math.abs(dimensions(van)[0]! - 5) < .01)
  for (const name of ['human', 'worker']) {
    const doc = glb(join(assets, `characters/${name}.glb`))
    assert.ok(Math.abs(dimensions(doc)[1]! - 1.75) < .02, name)
    if (name === 'human') assert.equal(doc.meshes.length, 1)
    else {
      assert.ok(doc.skins.length > 0); assert.ok(doc.animations.length > 0)
      const roots = doc.scenes[doc.scene ?? 0].nodes
      doc.nodes.forEach((n: any, i: number) => { if (n.skin !== undefined) assert.ok(roots.includes(i), 'skinned mesh bounds must not inherit the FBX centimetre scale') })
    }
  }
  const station = glb(join(assets, 'equipment/substation-new.glb'))
  const size = dimensions(station)
  assert.ok(Math.abs(size[2]! - 8.5) < .01)
  assert.ok(size.every(n => n < 12))
  const portal = glb(join(assets, 'portal/portal-structures.glb'))
  assert.ok(portal.nodes.filter((n: any) => n.name?.startsWith('substation')).every((n: any) => n.mesh === undefined))
  const original = glb(join(assets, 'legacy/portal-structures-original.glb'))
  assert.ok(original.nodes.some((n: any) => n.name?.startsWith('substation') && n.mesh !== undefined))
})
test('source glTF files retain their external buffers and texture dependencies', () => {
  for (const path of files(join(root, 'modelSources')).filter(path => path.endsWith('.gltf'))) {
    const doc = JSON.parse(readFileSync(path, 'utf8'))
    for (const entry of [...(doc.buffers ?? []), ...(doc.images ?? [])]) {
      if (entry.uri && !entry.uri.startsWith('data:')) assert.ok(existsSync(new URL(entry.uri, `file://${path}`)), `${path}: ${entry.uri}`)
    }
  }
})

test('Fir replacement preserves tree and rock placements and retains ground geometry', () => {
  const before = glb(join(assets, 'legacy/portal-terrain-before-fab.glb'))
  const after = glb(join(assets, 'portal/portal-terrain.glb'))
  assert.ok(after.extensionsUsed.includes('EXT_mesh_gpu_instancing'))
  assert.ok(after.extensionsUsed.includes('KHR_draco_mesh_compression'))
  assert.ok(readFileSync(join(assets, 'portal/portal-terrain.glb')).length < 20_000_000)
  function attributeBytes(doc: any, index: number): Buffer {
    const a = doc.accessors[index], view = doc.bufferViews[a.bufferView]
    assert.equal(a.componentType, 5126)
    const size = (a.type === 'VEC4' ? 4 : 3) * 4
    const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0)
    return Buffer.concat(Array.from({ length: a.count }, (_, i) =>
      doc.binary.subarray(start + i * (view.byteStride ?? size), start + i * (view.byteStride ?? size) + size)))
  }
  function placements(doc: any, tree: boolean): string[] {
    return doc.nodes.flatMap((node: any) => {
      const name = doc.meshes[node.mesh]?.name ?? ''
      const isTree = name === 'tree.001' || name === '平面.003' || /^fir-[abc]-lod[023]$/.test(name)
      const isRock = name.startsWith('stone_small_')
      if (tree ? !isTree : !isRock) return []
      const attrs = node.extensions.EXT_mesh_gpu_instancing.attributes
      const t = attributeBytes(doc, attrs.TRANSLATION), r = attributeBytes(doc, attrs.ROTATION), scale = attributeBytes(doc, attrs.SCALE)
      return Array.from({ length: doc.accessors[attrs.TRANSLATION].count }, (_, i) =>
        Buffer.concat([t.subarray(i * 12, i * 12 + 12), r.subarray(i * 16, i * 16 + 16), scale.subarray(i * 12, i * 12 + 12)]).toString('hex'))
    }).sort()
  }
  assert.equal(placements(after, true).length, 200)
  assert.equal(placements(after, false).length, 87)
  assert.deepEqual(placements(after, true), placements(before, true))
  assert.deepEqual(placements(after, false), placements(before, false))
  for (const mesh of before.meshes.filter((m: any) => !['tree.001', '平面.003'].includes(m.name))) {
    const next = after.meshes.find((m: any) => m.name === mesh.name)
    assert.ok(next, mesh.name)
    assert.equal(next.primitives.length, mesh.primitives.length)
    mesh.primitives.forEach((p: any, i: number) => {
      const primitive=next.primitives[i]
      if(mesh.name==='立方体') {
        // The approach keeps its sides and gains a grid for local grass colours.
        assert.equal(after.accessors[primitive.indices].count,13530)
        assert.ok(primitive.attributes.COLOR_0!==undefined)
        assert.equal(after.accessors[primitive.attributes.COLOR_0].count,after.accessors[primitive.attributes.POSITION].count)
      } else assert.equal(after.accessors[primitive.indices].count, before.accessors[p.indices].count, mesh.name)
    })
  }
  const firs = after.meshes.filter((m: any) => /^fir-[abc]-lod[023]$/.test(m.name))
  assert.equal(firs.length, 9)
  for (const mesh of firs) {
    const far = mesh.name.endsWith('3')
    assert.equal(mesh.primitives.length, far ? 1 : 2, mesh.name)
    const leaves = mesh.primitives.map((p: any) => after.materials[p.material]).find((m: any) => /needles|billboard/.test(m.name))
    assert.ok(leaves, mesh.name)
    assert.equal(leaves.alphaMode, 'MASK'); assert.equal(leaves.doubleSided, true)
    if (far) assert.ok(leaves.extensions.KHR_materials_unlit)
  }
})

test('Fab grass stays off the roadway and the substation pad; radar retains a ceiling mount', () => {
  const terrain = glb(join(assets, 'portal/portal-terrain.glb'))
  const node = terrain.nodes.find((n: any) => n.name === 'Fab verge grass')
  assert.ok(node)
  const index = node.extensions.EXT_mesh_gpu_instancing.attributes.TRANSLATION
  const accessor = terrain.accessors[index], view = terrain.bufferViews[accessor.bufferView]
  assert.ok(accessor.count > 400 && accessor.count < 600)
  for (let i = 0; i < accessor.count; i++) {
    const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * (view.byteStride ?? 12)
    const x = terrain.binary.readFloatLE(offset), y = -terrain.binary.readFloatLE(offset + 8)
    assert.ok(x < -10 && x > -113)
    assert.ok(Math.abs(y) < 6 || Math.abs(y) > 21, 'grass must stay outside both carriageways')
    assert.ok(!(x > -57 && x < -43 && Math.abs(y) < 6), 'substation clearance')
  }
  const mesh = terrain.meshes[node.mesh]
  assert.equal(mesh.primitives.length, 3)
  for (const p of mesh.primitives) {
    assert.equal(terrain.materials[p.material].alphaMode, 'MASK')
    assert.equal(terrain.materials[p.material].doubleSided, true)
  }
  const radar = glb(join(assets, 'equipment/vehicle-detector.glb'))
  const size = dimensions(radar)
  assert.ok(size[1]! > .8 && size[1]! < .9, 'ceiling-mounted metre scale')
  assert.ok(!radar.nodes.some((n: any) => /Tripod|Flash|PowerSupply/.test(n.name)))
  assert.ok(radar.materials.some((m: any) => m.name === 'Ceiling mounting steel'))
})

test('downloaded wall camera keeps metre scale, PBR maps and attribution', () => {
  const camera = glb(join(assets, 'equipment/camera.glb'))
  assert.ok(camera.nodes.some((n: any) => n.name === 'fab-plaggy-camera'))
  assert.ok(Math.abs(dimensions(camera)[1]! - .55) < .001)
  assert.equal(camera.meshes[0].primitives.length, 4)
  assert.ok(camera.materials.some((m: any) => m.normalTexture))
  assert.ok(readFileSync(join(assets, 'equipment/camera.glb')).length < 1_000_000)
  const credits = readFileSync(join(root, 'public/model-credits.html'), 'utf8')
  for (const author of ['Charlie catling', 'GoldenBlack', 'plaggy']) assert.ok(credits.includes(author))
})
