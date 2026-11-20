import type { RuntimeConfig } from '../config/runtimeConfig.ts'
import { changeDevice } from '../engines/tunnelSystemsState.ts'
import type { DeviceSettings, SystemsState } from '../engines/tunnelSystemsState.ts'
import type { ControlGateway, ControlResult } from './types.ts'

function createCommandId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export class MockControlGateway implements ControlGateway {
  readonly mode = 'mock' as const

  async sendDeviceControl(deviceId: string, patch: DeviceSettings, currentState: SystemsState): Promise<ControlResult> {
    const next = changeDevice(currentState, deviceId, patch)
    return {
      ok: true,
      commandId: createCommandId(),
      status: 'applied',
      appliedPatch: { devices: next.devices },
      timestamp: Date.now(),
    }
  }

  async sendSystemsControl(patch: Partial<SystemsState>, _currentState: SystemsState): Promise<ControlResult> {
    return {
      ok: true,
      commandId: createCommandId(),
      status: 'applied',
      appliedPatch: patch,
      timestamp: Date.now(),
    }
  }
}

export interface HttpControlGatewayOptions {
  apiBaseUrl: string
  timeoutMs?: number
  getHeaders?: () => Record<string, string>
}

export class HttpControlGateway implements ControlGateway {
  readonly mode = 'live' as const
  private readonly apiBaseUrl: string
  private readonly timeoutMs: number
  private readonly getHeaders?: () => Record<string, string>

  constructor(options: HttpControlGatewayOptions) {
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.getHeaders = options.getHeaders
  }

  async sendDeviceControl(deviceId: string, patch: DeviceSettings, currentState: SystemsState): Promise<ControlResult> {
    const next = changeDevice(currentState, deviceId, patch)
    return this.post(
      `/devices/${encodeURIComponent(deviceId)}/control`,
      { deviceId, patch },
      { devices: next.devices },
    )
  }

  async sendSystemsControl(patch: Partial<SystemsState>, _currentState: SystemsState): Promise<ControlResult> {
    return this.post('/systems/control', { patch }, patch)
  }

  private async post(path: string, body: Record<string, unknown>, fallbackPatch: Partial<SystemsState>): Promise<ControlResult> {
    const commandId = createCommandId()
    const timestamp = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(`${this.apiBaseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Command-Id': commandId,
          ...(this.getHeaders?.() ?? {}),
        },
        body: JSON.stringify({ commandId, timestamp, ...body }),
        signal: controller.signal,
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        return {
          ok: false,
          commandId,
          status: response.status >= 400 && response.status < 500 ? 'rejected' : 'error',
          message: detail.trim() || `控制接口返回 HTTP ${response.status}`,
          timestamp: Date.now(),
        }
      }
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
      return {
        ok: true,
        commandId: typeof data.commandId === 'string' ? data.commandId : commandId,
        status: data.status === 'queued' ? 'queued' : 'applied',
        message: typeof data.message === 'string' ? data.message : undefined,
        appliedPatch: (data.appliedPatch as Partial<SystemsState> | undefined) ?? fallbackPatch,
        timestamp: Date.now(),
      }
    } catch (cause) {
      const aborted = cause instanceof Error && cause.name === 'AbortError'
      return {
        ok: false,
        commandId,
        status: 'error',
        message: aborted ? `控制指令超时（>${Math.round(this.timeoutMs / 1000)}s）` : cause instanceof Error ? cause.message : String(cause),
        timestamp: Date.now(),
      }
    } finally {
      clearTimeout(timer)
    }
  }
}

export function createControlGateway(config: RuntimeConfig): ControlGateway {
  if (config.dataMode === 'live' && config.apiBaseUrl) {
    return new HttpControlGateway({ apiBaseUrl: config.apiBaseUrl })
  }
  return new MockControlGateway()
}
