import { deviceCatalog } from './tunnelSystemsState.ts'
import type { SceneDevice, SystemsState } from './tunnelSystemsState.ts'
import { deviceTelemetry } from './deviceTelemetry.ts'

export function searchDevices(devices: SceneDevice[], state: SystemsState, length: number,
  query: string, tube: 'all' | '0' | '1', abnormalOnly: boolean) {
  const text = query.trim().toLowerCase()
  const exactId = devices.some(device => device.id.toLowerCase() === text)
  const tokens = text.split(/\s+/).filter(Boolean)
  return devices.flatMap(device => {
    if (tube !== 'all' && device.tube !== Number(tube)) return []
    const reading = deviceTelemetry(device, state, length)
    if (abnormalOnly && reading.severity === 'normal') return []
    const name = deviceCatalog.find(item => item[1] === device.kind)?.[2] ?? device.kind
    const station = Math.round(device.station)
    const chainage = station < 0 ? `${station} m` : `K${Math.floor(station / 1000)}+${String(station % 1000).padStart(3, '0')}`
    const address = `${device.tube === 0 ? '上行洞' : '下行洞'} · ${chainage}`
    const searchable = `${device.id} ${name} ${address} ${station} ${reading.status}`.toLowerCase()
    if (exactId ? device.id.toLowerCase() !== text : !tokens.every(token => searchable.includes(token))) return []
    return [{ device, name, address, reading }]
  })
}
