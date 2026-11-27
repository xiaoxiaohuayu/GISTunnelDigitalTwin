import { computed, ref } from 'vue'
import {
  STUDIO_SCHEMA_VERSION,
  type BoreDirection,
  type FacilityType,
  type GeoPoint,
  type TunnelBoreConfig,
  type TunnelFacilityItem,
  type TunnelSceneDocument,
  type TunnelWallConfig,
} from '../schema/tunnelSchema'
import { createDefaultSceneDocument, validateSceneDocument, WALL_MATERIAL_PRESETS } from '../schema/defaultScene'
import { computeAlignmentMetrics, computeEndPointFromVector } from '../geometry/alignmentMath'
import { createFacilityByType } from '../registry/facilityRegistry'

const STORAGE_KEY = 'codex-aigis:tunnel-studio:v1'
const MAX_HISTORY_SIZE = 50

export type SelectionTarget =
  | { kind: 'tunnel' }
  | { kind: 'bore'; id: string }
  | { kind: 'wall' }
  | { kind: 'facility'; id: string }

function cloneDoc(doc: TunnelSceneDocument): TunnelSceneDocument {
  return JSON.parse(JSON.stringify(doc)) as TunnelSceneDocument
}

function loadInitialDocument(): TunnelSceneDocument {
  if (typeof window === 'undefined') return createDefaultSceneDocument()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultSceneDocument()
    const parsed = JSON.parse(raw) as Partial<TunnelSceneDocument>
    if (parsed && parsed.schemaVersion === STUDIO_SCHEMA_VERSION && parsed.tunnel && parsed.wall && Array.isArray(parsed.facilities)) {
      return parsed as TunnelSceneDocument
    }
  } catch {
    // 忽略损坏缓存并回退到默认场景
  }
  return createDefaultSceneDocument()
}

function persistDocument(doc: TunnelSceneDocument): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(doc))
  } catch {
    // 浏览器隐私模式或空间不足时静默降级
  }
}

const documentRef = ref<TunnelSceneDocument>(loadInitialDocument())
const selectionRef = ref<SelectionTarget>({ kind: 'tunnel' })
const undoStack = ref<TunnelSceneDocument[]>([])
const redoStack = ref<TunnelSceneDocument[]>([])

function commitMutation(mutator: (draft: TunnelSceneDocument) => void): void {
  const previous = cloneDoc(documentRef.value)
  const draft = cloneDoc(documentRef.value)
  mutator(draft)
  draft.updatedAt = new Date().toISOString()

  undoStack.value.push(previous)
  if (undoStack.value.length > MAX_HISTORY_SIZE) {
    undoStack.value.shift()
  }
  redoStack.value = []

  documentRef.value = draft
  persistDocument(draft)
}

/**
 * 隧道场景编辑器响应式状态仓库（单例 Composable）
 */
