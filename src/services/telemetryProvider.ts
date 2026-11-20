import type { RuntimeConfig } from '../config/runtimeConfig.ts'
import { deviceTelemetry } from '../engines/deviceTelemetry.ts'
import type { SceneDevice, SystemsState } from '../engines/tunnelSystemsState.ts'
import type { ConnectionStatus, TelemetryProvider, TelemetryReading, TelemetrySeverity, TelemetrySnapshot } from './types.ts'

const SEVERITIES = new Set<TelemetrySeverity>(['normal', 'warning', 'alarm'])

function normalizeSeverity(value: unknown): TelemetrySeverity {
  return typeof value === 'string' && SEVERITIES.has(value as TelemetrySeverity)
    ? (value as TelemetrySeverity)
    : 'normal'
}

function parseReading(raw: unknown, now: number): TelemetryReading | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  if (typeof item.deviceId !== 'string' || !item.deviceId.trim()) return null
  return {
    deviceId: item.deviceId.trim(),
    status: typeof item.status === 'string' && item.status.trim() ? item.status : '正常',
    value: typeof item.value === 'string' || typeof item.value === 'number' ? String(item.value) : '—',
    severity: normalizeSeverity(item.severity),
    note: typeof item.note === 'string' ? item.note : '实时遥测数据',
    updatedAt: typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) ? item.updatedAt : now,
    source: 'live',
  }
}

export class MockTelemetryProvider implements TelemetryProvider {
  readonly mode = 'mock' as const
  private listeners = new Set<(snapshot: TelemetrySnapshot) => void>()

  getConnectionStatus(): ConnectionStatus {
    return 'mock'
  }

  getReading(device: SceneDevice, state: SystemsState, length: number): TelemetryReading {
    const reading = deviceTelemetry(device, state, length)
    return {
      deviceId: device.id,
      status: reading.status,
      value: reading.value,
      severity: normalizeSeverity(reading.severity),
      note: reading.note,
      updatedAt: Date.now(),
      source: 'mock',
    }
  }

  subscribe(listener: (snapshot: TelemetrySnapshot) => void): () => void {
    this.listeners.add(listener)
    listener({ connection: 'mock', readings: {} })
    return () => { this.listeners.delete(listener) }
  }

  start(): void {
    // Local deterministic telemetry needs no network transport.
  }

  stop(): void {
    this.listeners.clear()
  }
}

export class WebSocketTelemetryProvider implements TelemetryProvider {
  readonly mode = 'live' as const
  private readonly wsUrl: string
  private readonly maxReconnectDelayMs: number
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private stopped = true
  private connection: ConnectionStatus = 'offline'
  private lastSyncedAt: number | undefined
  private readings: Record<string, TelemetryReading> = {}
  private listeners = new Set<(snapshot: TelemetrySnapshot) => void>()

  constructor(wsUrl: string, maxReconnectDelayMs = 30_000) {
    this.wsUrl = wsUrl
    this.maxReconnectDelayMs = maxReconnectDelayMs
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connection
  }

  getReading(device: SceneDevice, _state: SystemsState, _length: number): TelemetryReading {
    const live = this.readings[device.id]
    if (live) return live
    return {
      deviceId: device.id,
      status: this.connection === 'connected' ? '待上报' : '离线',
      value: '—',
      severity: this.connection === 'connected' ? 'normal' : 'warning',
      note: this.connection === 'connected' ? '已连接实时服务，等待该设备上报' : '实时遥测通道未连接',
      updatedAt: this.lastSyncedAt ?? 0,
      source: 'live',
    }
  }

  subscribe(listener: (snapshot: TelemetrySnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => { this.listeners.delete(listener) }
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.connect()
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.socket) {
      this.socket.onopen = null
      this.socket.onmessage = null
      this.socket.onclose = null
      this.socket.onerror = null
      this.socket.close()
      this.socket = null
    }
    this.connection = 'offline'
    this.emit()
  }

  private connect(): void {
    if (this.stopped) return
    this.connection = this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting'
    this.emit()
    try {
      const ws = new WebSocket(this.wsUrl)
      this.socket = ws
      ws.onopen = () => {
        if (this.stopped) return
        this.reconnectAttempt = 0
        this.connection = 'connected'
        this.emit()
      }
      ws.onmessage = event => {
        if (typeof event.data !== 'string') return
        this.handleMessage(event.data)
      }
      ws.onerror = () => {
        // Close event handles reconnect scheduling.
      }
      ws.onclose = () => {
        if (this.socket === ws) this.socket = null
        if (this.stopped) return
        this.connection = 'reconnecting'
        this.emit()
        this.scheduleReconnect()
      }
    } catch {
      this.connection = 'offline'
      this.emit()
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer !== null) return
    const delay = Math.min(this.maxReconnectDelayMs, 1000 * 2 ** Math.min(this.reconnectAttempt, 5))
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private handleMessage(payload: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(payload)
    } catch {
      return
    }
    const now = Date.now()
    const items: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).items)
        ? ((parsed as Record<string, unknown>).items as unknown[])
        : parsed && typeof parsed === 'object' && (parsed as Record<string, unknown>).data
          ? [(parsed as Record<string, unknown>).data]
          : [parsed]

    let changed = false
    for (const item of items) {
      const reading = parseReading(item, now)
      if (!reading) continue
      this.readings[reading.deviceId] = reading
      changed = true
    }
    if (changed) {
      this.lastSyncedAt = now
      this.emit()
    }
  }

  private snapshot(): TelemetrySnapshot {
    return {
      connection: this.connection,
      readings: { ...this.readings },
      lastSyncedAt: this.lastSyncedAt,
    }
  }

  private emit(): void {
    const snap = this.snapshot()
    for (const listener of this.listeners) listener(snap)
  }
}

export function createTelemetryProvider(config: RuntimeConfig): TelemetryProvider {
  if (config.dataMode === 'live' && config.wsUrl) {
    return new WebSocketTelemetryProvider(config.wsUrl)
  }
  return new MockTelemetryProvider()
}
