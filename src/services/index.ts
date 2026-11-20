import type { RuntimeConfig } from '../config/runtimeConfig.ts'
import { createControlGateway } from './controlGateway.ts'
import { createTelemetryProvider } from './telemetryProvider.ts'
import type { ControlGateway, TelemetryProvider } from './types.ts'

export * from './types.ts'
export * from './auth.ts'
export * from './auditLog.ts'
export { createTelemetryProvider, MockTelemetryProvider, WebSocketTelemetryProvider } from './telemetryProvider.ts'
export { createControlGateway, MockControlGateway, HttpControlGateway } from './controlGateway.ts'

export interface TunnelServices {
  telemetry: TelemetryProvider
  control: ControlGateway
  dispose(): void
}

export function createTunnelServices(config: RuntimeConfig): TunnelServices {
  const telemetry = createTelemetryProvider(config)
  const control = createControlGateway(config)
  return {
    telemetry,
    control,
    dispose() {
      telemetry.stop()
    },
  }
}