export function useTunnelStudioStore() {
  const alignment = computed(() =>
    computeAlignmentMetrics(documentRef.value.tunnel.startPoint, documentRef.value.tunnel.endPoint),
  )

  const validationErrors = computed(() => validateSceneDocument(documentRef.value))
  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  const selectedBore = computed(() => {
    const sel = selectionRef.value
    if (sel.kind !== 'bore') return null
    return documentRef.value.tunnel.bores.find(b => b.id === sel.id) ?? null
  })

  const selectedFacility = computed(() => {
    const sel = selectionRef.value
    if (sel.kind !== 'facility') return null
    return documentRef.value.facilities.find(f => f.id === sel.id) ?? null
  })

  function select(target: SelectionTarget): void {
    selectionRef.value = target
  }

  function undo(): void {
    const previous = undoStack.value.pop()
    if (!previous) return
    redoStack.value.push(cloneDoc(documentRef.value))
    documentRef.value = previous
    persistDocument(previous)
  }

  function redo(): void {
    const next = redoStack.value.pop()
    if (!next) return
    undoStack.value.push(cloneDoc(documentRef.value))
    documentRef.value = next
    persistDocument(next)
  }

  /** 更新隧道本体基础属性（名称、编号、起止点、洞口拱形结构） */
  function updateTunnelBody(patch: Partial<TunnelSceneDocument['tunnel']>): void {
    commitMutation(draft => {
      Object.assign(draft.tunnel, patch)
    })
  }

  function updatePortalArch(patch: Partial<TunnelSceneDocument['tunnel']['portalArch']>): void {
    commitMutation(draft => {
      Object.assign(draft.tunnel.portalArch, patch)
    })
  }

  function updateGeoPoint(which: 'startPoint' | 'endPoint', patch: Partial<GeoPoint>): void {
    commitMutation(draft => {
      Object.assign(draft.tunnel[which], patch)
    })
  }

  /** 通过修改水平长度、方位角或纵坡，自动反算终点经纬度高程 */
  function applyAlignmentVector(next: { horizontalLength?: number; headingDeg?: number; gradePercent?: number }): void {
    const current = alignment.value
    const nextEnd = computeEndPointFromVector(
      documentRef.value.tunnel.startPoint,
      next.horizontalLength ?? current.horizontalLength,
      next.headingDeg ?? current.headingDeg,
      next.gradePercent ?? current.gradePercent,
    )
    updateGeoPoint('endPoint', nextEnd)
  }

  /** 新增隧道洞筒（支持从单洞扩展到双洞或多洞） */
  function addBore(): TunnelBoreConfig {
    const existing = documentRef.value.tunnel.bores
    const nextIndex = existing.length + 1
    const direction: BoreDirection = existing.length % 2 === 0 ? 'upbound' : 'downbound'
    const maxOffset = existing.reduce((acc, b) => Math.max(acc, Math.abs(b.lateralOffset)), 0)
    const offset = existing.length === 0 ? 0 : (existing.length % 2 === 1 ? maxOffset + 24 : -(maxOffset + 24))
    const newBore: TunnelBoreConfig = {
      id: `bore-${Date.now().toString(36)}`,
      name: direction === 'upbound' ? `上行洞 #${nextIndex}` : `下行洞 #${nextIndex}`,
      direction,
      laneCount: 2,
      laneWidth: 3.75,
      lateralOffset: existing.length === 1 ? -existing[0]!.lateralOffset || 14 : offset,
      startChainage: existing[0]?.startChainage ?? 10000,
      visible: true,
    }
    commitMutation(draft => {
      draft.tunnel.bores.push(newBore)
    })
    select({ kind: 'bore', id: newBore.id })
    return newBore
  }

  function updateBore(boreId: string, patch: Partial<TunnelBoreConfig>): void {
    commitMutation(draft => {
      const target = draft.tunnel.bores.find(b => b.id === boreId)
      if (target) Object.assign(target, patch)
    })
  }

  function removeBore(boreId: string): void {
    if (documentRef.value.tunnel.bores.length <= 1) return
    commitMutation(draft => {
      draft.tunnel.bores = draft.tunnel.bores.filter(b => b.id !== boreId)
      const fallbackId = draft.tunnel.bores[0]?.id
      if (fallbackId) {
        for (const f of draft.facilities) {
          if ('boreId' in f && f.boreId === boreId) {
            f.boreId = fallbackId
          }
        }
      }
    })
    if (selectionRef.value.kind === 'bore' && selectionRef.value.id === boreId) {
      select({ kind: 'tunnel' })
    }
  }

  /** 一键互换上下行洞筒的行车方向（上行 <-> 下行） */
  function swapBoreDirections(): void {
    commitMutation(draft => {
      for (const bore of draft.tunnel.bores) {
        if (bore.direction === 'upbound') {
          bore.direction = 'downbound'
          if (bore.name.includes('上行')) bore.name = bore.name.replace('上行', '下行')
        } else if (bore.direction === 'downbound') {
          bore.direction = 'upbound'
          if (bore.name.includes('下行')) bore.name = bore.name.replace('下行', '上行')
        }
      }
    })
  }

  /** 更新隧道墙体配置 */
  function updateWall(patch: Partial<TunnelWallConfig>): void {
    commitMutation(draft => {
      Object.assign(draft.wall, patch)
    })
  }

  function applyWallMaterialPreset(preset: TunnelWallConfig['materialPreset']): void {
    const colors = WALL_MATERIAL_PRESETS[preset]
    updateWall({
      materialPreset: preset,
      wallColor: colors.wallColor,
      archColor: colors.archColor,
      wainscotColor: colors.wainscotColor,
    })
  }

  /** 新增任意类型的隧道设施 */
  function addFacility(type: FacilityType): TunnelFacilityItem {
    const item = createFacilityByType(type, documentRef.value.tunnel, documentRef.value.facilities)
    commitMutation(draft => {
      draft.facilities.push(item)
    })
    select({ kind: 'facility', id: item.id })
    return item
  }

  function updateFacility<T extends TunnelFacilityItem>(facilityId: string, patch: Partial<T>): void {
    commitMutation(draft => {
      const target = draft.facilities.find(f => f.id === facilityId)
      if (target) Object.assign(target, patch)
    })
  }

  function removeFacility(facilityId: string): void {
    commitMutation(draft => {
      draft.facilities = draft.facilities.filter(f => f.id !== facilityId)
    })
    if (selectionRef.value.kind === 'facility' && selectionRef.value.id === facilityId) {
      select({ kind: 'tunnel' })
    }
  }

  function duplicateFacility(facilityId: string): void {
    const source = documentRef.value.facilities.find(f => f.id === facilityId)
    if (!source) return
    const copy = JSON.parse(JSON.stringify(source)) as TunnelFacilityItem
    copy.id = `${source.type}-${Date.now().toString(36)}`
    copy.name = `${source.name} 副本`
    if ('station' in copy) {
      copy.station = Math.round(copy.station + 40)
    } else if ('offsetFromPortal' in copy) {
      copy.offsetFromPortal = Math.round(copy.offsetFromPortal + 12)
    }
    commitMutation(draft => {
      draft.facilities.push(copy)
    })
    select({ kind: 'facility', id: copy.id })
  }

  function resetToDefault(): void {
    commitMutation(draft => {
      const fresh = createDefaultSceneDocument()
      draft.id = fresh.id
      draft.tunnel = fresh.tunnel
      draft.wall = fresh.wall
      draft.facilities = fresh.facilities
      draft.extensions = fresh.extensions
    })
    select({ kind: 'tunnel' })
  }

  function exportJson(): string {
    return JSON.stringify(documentRef.value, null, 2)
  }

  function importJson(rawText: string): { ok: boolean; error?: string } {
    try {
      const parsed = JSON.parse(rawText) as Partial<TunnelSceneDocument>
      if (!parsed || parsed.schemaVersion !== STUDIO_SCHEMA_VERSION || !parsed.tunnel || !parsed.wall || !Array.isArray(parsed.facilities)) {
        return { ok: false, error: 'JSON 格式不符合隧道场景编辑器 Schema v1.0 规范' }
      }
      commitMutation(draft => {
        draft.id = parsed.id ?? draft.id
        draft.tunnel = parsed.tunnel!
        draft.wall = parsed.wall!
        draft.facilities = parsed.facilities!
        draft.extensions = parsed.extensions ?? {}
      })
      select({ kind: 'tunnel' })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: `JSON 解析失败：${error instanceof Error ? error.message : String(error)}` }
    }
  }

  return {
    doc: documentRef,
    selection: selectionRef,
    alignment,
    validationErrors,
    canUndo,
    canRedo,
    selectedBore,
    selectedFacility,
    select,
    undo,
    redo,
    updateTunnelBody,
    updatePortalArch,
    updateGeoPoint,
    applyAlignmentVector,
    addBore,
    updateBore,
    removeBore,
    swapBoreDirections,
    updateWall,
    applyWallMaterialPreset,
    addFacility,
    updateFacility,
    removeFacility,
    duplicateFacility,
    resetToDefault,
    exportJson,
    importJson,
  }
}
