import type { DataMode } from '../config/runtimeConfig.ts'
import type { DeviceSettings, SceneDevice, SystemsState } from '../engines/tunnelSystemsState.ts'

export type ConnectionStatus = 'mock' | 'connecting' | 'connected' | 'reconnecting' | 'offline'
export type TelemetrySeverity = 'normal' | 'warning' | 'alarm'

export interface TelemetryReading {
  deviceId: string
  status: string
  value: string
  severity: TelemetrySeverity
  note: string
  updatedAt: number
  source: 'mock' | 'live'
}

export interface TelemetrySnapshot {
  connection: ConnectionStatus
  readings: Record<string, TelemetryReading>
  lastSyncedAt?: number
}

export interface ControlResult {
  ok: boolean
  commandId: string
  status: 'applied' | 'queued' | 'rejected' | 'error'
  message?: string
  appliedPatch?: Partial<SystemsState>
  timestamp: number
}

export interface TelemetryProvider {
  readonly mode: DataMode
  getConnectionStatus(): ConnectionStatus
  getReading(device: SceneDevice, state: SystemsState, length: number): TelemetryReading
  subscribe(listener: (snapshot: TelemetrySnapshot) => void): () => void
  start(): void
  stop(): void
}

export interface ControlGateway {
  readonly mode: DataMode
  sendDeviceControl(deviceId: string, patch: DeviceSettings, currentState: SystemsState): Promise<ControlResult>
  sendSystemsControl(patch: Partial<SystemsState>, currentState: SystemsState): Promise<ControlResult>
}
