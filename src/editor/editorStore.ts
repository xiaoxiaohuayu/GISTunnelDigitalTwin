import { facilityProject, moveAsset, resolveAsset, upgradeProject } from '../engines/assetPlacement.ts'
import { projectUpdateKind } from '../engines/projectApply.ts'
import type { ProjectUpdateKind } from '../engines/projectApply.ts'
import { boreLength, projectErrors } from '../engines/projectConfig.ts'
import type { AssetRecord, TunnelProject } from '../engines/projectConfig.ts'
import { CommandStack } from './commandStack.ts'
import type { CommandHistoryEntry, CommandStackOptions, EditorCommand } from './commandStack.ts'

export type EditorMode = 'runtime' | 'editor'
export type GizmoMode = 'translate' | 'rotate' | 'scale'
export type SnapMode = 'none' | 'grid' | 'surface'

const STRUCTURAL_KINDS = new Set(['street', 'substation', 'signal', 'vms', 'pedestrian', 'vehicle', 'shutter', 'layby'])

export interface EditorSceneBridge {
  previewAsset?: (record: AssetRecord) => void
  commitAssetRecord?: (record: AssetRecord, project: TunnelProject) => Promise<void> | void
  applyProject: (project: TunnelProject) => Promise<void>
}

export interface EditorSnapshot {
  mode: EditorMode
  project: TunnelProject
  selectedIds: string[]
  gizmoMode: GizmoMode
  snapMode: SnapMode
  canUndo: boolean
  canRedo: boolean
  undoCount: number
  redoCount: number
  undoLabel?: string
  redoLabel?: string
  history: CommandHistoryEntry[]
  dirty: boolean
  busy: boolean
  lastUpdateKind?: ProjectUpdateKind
  error: string | null
}

export interface EditorStoreOptions {
  project: TunnelProject
  bridge?: EditorSceneBridge
  history?: CommandStackOptions
  now?: () => number
  idGenerator?: () => string
}

export interface SelectionOptions {
  append?: boolean
  toggle?: boolean
}

export interface TransformCommitOptions {
  before?: AssetRecord
  label?: string
  mergeKey?: string
}

function cloneProject(project: TunnelProject): TunnelProject {
  return structuredClone(project)
}

function cloneAsset(asset: AssetRecord): AssetRecord {
  return structuredClone(asset)
}

function isSimpleAssetMove(previous: TunnelProject, next: TunnelProject): AssetRecord | null {
  if (projectUpdateKind(previous, next) !== 'records') return null
  if (previous.name !== next.name) return null
  if (JSON.stringify(previous.mouths ?? null) !== JSON.stringify(next.mouths ?? null)) return null

  let changed: AssetRecord | null = null
  for (let i = 0; i < next.assets.length; i += 1) {
    const prevAsset = previous.assets[i]
    const nextAsset = next.assets[i]!
    if (!prevAsset || prevAsset.id !== nextAsset.id) return null
    if (JSON.stringify(prevAsset) !== JSON.stringify(nextAsset)) {
      if (changed) return null
      if (STRUCTURAL_KINDS.has(nextAsset.kind)) return null
      changed = nextAsset
    }
  }
  return changed
}

function uniqueAssetCode(baseCode: string, existingCodes: Set<string>): string {
  const cleanBase = baseCode.replace(/-COPY(?:-\d+)?$/i, '')
  let candidate = `${cleanBase}-COPY`
  let index = 2
  while (existingCodes.has(candidate)) {
    candidate = `${cleanBase}-COPY-${index}`
    index += 1
  }
  existingCodes.add(candidate)
  return candidate
}

