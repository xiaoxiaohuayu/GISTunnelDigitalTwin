// @env browser
/**
 * 新路由洞口 GLB 几何变形与过滤模块（基于原版 src/engines/portalGeometry.ts 独立复制并重构）
 *
 * 相比原版的扩展：
 * - 在加载 `portal-structures.glb` 时，直接从 glTF 场景树中彻底移除烘焙的情报板节点
 *   （`structures / Anthracite board`、`structures / LED red`）及默认路灯节点（`streetlight.*`），
 *   并剔除 `x = -112 m` 处的门架立柱与横梁三角面，让新路由洞口完全干净，后续由场景编辑器自由配置。
 */
import type { TunnelProject } from '../../engines/projectConfig'
import { PROFILE_HALF, profileLateral } from '../../engines/sectionProfile'

export function studioPortalAlong(project: TunnelProject, end: number, y: number): number {
  if (end === 0 || project.bores.length === 1) return 0
  const lengths = project.bores.map(b => Math.abs(b.end - b.start))
  const longest = Math.max(...lengths)
  const t = Math.max(0, Math.min(1, y + 0.5))
  return (longest - lengths[1]!) * (1 - t) + (longest - lengths[0]!) * t
}

export function studioPortalNameLateral(
  project: TunnelProject | undefined,
  end: 0 | 1,
  tube: number,
): number {
  if (project) return end === 0 ? -project.bores[tube]!.offset : project.bores[tube]!.offset
  return (tube ^ end) === 0 ? -12 : 12
}

export function studioPortalLateral(project: TunnelProject, end: number, y: number): number {
  const source = y < 0 ? 0 : 1
  const tube = project.bores.length === 1 ? 0 : source ^ end
  const b = project.bores[tube]!
  const center = source === 0 ? -12 : 12
  const local = y - center
  const half = (b.lanes.length * b.laneWidth) / 2
  const mapped = profileLateral(local, half, project.section?.templateHalf ?? PROFILE_HALF)
  return (end === 0 ? -b.offset : b.offset) + mapped
}

/**
 * 判断节点是否为烘焙在 portal-structures.glb 中需要剔除的默认设备（情报板牌体/红字、路灯杆）
 */
function isRemovedBakedDeviceNode(nodeName: string | undefined): boolean {
  if (!nodeName) return false
  return (
    nodeName === 'structures / Anthracite board' ||
    nodeName === 'structures / LED red' ||
    nodeName.startsWith('streetlight')
  )
}

/**
 * 判断三角面顶点是否属于 x = -112 m 处的情报板钢门架（立柱/横梁）
 */
function isBakedPortalVmsVertex(x: number): boolean {
  // 门架立柱/横梁位于 x = -112 ± 0.10；护栏立柱位于 -114 与 -111，不落入此区间
  return x >= -112.45 && x <= -111.75
}

