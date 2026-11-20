export type TerrainSourceType = 'ion' | 'url' | 'ellipsoid'
export type ImagerySourceType = 'ion' | 'xyz' | 'wmts' | 'wms' | 'single-tile'
export type DataMode = 'mock' | 'live'
export type UserRole = 'viewer' | 'operator' | 'admin'

export interface TerrainConfig {
  type: TerrainSourceType
  url: string
}

export interface ImageryConfig {
  type: ImagerySourceType
  url: string
  layer: string
  style: string
  tileMatrixSetID: string
  maximumLevel: number
}

export interface RuntimeConfig {
  cesium: {
    ionToken: string
    terrain: TerrainConfig
    imagery: ImageryConfig
  }
  dataMode: DataMode
  apiBaseUrl: string
  wsUrl: string
  auth: {
    defaultRole: UserRole
  }
  streams: Record<string, string>
}

const TERRAIN_TYPES = new Set<TerrainSourceType>(['ion', 'url', 'ellipsoid'])
const IMAGERY_TYPES = new Set<ImagerySourceType>(['ion', 'xyz', 'wmts', 'wms', 'single-tile'])
const DATA_MODES = new Set<DataMode>(['mock', 'live'])
const USER_ROLES = new Set<UserRole>(['viewer', 'operator', 'admin'])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function asTrimmedString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function asPositiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

function asStringMap(value: unknown): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(asRecord(value))) {
    if (typeof item === 'string' && item.trim()) result[key] = item.trim()
  }
  return result
}

export function defaultRuntimeConfig(envToken = ''): RuntimeConfig {
  return {
    cesium: {
      ionToken: envToken.trim(),
      terrain: { type: 'ion', url: '' },
      imagery: {
        type: 'ion',
        url: '',
        layer: '',
        style: 'default',
        tileMatrixSetID: '',
        maximumLevel: 18,
      },
    },
    dataMode: 'mock',
    apiBaseUrl: '',
    wsUrl: '',
    auth: {
      defaultRole: 'admin',
    },
    streams: {},
  }
}

export function needsIonToken(config: RuntimeConfig): boolean {
  return config.cesium.terrain.type === 'ion' || config.cesium.imagery.type === 'ion'
}

export function validateRuntimeConfig(config: RuntimeConfig): string[] {
  const errors: string[] = []
  if (needsIonToken(config) && !config.cesium.ionToken) {
    errors.push('请在 public/config.json（cesium.ionToken）或 .env.local（VITE_CESIUM_ION_TOKEN）中配置 Cesium ion Token，或在 config.json 中切换为离线地形与影像源')
  }
  if (config.cesium.terrain.type === 'url' && !config.cesium.terrain.url) {
    errors.push('离线地形类型设为 url 时，必须在 config.json 中配置 cesium.terrain.url')
  }
  if (config.cesium.imagery.type !== 'ion' && !config.cesium.imagery.url) {
    errors.push(`离线影像类型设为 ${config.cesium.imagery.type} 时，必须在 config.json 中配置 cesium.imagery.url`)
  }
  if ((config.cesium.imagery.type === 'wmts' || config.cesium.imagery.type === 'wms') && !config.cesium.imagery.layer) {
    errors.push(`影像类型设为 ${config.cesium.imagery.type} 时，必须在 config.json 中配置 cesium.imagery.layer`)
  }
  if (config.cesium.imagery.type === 'wmts' && !config.cesium.imagery.tileMatrixSetID) {
    errors.push('影像类型设为 wmts 时，必须在 config.json 中配置 cesium.imagery.tileMatrixSetID')
  }
  return errors
}

export function resolveRuntimeConfig(raw: unknown, envToken = ''): RuntimeConfig {
  const defaults = defaultRuntimeConfig(envToken)
  if (raw == null) return defaults
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('config.json 根节点必须是 JSON 对象')
  }
  const root = asRecord(raw)
  const cesium = asRecord(root.cesium)
  const terrain = asRecord(cesium.terrain)
  const imagery = asRecord(cesium.imagery)
  const auth = asRecord(root.auth)

  const terrainTypeRaw = asTrimmedString(terrain.type, defaults.cesium.terrain.type)
  if (!TERRAIN_TYPES.has(terrainTypeRaw as TerrainSourceType)) {
    throw new Error(`不支持的地形源类型：${terrainTypeRaw}（可选：ion / url / ellipsoid）`)
  }
  const imageryTypeRaw = asTrimmedString(imagery.type, defaults.cesium.imagery.type)
  if (!IMAGERY_TYPES.has(imageryTypeRaw as ImagerySourceType)) {
    throw new Error(`不支持的影像源类型：${imageryTypeRaw}（可选：ion / xyz / wmts / wms / single-tile）`)
  }
  const dataModeRaw = asTrimmedString(root.dataMode, defaults.dataMode)
  if (!DATA_MODES.has(dataModeRaw as DataMode)) {
    throw new Error(`不支持的数据模式：${dataModeRaw}（可选：mock / live）`)
  }
  const roleRaw = asTrimmedString(auth.defaultRole, defaults.auth.defaultRole)
  if (!USER_ROLES.has(roleRaw as UserRole)) {
    throw new Error(`不支持的默认角色：${roleRaw}（可选：viewer / operator / admin）`)
  }

  const ionToken = asTrimmedString(cesium.ionToken) || defaults.cesium.ionToken
  return {
    cesium: {
      ionToken,
      terrain: {
        type: terrainTypeRaw as TerrainSourceType,
        url: asTrimmedString(terrain.url),
      },
      imagery: {
        type: imageryTypeRaw as ImagerySourceType,
        url: asTrimmedString(imagery.url),
        layer: asTrimmedString(imagery.layer),
        style: asTrimmedString(imagery.style, defaults.cesium.imagery.style),
        tileMatrixSetID: asTrimmedString(imagery.tileMatrixSetID),
        maximumLevel: asPositiveInt(imagery.maximumLevel, defaults.cesium.imagery.maximumLevel),
      },
    },
    dataMode: dataModeRaw as DataMode,
    apiBaseUrl: asTrimmedString(root.apiBaseUrl),
    wsUrl: asTrimmedString(root.wsUrl),
    auth: {
      defaultRole: roleRaw as UserRole,
    },
    streams: asStringMap(root.streams),
  }
}

export async function loadRuntimeConfig(baseUrl = './', envToken = ''): Promise<RuntimeConfig> {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const configUrl = new URL(`${normalizedBase}config.json`, document.baseURI).href
  let raw: unknown = null
  try {
    const response = await fetch(configUrl, { cache: 'no-store' })
    if (response.ok) {
      const contentType = response.headers.get('content-type') ?? ''
      const text = await response.text()
      if (text.trim()) {
        if (contentType.includes('text/html') || text.trimStart().startsWith('<')) {
          raw = null
        } else {
          try {
            raw = JSON.parse(text)
          } catch {
            throw new Error('config.json 不是有效的 JSON，请检查配置文件格式')
          }
        }
      }
    }
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes('config.json')) throw cause
    raw = null
  }
  const config = resolveRuntimeConfig(raw, envToken)
  const errors = validateRuntimeConfig(config)
  if (errors.length) throw new Error(errors[0])
  return config
}
