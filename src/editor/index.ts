import type { TunnelMapHandle } from '../types/tunnel.ts'
import type { EditorSceneBridge } from './editorStore.ts'

export { CommandStack } from './commandStack.ts'
export type { CommandHistoryEntry, CommandStackOptions, CommandTransition, EditorCommand } from './commandStack.ts'
export { EditorStore } from './editorStore.ts'
export { evaluateTelemetryBinding } from './telemetryBinding.ts'
export type { EvaluatedBindingReading } from './telemetryBinding.ts'
export type {
  EditorMode,
  EditorSceneBridge,
  EditorSnapshot,
  EditorStoreOptions,
  GizmoMode,
  SelectionOptions,
  SnapMode,
  TransformCommitOptions,
} from './editorStore.ts'

export function createCesiumEditorBridge(handle: Pick<TunnelMapHandle, 'previewAsset' | 'commitAssetRecord' | 'applyProject'>): EditorSceneBridge {
  return {
    previewAsset: record => handle.previewAsset(record),
    commitAssetRecord: (record, project) => handle.commitAssetRecord(record, project),
    applyProject: project => handle.applyProject(project),
  }
}