export async function studioPortalGeometryUrl(
  url: string,
  project: TunnelProject | undefined,
  end: number,
): Promise<string> {
  const isStructures = url.includes('portal-structures')
  if (!project && !isStructures) {
    return url
  }
  if (
    project &&
    !isStructures &&
    project.bores.length === 2 &&
    project.bores.every(
      (b, i) => b.offset === (i === 0 ? 12 : -12) && b.lanes.length * b.laneWidth === PROFILE_HALF * 2,
    ) &&
    Math.abs(project.bores[0]!.end - project.bores[0]!.start) ===
      Math.abs(project.bores[1]!.end - project.bores[1]!.start)
  ) {
    return url
  }

  const bytes = await (await fetch(url)).arrayBuffer()
  const view = new DataView(bytes)
  const jsonLength = view.getUint32(12, true)
  const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)))
  const binaryOffset = 28 + jsonLength
  const extra: Uint8Array[] = []
  let binaryLength = bytes.byteLength - binaryOffset
  const changed = new Set<number>()

  // 这些烘焙设备节点带有 node.translation，必须在顶点/平移循环前直接从 glTF 场景树中移除
  if (isStructures && Array.isArray(gltf.nodes)) {
    const removedNodeIndices = new Set<number>()
    gltf.nodes.forEach((node: { name?: string; mesh?: number }, idx: number) => {
      if (isRemovedBakedDeviceNode(node.name)) {
        removedNodeIndices.add(idx)
        delete node.mesh
      }
    })
    if (Array.isArray(gltf.scenes)) {
      for (const scene of gltf.scenes) {
        if (Array.isArray(scene.nodes)) {
          scene.nodes = scene.nodes.filter((idx: number) => !removedNodeIndices.has(idx))
        }
      }
    }
    for (const node of gltf.nodes) {
      if (Array.isArray(node.children)) {
        node.children = node.children.filter((idx: number) => !removedNodeIndices.has(idx))
      }
    }
  }

  for (const node of gltf.nodes) {
    if (isStructures && isRemovedBakedDeviceNode(node.name)) continue

    const instancing = node.extensions?.EXT_mesh_gpu_instancing
    if (instancing && project) {
      const accessor = gltf.accessors[instancing.attributes.TRANSLATION]
      if (accessor) {
        const buffer = gltf.bufferViews[accessor.bufferView]
        const start = binaryOffset + (buffer.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
        const stride = buffer.byteStride ?? 12
        for (let i = 0; i < accessor.count; i++) {
          const offset = start + i * stride
          const y = -view.getFloat32(offset + 8, true)
          view.setFloat32(offset, view.getFloat32(offset, true) + studioPortalAlong(project, end, y), true)
          view.setFloat32(offset + 8, -studioPortalLateral(project, end, y), true)
        }
      }
      continue
    }

    if (node.translation && project) {
      node.translation[0] += studioPortalAlong(project, end, -node.translation[2])
      node.translation[2] = -studioPortalLateral(project, end, -node.translation[2])
      continue
    }

    if (node.mesh === undefined) continue

    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const index = primitive.attributes.POSITION
      if (changed.has(index)) continue
      changed.add(index)

      const accessor = gltf.accessors[index]
      const buffer = gltf.bufferViews[accessor.bufferView]
      if (!buffer) continue
      if (accessor.componentType !== 5126) throw new Error('洞口顶点格式不支持')

      const stride = buffer.byteStride ?? 12
      const start = binaryOffset + (buffer.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
      const single = project ? project.bores.length === 1 : false
      const sourceYs = Array.from({ length: accessor.count }, (_, i) => -view.getFloat32(start + i * stride + 8, true))

      const alongByVertex = new Float64Array(accessor.count)
      if (project && end === 1 && project.bores.length === 2 && primitive.indices !== undefined) {
        const indices = gltf.accessors[primitive.indices]
        const ib = gltf.bufferViews[indices.bufferView]
        if (ib) {
          const parent = Int32Array.from({ length: accessor.count }, (_, i) => i)
          const root = (v: number): number => {
            while (parent[v] !== v) {
              parent[v] = parent[parent[v]!]!
              v = parent[v]!
            }
            return v
          }
          const offset = binaryOffset + (ib.byteOffset ?? 0) + (indices.byteOffset ?? 0)
          const size = indices.componentType === 5125 ? 4 : indices.componentType === 5123 ? 2 : 1
          const read = (i: number) =>
            size === 4
              ? view.getUint32(offset + i * size, true)
              : size === 2
                ? view.getUint16(offset + i * size, true)
                : view.getUint8(offset + i)
          for (let i = 0; i < indices.count; i += 3) {
            const a = root(read(i))
            parent[root(read(i + 1))] = a
            parent[root(read(i + 2))] = a
          }
          const sums = new Map<number, { sum: number; count: number }>()
          sourceYs.forEach((y, i) => {
            const key = root(i)
            const value = sums.get(key) ?? { sum: 0, count: 0 }
            value.sum += y
            value.count++
            sums.set(key, value)
          })
          sourceYs.forEach((_, i) => {
            const value = sums.get(root(i))!
            alongByVertex[i] = studioPortalAlong(project, end, value.sum / value.count)
          })
        }
      }

      const isCrossoverRoad = node.name === 'Open median crossover'
      const isCrossoverStripe = node.name === 'Crossover edge stripe'
      const isCrossover = isCrossoverRoad || isCrossoverStripe
      const customAccess = project?.portalAccess

      if (primitive.indices !== undefined) {
        const indices = { ...gltf.accessors[primitive.indices] }
        const ib = gltf.bufferViews[indices.bufferView]
        if (ib) {
          const offset = binaryOffset + (ib.byteOffset ?? 0) + (indices.byteOffset ?? 0)
          const size = indices.componentType === 5125 ? 4 : 2
          const read = (i: number) =>
            size === 4 ? view.getUint32(offset + i * size, true) : view.getUint16(offset + i * size, true)
          const kept: number[] = []

          if (!(isCrossover && customAccess && !customAccess.enabled)) {
            for (let i = 0; i < indices.count; i += 3) {
              const face = [read(i), read(i + 1), read(i + 2)]

              // 剔除烘焙在洞口前方 x = -112 m 处的默认门架立柱与横梁
              if (
                isStructures &&
                face.every(v => isBakedPortalVmsVertex(view.getFloat32(start + v * stride, true)))
              ) {
                continue
              }

              // 保留原版：剔除中央内侧护栏与排水沟
              const removed =
                face.every(v => {
                  const at = start + v * stride
                  const x = view.getFloat32(at, true)
                  const h = view.getFloat32(at + 4, true)
                  const y = sourceYs[v]!
                  return x >= -58.51 && x <= -41.49 && Math.abs(y) <= 4.51 && h >= -0.041 && h <= 0.141
                }) ||
                face.every(v => {
                  const at = start + v * stride
                  const x = view.getFloat32(at, true)
                  const h = view.getFloat32(at + 4, true)
                  const y = Math.abs(sourceYs[v]!)
                  return (
                    x < -2 &&
                    x > -175 &&
                    h >= 0.914 &&
                    h <= 1.066 &&
                    (Math.abs(y - 7.08) < 0.025 || Math.abs(y - 16.92) < 0.025)
                  )
                })
              if (removed) continue

              if (
                single &&
                (node.name?.includes('Lettering')
                  ? face.every(v => sourceYs[v]! > 0)
                  : face.every(v => Math.abs(sourceYs[v]!) < 11.99) &&
                    face.every(v => {
                      const x = view.getFloat32(start + v * stride, true)
                      return x > -120 && x < 160
                    }))
              ) {
                continue
              }
              kept.push(...face)
            }
          }

          if (kept.length !== indices.count) {
            if (!kept.length) kept.push(0, 0, 0)
            gltf.accessors.push(indices)
            primitive.indices = gltf.accessors.length - 1
            const data = new Uint32Array(kept)
            gltf.bufferViews.push({
              buffer: 0,
              byteOffset: binaryLength,
              byteLength: data.byteLength,
            })
            indices.bufferView = gltf.bufferViews.length - 1
            indices.byteOffset = 0
            indices.componentType = 5125
            indices.count = kept.length
            indices.min = [kept.reduce((min, val) => Math.min(min, val), Infinity)]
            indices.max = [accessor.count - 1]
            extra.push(new Uint8Array(data.buffer))
            binaryLength += data.byteLength
          }
        }
      }

      if (project) {
        const min = [Infinity, Infinity, Infinity]
        const max = [-Infinity, -Infinity, -Infinity]
        for (let i = 0; i < accessor.count; i++) {
          const offset = start + i * stride
          const y = sourceYs[i]!
          let baseX = view.getFloat32(offset, true)
          let along = alongByVertex[i]!
          let z = node.name?.includes('Lettering')
            ? -(y + studioPortalLateral(project, end, y < 0 ? -12 : 12) - (y < 0 ? -12 : 12))
            : project.bores.length === 1 && Math.abs(y) < 12
              ? -(end === 0 ? -project.bores[0]!.offset : project.bores[0]!.offset)
              : -studioPortalLateral(project, end, y)

          if (isCrossover && customAccess && customAccess.enabled) {
            if (isCrossoverRoad) {
              const t = (baseX - -92) / (-68 - -92)
              baseX = customAccess.start + t * (customAccess.end - customAccess.start)
            } else {
              baseX = baseX < -80 ? baseX + (customAccess.start - -92) : baseX + (customAccess.end - -68)
            }
            z = -(y / 7.5) * customAccess.halfWidth
          }

          if (
            node.name === 'Sculpted mountain with two excavated bores' ||
            node.name === 'terrain / Poliigon_GrassPatchyGround_4585'
          ) {
            const x = baseX
            const weight = Math.max(0, Math.min(1, (100 - Math.abs(y)) / 50, (220 - x) / 60, (180 + x) / 60))
            z = -y + (z + y) * weight
            along = studioPortalAlong(project, end, y) * weight
          }

          view.setFloat32(offset, baseX + along, true)
          view.setFloat32(offset + 8, z, true)
          for (let c = 0; c < 3; c++) {
            const n = view.getFloat32(offset + c * 4, true)
            min[c] = Math.min(min[c]!, n)
            max[c] = Math.max(max[c]!, n)
          }
        }
        accessor.min = min
        accessor.max = max
      }
    }
  }

  gltf.buffers[0].byteLength = binaryLength
  const encoded = new TextEncoder().encode(JSON.stringify(gltf))
  const padded = Math.ceil(encoded.length / 4) * 4
  const bin = new Uint8Array(binaryLength)
  const result = new ArrayBuffer(28 + padded + bin.length)
  const out = new DataView(result)
  bin.set(new Uint8Array(bytes, binaryOffset))
  let cursor = bytes.byteLength - binaryOffset
  for (const chunk of extra) {
    bin.set(chunk, cursor)
    cursor += chunk.length
  }
  out.setUint32(0, 0x46546c67, true)
  out.setUint32(4, 2, true)
  out.setUint32(8, result.byteLength, true)
  out.setUint32(12, padded, true)
  out.setUint32(16, 0x4e4f534a, true)
  new Uint8Array(result, 20, padded).fill(32)
  new Uint8Array(result, 20, encoded.length).set(encoded)
  out.setUint32(20 + padded, bin.length, true)
  out.setUint32(24 + padded, 0x004e4942, true)
  new Uint8Array(result, 28 + padded).set(bin)

  return URL.createObjectURL(new Blob([result], { type: 'model/gltf-binary' }))
}
