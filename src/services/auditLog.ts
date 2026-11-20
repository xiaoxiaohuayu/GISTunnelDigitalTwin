import type { UserRole } from '../config/runtimeConfig.ts'
import { deviceName } from '../engines/deviceTelemetry.ts'
import type { DeviceSettings, SceneDevice, SystemsState } from '../engines/tunnelSystemsState.ts'
import type { ControlResult } from './types.ts'

export interface AuditEntry {
  id: string
  timestamp: number
  role: UserRole
  target: string
  action: string
  status: ControlResult['status']
  message?: string
}

export function highRiskDeviceConfirmMessage(device: SceneDevice | undefined, patch: DeviceSettings): string | null {
  if (!device) return null
  const label = deviceName(device)
  if (device.kind === 'shutter' && patch.enabled === false) {
    return `确认关闭横洞卷帘门「${label}」？关闭后将阻断该联络通道通行。`
  }
  if (device.kind === 'signal' && patch.entrance === 'red') {
    return `确认将入口交通信号灯「${label}」切换为红灯（禁止驶入）？`
  }
  if (device.kind === 'lane' && patch.lane === 'cross') {
    return `确认将车道指示器「${label}」切换为红叉（禁止通行）？`
  }
  return null
}

export function describeDeviceAction(device: SceneDevice | undefined, id: string, patch: DeviceSettings): { target: string; action: string } {
  const target = device ? deviceName(device) : id
  const parts: string[] = []
  if (patch.enabled !== undefined) parts.push(patch.enabled ? '开启' : '关闭')
  if (patch.level !== undefined) parts.push(`亮度 ${patch.level}%`)
  if (patch.entrance !== undefined) parts.push(`入口信号 → ${{ green: '绿灯', yellow: '黄灯', red: '红灯' }[patch.entrance]}`)
  if (patch.lane !== undefined) parts.push(`车道指示 → ${{ down: '通行', left: '向横洞疏散', cross: '红叉禁行' }[patch.lane]}`)
  if (patch.alarm !== undefined) parts.push(patch.alarm === 'none' ? '恢复异常' : `触发异常(${patch.alarm})`)
  if (patch.message !== undefined || patch.vms !== undefined) parts.push('更新情报板显示')
  return { target, action: parts.join('、') || '更新设备参数' }
}

export function describeSystemsAction(patch: Partial<SystemsState>): { target: string; action: string } {
  const parts: string[] = []
  if (patch.environment !== undefined) parts.push(`环境 → ${{ day: '白天', night: '夜间', fog: '雾天' }[patch.environment]}`)
  if (patch.plc !== undefined) parts.push(`照明策略 → ${patch.plc === 'auto' ? 'PLC 自动' : '手动'}`)
  if (patch.incident !== undefined) parts.push(patch.incident === 'none' ? '解除交通事件' : `触发事件(${patch.incident})`)
  if (patch.incidentTube !== undefined) parts.push(`切换事发洞筒 #${patch.incidentTube + 1}`)
  if (patch.devices !== undefined && !parts.length) parts.push('同步设备控制覆盖')
  return { target: '隧道系统', action: parts.join('、') || '更新系统控制' }
}

export function appendAuditEntry(entries: readonly AuditEntry[], entry: AuditEntry, limit = 50): AuditEntry[] {
  return [entry, ...entries].slice(0, limit)
}
