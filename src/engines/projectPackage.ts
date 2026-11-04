import { upgradeProject } from './assetPlacement.ts'
import { projectErrors } from './projectConfig.ts'
import type { TunnelProject } from './projectConfig.ts'
import { validPortalSign } from './portalSignConfig.ts'
import type { PortalSignConfig, TrafficSignsConfig } from '../types/scene.ts'
import type { DeviceSettings } from './tunnelSystemsState.ts'

export interface TunnelPackageExtras {
  controls: Record<string, DeviceSettings>
  portalSign?: PortalSignConfig
  trafficSigns?: TrafficSignsConfig
}

export interface TunnelPackageFile {
  format: 'tunnel-package'
  version: 1
  project: TunnelProject
  controls: Record<string, DeviceSettings>
  portalSign?: { mode: PortalSignConfig['mode']; name: string; length: string; subtitle?: string; notice?: string; image?: string }
  trafficSigns?: { images: [string | null, string | null, string | null] }
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`
}

export function dataUrlToBlob(value: string): Blob {
  const match = /^data:([^;,]+)?;base64,([A-Za-z0-9+/=]+)$/.exec(value)
  if (!match?.[2]) throw new Error('配置包里的图片不是有效的 data URL')
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: match[1] || 'application/octet-stream' })
}

export async function encodeTunnelPackage(input: { project: TunnelProject; controls?: Record<string, DeviceSettings>; portalSign?: PortalSignConfig; trafficSigns?: TrafficSignsConfig }): Promise<TunnelPackageFile> {
  const portal = input.portalSign
  const traffic = input.trafficSigns
  return {
    format: 'tunnel-package',
    version: 1,
    project: input.project,
    controls: input.controls ?? {},
    ...(portal ? { portalSign: { mode: portal.mode, name: portal.name, length: portal.length, subtitle: portal.subtitle, notice: portal.notice, ...(portal.image ? { image: await blobToDataUrl(portal.image) } : {}) } } : {}),
    ...(traffic ? { trafficSigns: { images: (await Promise.all(traffic.images.map(async image => image ? blobToDataUrl(image) : null))) as [string | null, string | null, string | null] } } : {}),
  }
}

function acceptedProject(value: unknown): TunnelProject {
  const errors = projectErrors(value)
  if (errors.length) throw new Error(errors.slice(0, 8).join('\n'))
  return upgradeProject(value as TunnelProject)
}

function controlsOf(value: unknown): Record<string, DeviceSettings> {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('设备控制记录格式不正确')
  return value as Record<string, DeviceSettings>
}

export function readTunnelPackage(value: unknown): { project: TunnelProject; extras?: TunnelPackageExtras } {
  if (!value || typeof value !== 'object' || (value as { format?: unknown }).format !== 'tunnel-package') return { project: acceptedProject(value) }
  const file = value as TunnelPackageFile
  if (file.version !== 1) throw new Error('不支持的配置包版本')
  const project = acceptedProject(file.project)
  const extras: TunnelPackageExtras = { controls: controlsOf(file.controls) }
  if (file.portalSign) {
    const sign = file.portalSign
    const portalSign: PortalSignConfig = { mode: sign.mode, name: sign.name, length: sign.length, subtitle: sign.subtitle, notice: sign.notice, ...(sign.image ? { image: dataUrlToBlob(sign.image) } : {}) }
    if (!validPortalSign(portalSign)) throw new Error('配置包里的入口标牌无效')
    extras.portalSign = portalSign
  }
  if (file.trafficSigns) {
    if (!Array.isArray(file.trafficSigns.images) || file.trafficSigns.images.length !== 3) throw new Error('配置包里的交通标志无效')
    const trafficSigns: TrafficSignsConfig = { images: file.trafficSigns.images.map(image => image ? dataUrlToBlob(image) : null) as TrafficSignsConfig['images'] }
    if (trafficSigns.images.some(image => image !== null && !(image instanceof Blob))) throw new Error('配置包里的交通标志无效')
    extras.trafficSigns = trafficSigns
  }
  return { project, extras }
}
