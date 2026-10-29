import { changeSystems } from './tunnelSystemsState.ts'
import type { SceneDevice, SystemsState } from './tunnelSystemsState.ts'
import { deviceName, deviceTelemetry } from './deviceTelemetry.ts'

// Compare effective readings with the same recovery path used by the scene.
// Individual overrides stay in both states, so the list never promises a forced reset.
export function incidentImpact(devices: SceneDevice[], state: SystemsState, length: number) {
  if (state.incident === 'none') return []
  const recovered = changeSystems(state, { incident: 'none' })
  return devices.flatMap(device => {
    const active = deviceTelemetry(device, state, length)
    const restored = deviceTelemetry(device, recovered, length)
    if (active.status === restored.status && active.value === restored.value && active.severity === restored.severity) return []
    return [{ device, name: deviceName(device), active, restored }]
  })
}
