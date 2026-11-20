import { parseGlbBounds } from './glbBounds.ts'

export interface CustomModelEntry {
  id: string
  name: string
  source: 'local' | 'remote'
  url?: string
  fileSize?: number
  bounds: [number, number, number]
  centerOffset: [number, number, number]
  createdAt: number
}

interface StoredCustomModel extends CustomModelEntry {
  blob?: Blob
}

const DB_NAME = 'codex-aigis-custom-models'
const DB_VERSION = 1
const STORE_NAME = 'models'
const DEFAULT_BOUNDS: [number, number, number] = [1.8, 1.8, 1.8]

const metaCache = new Map<string, CustomModelEntry>()
const objectUrlCache = new Map<string, string>()

function stripBlob(record: StoredCustomModel): CustomModelEntry {
  const { blob: _blob, ...meta } = record
  return meta
}

function openCustomModelDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('当前环境不支持 IndexedDB，无法持久化自定义模型'))
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(new Error('无法打开自定义模型存储库'))
  })
}

export function isValidRemoteModelUrl(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function getCachedCustomModelMeta(id: string): CustomModelEntry | undefined {
  return metaCache.get(id)
}

export async function listCustomModels(): Promise<CustomModelEntry[]> {
  if (typeof indexedDB === 'undefined') return [...metaCache.values()]
  const db = await openCustomModelDb()
  try {
    const records = await new Promise<StoredCustomModel[]>((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll()
      req.onsuccess = () => resolve((req.result as StoredCustomModel[]) ?? [])
      req.onerror = () => reject(new Error('读取自定义模型列表失败'))
    })
    const entries = records.map(stripBlob).sort((a, b) => b.createdAt - a.createdAt)
    metaCache.clear()
    for (const entry of entries) metaCache.set(entry.id, entry)
    return entries
  } finally {
    db.close()
  }
}

export async function registerLocalGlb(file: Blob, rawName: string): Promise<CustomModelEntry> {
  const name = rawName.trim().replace(/\.glb$/i, '') || '未命名模型'
  const buffer = await file.arrayBuffer()
  const parsed = parseGlbBounds(buffer)
  const id = `glb-${crypto.randomUUID()}`
  const record: StoredCustomModel = {
    id,
    name,
    source: 'local',
    fileSize: buffer.byteLength,
    bounds: parsed.bounds,
    centerOffset: parsed.centerOffset,
    createdAt: Date.now(),
    blob: new Blob([buffer], { type: 'model/gltf-binary' }),
  }

  const db = await openCustomModelDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(new Error('保存自定义 GLB 到本地存储失败'))
    })
  } finally {
    db.close()
  }

  const meta = stripBlob(record)
  metaCache.set(id, meta)
  return meta
}

export async function registerRemoteGlb(rawUrl: string, rawName?: string): Promise<CustomModelEntry> {
  const url = rawUrl.trim()
  if (!isValidRemoteModelUrl(url)) {
    throw new Error('请输入有效的 http(s):// 或站点相对路径的 GLB 模型地址')
  }
  const derivedName = url.split('/').at(-1)?.split('?')[0]?.replace(/\.glb$/i, '') ?? '外链模型'
  const name = rawName?.trim() || derivedName || '外链模型'

  let bounds: [number, number, number] = [...DEFAULT_BOUNDS]
  let centerOffset: [number, number, number] = [0, 0, 0]
  try {
    const response = await fetch(url)
    if (response.ok) {
      const buffer = await response.arrayBuffer()
      const parsed = parseGlbBounds(buffer)
      bounds = parsed.bounds
      centerOffset = parsed.centerOffset
    }
  } catch {
    // CORS or offline remote URLs fall back cleanly to default bounds.
  }

  const id = `glb-${crypto.randomUUID()}`
  const record: StoredCustomModel = {
    id,
    name,
    source: 'remote',
    url,
    bounds,
    centerOffset,
    createdAt: Date.now(),
  }

  const db = await openCustomModelDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(new Error('保存外链 GLB 配置失败'))
    })
  } finally {
    db.close()
  }

  const meta = stripBlob(record)
  metaCache.set(id, meta)
  return meta
}

export async function deleteCustomModel(id: string): Promise<void> {
  const cachedUrl = objectUrlCache.get(id)
  if (cachedUrl) {
    URL.revokeObjectURL(cachedUrl)
    objectUrlCache.delete(id)
  }
  metaCache.delete(id)
  const db = await openCustomModelDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(new Error('删除自定义模型失败'))
    })
  } finally {
    db.close()
  }
}

export async function resolveCustomModelUrl(id: string, fallbackUrl?: string): Promise<string> {
  const existing = objectUrlCache.get(id)
  if (existing) return existing

  const cachedMeta = metaCache.get(id)
  if (cachedMeta?.source === 'remote' && cachedMeta.url) return cachedMeta.url

  if (typeof indexedDB !== 'undefined') {
    const db = await openCustomModelDb()
    try {
      const record = await new Promise<StoredCustomModel | undefined>((resolve, reject) => {
        const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id)
        req.onsuccess = () => resolve(req.result as StoredCustomModel | undefined)
        req.onerror = () => reject(new Error(`读取自定义模型失败：${id}`))
      })
      if (record) {
        metaCache.set(id, stripBlob(record))
        if (record.source === 'remote' && record.url) return record.url
        if (record.blob) {
          const objectUrl = URL.createObjectURL(record.blob)
          objectUrlCache.set(id, objectUrl)
          return objectUrl
        }
      }
    } finally {
      db.close()
    }
  }

  if (fallbackUrl && isValidRemoteModelUrl(fallbackUrl)) return fallbackUrl
  throw new Error(`未找到自定义模型资产：${id}`)
}

export function disposeCustomModelUrls(): void {
  for (const url of objectUrlCache.values()) {
    URL.revokeObjectURL(url)
  }
  objectUrlCache.clear()
}