function defaultIdGenerator(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export class EditorStore {
  private mode: EditorMode = 'runtime'
  private project: TunnelProject
  private selectedIds: string[] = []
  private gizmoMode: GizmoMode = 'translate'
  private snapMode: SnapMode = 'grid'
  private busy = false
  private lastUpdateKind?: ProjectUpdateKind
  private error: string | null = null
  private readonly stack: CommandStack<TunnelProject>
  private bridge?: EditorSceneBridge
  private readonly now: () => number
  private readonly idGenerator: () => string
  private readonly listeners = new Set<(snapshot: EditorSnapshot) => void>()

  constructor(options: EditorStoreOptions) {
    this.project = upgradeProject(cloneProject(options.project))
    this.bridge = options.bridge
    this.stack = new CommandStack<TunnelProject>(options.history)
    this.now = options.now ?? (() => Date.now())
    this.idGenerator = options.idGenerator ?? defaultIdGenerator
  }

  getSnapshot(): EditorSnapshot {
    return {
      mode: this.mode,
      project: this.project,
      selectedIds: [...this.selectedIds],
      gizmoMode: this.gizmoMode,
      snapMode: this.snapMode,
      canUndo: this.stack.canUndo,
      canRedo: this.stack.canRedo,
      undoCount: this.stack.undoCount,
      redoCount: this.stack.redoCount,
      undoLabel: this.stack.undoLabel,
      redoLabel: this.stack.redoLabel,
      history: this.stack.entries,
      dirty: this.stack.isDirty,
      busy: this.busy,
      lastUpdateKind: this.lastUpdateKind,
      error: this.error,
    }
  }

  subscribe(listener: (snapshot: EditorSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) listener(snapshot)
  }

  setBridge(bridge?: EditorSceneBridge): void {
    this.bridge = bridge
  }

  setMode(mode: EditorMode): void {
    if (this.mode === mode) return
    this.mode = mode
    if (mode === 'runtime') this.selectedIds = []
    this.emit()
  }

  setGizmoMode(mode: GizmoMode): void {
    if (this.gizmoMode === mode) return
    this.gizmoMode = mode
    this.emit()
  }

  setSnapMode(mode: SnapMode): void {
    if (this.snapMode === mode) return
    this.snapMode = mode
    this.emit()
  }

  select(ids: string[], options: SelectionOptions = {}): void {
    const validSet = new Set(this.project.assets.map(asset => asset.id))
    const validIds = ids.filter(id => validSet.has(id))
    if (options.toggle) {
      const next = new Set(this.selectedIds)
      for (const id of validIds) {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      }
      this.selectedIds = [...next]
    } else if (options.append) {
      const next = new Set(this.selectedIds)
      for (const id of validIds) next.add(id)
      this.selectedIds = [...next]
    } else {
      this.selectedIds = [...new Set(validIds)]
    }
    this.emit()
  }

  clearSelection(): void {
    if (this.selectedIds.length === 0) return
    this.selectedIds = []
    this.emit()
  }

  syncProject(project: TunnelProject, resetHistory = true): void {
    this.project = upgradeProject(cloneProject(project))
    const validSet = new Set(this.project.assets.map(asset => asset.id))
    this.selectedIds = this.selectedIds.filter(id => validSet.has(id))
    if (resetHistory) this.stack.clear(true)
    this.error = null
    this.emit()
  }

  markSaved(): void {
    this.stack.markSaved()
    this.emit()
  }

  previewAssetTransform(id: string, patch: Partial<AssetRecord>): AssetRecord | null {
    const current = this.project.assets.find(asset => asset.id === id)
    if (!current) return null
    const draft = moveAsset(cloneAsset(current), patch, this.project)
    this.bridge?.previewAsset?.(draft)
    return draft
  }

  private async dispatchBridge(previous: TunnelProject, next: TunnelProject): Promise<ProjectUpdateKind> {
    const updateKind = projectUpdateKind(previous, next)
    if (!this.bridge) return updateKind

    const singleMoved = isSimpleAssetMove(previous, next)
    if (singleMoved && this.bridge.commitAssetRecord) {
      await this.bridge.commitAssetRecord(cloneAsset(singleMoved), cloneProject(next))
      return 'records'
    }

    await this.bridge.applyProject(cloneProject(next))
    return updateKind
  }

  private async executeCommand(command: EditorCommand<TunnelProject>): Promise<TunnelProject> {
    if (this.busy) throw new Error('场景正在应用变更，请稍候再试')
    const previous = this.project
    const previewNext = upgradeProject(command.apply(cloneProject(previous)))
    const errors = projectErrors(previewNext)
    if (errors.length) {
      this.error = errors.join('\n')
      this.emit()
      throw new Error(this.error)
    }

    this.busy = true
    this.error = null
    this.emit()
    try {
      const updateKind = await this.dispatchBridge(previous, previewNext)
      this.project = this.stack.execute(previous, command)
      this.lastUpdateKind = updateKind
      const validSet = new Set(this.project.assets.map(asset => asset.id))
      this.selectedIds = this.selectedIds.filter(id => validSet.has(id))
      return this.project
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      this.busy = false
      this.emit()
    }
  }

  async commitAssetTransform(id: string, patch: Partial<AssetRecord>, options: TransformCommitOptions = {}): Promise<TunnelProject> {
    const current = this.project.assets.find(asset => asset.id === id)
    if (!current) throw new Error(`未找到设备：${id}`)
    const before = cloneAsset(options.before ?? resolveAsset(current, this.project))
    const after = moveAsset(cloneAsset(current), patch, this.project)
    const timestamp = this.now()
    const isFacility = ['pedestrian', 'vehicle', 'layby'].includes(after.kind)

    type TransformAssetCommand = EditorCommand<TunnelProject> & { readonly targetAsset: AssetRecord }

    const buildCommand = (from: AssetRecord, to: AssetRecord, ts: number): TransformAssetCommand => ({
      id: this.idGenerator(),
      label: options.label ?? `调整设备 ${to.code}`,
      timestamp: ts,
      mergeKey: options.mergeKey,
      targetAsset: cloneAsset(to),
      apply(state) {
        const next = isFacility ? facilityProject(state, cloneAsset(to)) : cloneProject(state)
        if (!isFacility) next.assets = next.assets.map(asset => (asset.id === to.id ? cloneAsset(to) : asset))
        return upgradeProject(next)
      },
      revert(state) {
        const next = isFacility ? facilityProject(state, cloneAsset(from)) : cloneProject(state)
        if (!isFacility) next.assets = next.assets.map(asset => (asset.id === from.id ? cloneAsset(from) : asset))
        return upgradeProject(next)
      },
      merge(nextCommand) {
        const candidate = nextCommand as Partial<TransformAssetCommand>
        if (!candidate.targetAsset || candidate.targetAsset.id !== to.id) return null
        return buildCommand(from, cloneAsset(candidate.targetAsset), nextCommand.timestamp)
      },
    })

    return this.executeCommand(buildCommand(before, after, timestamp))
  }

  async addAsset(asset: AssetRecord, label?: string): Promise<TunnelProject> {
    const record = cloneAsset(asset)
    const command: EditorCommand<TunnelProject> = {
      id: this.idGenerator(),
      label: label ?? `新增设备 ${record.code}`,
      timestamp: this.now(),
      apply(state) {
        const next = cloneProject(state)
        next.assets.push(cloneAsset(record))
        return upgradeProject(next)
      },
      revert(state) {
        const next = cloneProject(state)
        next.assets = next.assets.filter(item => item.id !== record.id)
        return upgradeProject(next)
      },
    }
    const updated = await this.executeCommand(command)
    this.select([record.id])
    return updated
  }

  async duplicateAssets(ids: string[] = this.selectedIds, stationOffset = 2): Promise<AssetRecord[]> {
    const targets = this.project.assets.filter(asset => ids.includes(asset.id))
    if (targets.length === 0) return []
    const existingCodes = new Set(this.project.assets.map(asset => asset.code))
    const clones: AssetRecord[] = targets.map(asset => {
      const bore = this.project.bores.find(item => item.id === asset.boreId)
      const direction = bore ? Math.sign(bore.end - bore.start) || 1 : 1
      const maxChainage = bore ? Math.max(bore.start, bore.end) + 240 : asset.chainage + stationOffset
      const minChainage = bore ? Math.min(bore.start, bore.end) - 240 : asset.chainage - stationOffset
      const shifted = Math.max(minChainage, Math.min(maxChainage, asset.chainage + stationOffset * direction))
      const next: AssetRecord = {
        ...cloneAsset(asset),
        id: this.idGenerator(),
        code: uniqueAssetCode(asset.code, existingCodes),
        chainage: shifted,
      }
      if (next.endChainage !== undefined && bore) {
        const span = asset.endChainage! - asset.chainage
        const limit = boreLength(bore)
        next.endChainage = Math.max(Math.min(bore.start, bore.end), Math.min(Math.max(bore.start, bore.end), Math.min(bore.start + limit, shifted + span)))
      }
      delete next.link
      return next
    })

    const cloneIds = new Set(clones.map(asset => asset.id))
    const command: EditorCommand<TunnelProject> = {
      id: this.idGenerator(),
      label: clones.length === 1 ? `复制设备 ${clones[0]!.code}` : `复制 ${clones.length} 条设备`,
      timestamp: this.now(),
      apply(state) {
        const next = cloneProject(state)
        next.assets.push(...clones.map(cloneAsset))
        return upgradeProject(next)
      },
      revert(state) {
        const next = cloneProject(state)
        next.assets = next.assets.filter(asset => !cloneIds.has(asset.id))
        return upgradeProject(next)
      },
    }

    await this.executeCommand(command)
    this.select(clones.map(asset => asset.id))
    return clones
  }

  async deleteAssets(ids: string[] = this.selectedIds): Promise<TunnelProject> {
    const idSet = new Set(ids)
    const removed = this.project.assets
      .map((asset, index) => ({ asset: cloneAsset(asset), index }))
      .filter(entry => idSet.has(entry.asset.id))
    if (removed.length === 0) return this.project

    const command: EditorCommand<TunnelProject> = {
      id: this.idGenerator(),
      label: removed.length === 1 ? `删除设备 ${removed[0]!.asset.code}` : `删除 ${removed.length} 条设备`,
      timestamp: this.now(),
      apply(state) {
        const next = cloneProject(state)
        next.assets = next.assets.filter(asset => !idSet.has(asset.id))
        return upgradeProject(next)
      },
      revert(state) {
        const next = cloneProject(state)
        const restored = [...next.assets]
        for (const entry of removed) {
          restored.splice(Math.min(entry.index, restored.length), 0, cloneAsset(entry.asset))
        }
        next.assets = restored
        return upgradeProject(next)
      },
    }

    return this.executeCommand(command)
  }

  async updateProject(updater: (draft: TunnelProject) => TunnelProject | void, label = '更新场景配置'): Promise<TunnelProject> {
    const before = cloneProject(this.project)
    const draft = cloneProject(this.project)
    const returned = updater(draft)
    const after = upgradeProject(cloneProject(returned ?? draft))

    const command: EditorCommand<TunnelProject> = {
      id: this.idGenerator(),
      label,
      timestamp: this.now(),
      apply: () => cloneProject(after),
      revert: () => cloneProject(before),
    }
    return this.executeCommand(command)
  }

  async undo(): Promise<boolean> {
    if (this.busy || !this.stack.canUndo) return false
    const previous = this.project
    const transition = this.stack.undo(cloneProject(previous))
    if (!transition) return false

    this.busy = true
    this.error = null
    this.emit()
    try {
      const updateKind = await this.dispatchBridge(previous, transition.state)
      this.project = transition.state
      this.lastUpdateKind = updateKind
      const validSet = new Set(this.project.assets.map(asset => asset.id))
      this.selectedIds = this.selectedIds.filter(id => validSet.has(id))
      return true
    } catch (error) {
      // Restore stack position on bridge failure.
      this.stack.redo(transition.state)
      this.error = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      this.busy = false
      this.emit()
    }
  }

  async redo(): Promise<boolean> {
    if (this.busy || !this.stack.canRedo) return false
    const previous = this.project
    const transition = this.stack.redo(cloneProject(previous))
    if (!transition) return false

    this.busy = true
    this.error = null
    this.emit()
    try {
      const updateKind = await this.dispatchBridge(previous, transition.state)
      this.project = transition.state
      this.lastUpdateKind = updateKind
      const validSet = new Set(this.project.assets.map(asset => asset.id))
      this.selectedIds = this.selectedIds.filter(id => validSet.has(id))
      return true
    } catch (error) {
      // Restore stack position on bridge failure.
      this.stack.undo(transition.state)
      this.error = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      this.busy = false
      this.emit()
    }
  }
}
