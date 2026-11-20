export interface GlbBoundsResult {
  /** Dimensions [dx, dy, dz] mapped to Cesium local ENU frame (glTF X, Z, Y). */
  bounds: [number, number, number]
  /** Center offset [cx, cy, cz] mapped to Cesium local ENU frame. */
  centerOffset: [number, number, number]
  /** Mesh primitive count found in the glTF document. */
  primitiveCount: number
}

const GLB_MAGIC = 0x46546c67 // 'glTF'
const GLB_JSON_CHUNK = 0x4e4f534a // 'JSON'

interface GltfAccessor {
  min?: number[]
  max?: number[]
}

interface GltfPrimitive {
  attributes?: Record<string, number>
}

interface GltfMesh {
  primitives?: GltfPrimitive[]
}

interface GltfDocument {
  accessors?: GltfAccessor[]
  meshes?: GltfMesh[]
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * Parses a binary glTF 2.0 (.glb) ArrayBuffer header and JSON chunk to compute
 * overall axis-aligned bounding box dimensions without requiring WebGL or Three.js.
 */
export function parseGlbBounds(buffer: ArrayBuffer): GlbBoundsResult {
  if (buffer.byteLength < 20) {
    throw new Error('GLB 文件过小，缺少有效的二进制文件头')
  }

  const view = new DataView(buffer)
  const magic = view.getUint32(0, true)
  const version = view.getUint32(4, true)
  const totalLength = view.getUint32(8, true)

  if (magic !== GLB_MAGIC) {
    throw new Error('文件格式无效：请上传标准二进制 glTF（.glb）文件')
  }
  if (version !== 2) {
    throw new Error(`不支持的 glTF 版本（v${version}），仅支持 glTF 2.0`)
  }
  if (totalLength > buffer.byteLength) {
    throw new Error('GLB 文件不完整或已截断')
  }

  let offset = 12
  let jsonText: string | null = null
  while (offset + 8 <= totalLength) {
    const chunkLength = view.getUint32(offset, true)
    const chunkType = view.getUint32(offset + 4, true)
    const chunkStart = offset + 8
    if (chunkStart + chunkLength > totalLength) {
      throw new Error('GLB 数据块长度越界')
    }
    if (chunkType === GLB_JSON_CHUNK) {
      const bytes = new Uint8Array(buffer, chunkStart, chunkLength)
      jsonText = new TextDecoder('utf-8').decode(bytes)
      break
    }
    offset = chunkStart + chunkLength
  }

  if (!jsonText) {
    throw new Error('未在 GLB 文件中找到 JSON 描述块')
  }

  let doc: GltfDocument
  try {
    doc = JSON.parse(jsonText) as GltfDocument
  } catch {
    throw new Error('GLB 内部 JSON 描述块解析失败')
  }

  const accessors = doc.accessors ?? []
  const meshes = doc.meshes ?? []

  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  let primitiveCount = 0

  for (const mesh of meshes) {
    for (const primitive of mesh.primitives ?? []) {
      const posIdx = primitive.attributes?.POSITION
      if (posIdx === undefined) continue
      const accessor = accessors[posIdx]
      if (!accessor?.min || !accessor?.max || accessor.min.length < 3 || accessor.max.length < 3) continue
      const [ax0, ay0, az0] = accessor.min
      const [ax1, ay1, az1] = accessor.max
      if (![ax0, ay0, az0, ax1, ay1, az1].every(Number.isFinite)) continue
      minX = Math.min(minX, ax0!)
      minY = Math.min(minY, ay0!)
      minZ = Math.min(minZ, az0!)
      maxX = Math.max(maxX, ax1!)
      maxY = Math.max(maxY, ay1!)
      maxZ = Math.max(maxZ, az1!)
      primitiveCount += 1
    }
  }

  if (primitiveCount === 0 || !Number.isFinite(minX)) {
    return {
      bounds: [1.8, 1.8, 1.8],
      centerOffset: [0, 0, 0],
      primitiveCount: 0,
    }
  }

  // Map glTF Y-up (X, Y, Z) into Cesium local ENU frame (X forward, Z lateral, Y up)
  const dx = Math.max(0.2, maxX - minX)
  const dy = Math.max(0.2, maxZ - minZ)
  const dz = Math.max(0.2, maxY - minY)
  const cx = (minX + maxX) * 0.5
  const cy = (minZ + maxZ) * 0.5
  const cz = (minY + maxY) * 0.5

  return {
    bounds: [round3(dx), round3(dy), round3(dz)],
    centerOffset: [round3(cx), round3(cy), round3(cz)],
    primitiveCount,
  }
}
