export interface EngineHandle {
  resetView: () => void
  dispose: () => void
}

export type EngineFactory<T extends EngineHandle = EngineHandle> = (container: HTMLDivElement) => T | Promise<T>
export type WorkspaceMode = 'scene' | 'map'
