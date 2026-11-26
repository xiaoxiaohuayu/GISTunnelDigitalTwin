<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import type { EditorSnapshot, GizmoMode, SnapMode } from '../../editor'
import type { AssetRecord, CameraBookmark, SceneVisualSettings } from '../../engines/projectConfig'
import type { DeviceKind, SystemsState } from '../../engines/tunnelSystemsState'
import type { CustomModelEntry } from '../../engines/customModelLibrary'
import type { TelemetrySnapshot } from '../../services'
import SceneOutline from './SceneOutline.vue'
import PropertyInspector from './PropertyInspector.vue'

const props = defineProps<{
  snapshot: EditorSnapshot
  customModels: CustomModelEntry[]
  telemetrySnapshot: TelemetrySnapshot
  dropActive?: boolean
  environment: SystemsState['environment']
  underground: boolean
  wallsVisible: boolean
  canopyVisible: boolean
  trafficVisible: boolean
  detectionVisible: boolean
  cameraGuardEnabled: boolean
}>()

const emit = defineEmits<{
  exit: []
  undo: []
  redo: []
  setGizmoMode: [mode: GizmoMode]
  setSnapMode: [mode: SnapMode]
  select: [id: string, options: { toggle: boolean }]
  clearSelection: []
  focus: [id: string]
  startGizmo: [id: string]
  addAsset: [kind: DeviceKind, boreId: string]
  toggleVisibility: [id: string, visible: boolean]
  toggleLock: [id: string, locked: boolean]
  uploadGlb: [file: File]
  addRemoteGlb: [url: string, name: string]
  deleteCustomModel: [id: string]
  placeCustomModel: [model: CustomModelEntry, boreId: string]
  duplicate: [ids: string[]]
  delete: [ids: string[]]
  previewTransform: [id: string, patch: Partial<AssetRecord>]
  commitTransform: [id: string, patch: Partial<AssetRecord>, mergeKey?: string]
  updateProjectName: [name: string]
  previewVisuals: [visuals: SceneVisualSettings]
  commitVisuals: [visuals: SceneVisualSettings]
  captureBookmark: [name: string]
  flyBookmark: [bookmark: CameraBookmark]
  deleteBookmark: [id: string]
  openFullConfig: []
  setEnvironment: [env: SystemsState['environment']]
  toggleUnderground: [enabled: boolean]
  toggleWalls: [enabled: boolean]
  toggleCanopy: [enabled: boolean]
  toggleTraffic: [enabled: boolean]
  toggleDetection: [enabled: boolean]
  toggleCameraGuard: [enabled: boolean]
}>()

const leftVisible = shallowRef(true)
const rightVisible = shallowRef(true)

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function onKeydown(event: KeyboardEvent): void {
  if (isTypingTarget(event.target)) return
  const mod = event.metaKey || event.ctrlKey
  const key = event.key.toLowerCase()

  if (mod && key === 'z') {
    event.preventDefault()
    if (event.shiftKey) emit('redo')
    else emit('undo')
    return
  }
  if (mod && key === 'y') {
    event.preventDefault()
    emit('redo')
    return
  }
  if (mod && key === 'd') {
    if (props.snapshot.selectedIds.length === 0) return
    event.preventDefault()
    emit('duplicate', props.snapshot.selectedIds)
    return
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (props.snapshot.selectedIds.length === 0) return
    event.preventDefault()
    emit('delete', props.snapshot.selectedIds)
    return
  }
  if (!mod && key === 'w') {
    emit('setGizmoMode', 'translate')
    return
  }
  if (!mod && key === 'e') {
    emit('setGizmoMode', 'rotate')
    return
  }
  if (!mod && key === 'r') {
    emit('setGizmoMode', 'scale')
    return
  }
  if (event.key === 'Escape' && props.snapshot.selectedIds.length > 0) {
    emit('clearSelection')
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div
    class="absolute inset-0 z-8 flex flex-col p-[12px_14px_14px] max-md:p-2 gap-2.5 pointer-events-none box-border"
    role="region"
    aria-label="三维场景编辑器工作台"
  >
    <header class="twin-topbar max-md:px-2 max-md:py-1.5">
      <div class="flex items-center flex-wrap gap-2">
        <span class="px-2 py-0.5 rounded-full bg-[#6cbaff]/20 border border-solid border-[#6cbaff]/55 text-[#9dd4ff] text-[11px] font-600 tracking-[0.04em]">
          场景编辑模式
        </span>
        <strong class="text-[13.5px] text-[#f2f7ff]">{{ snapshot.project.name }}</strong>
        <span
          class="text-[11px] pl-2 border-0 border-l border-solid border-[#84baf8]/24"
          :class="snapshot.dirty ? 'text-twin-warn' : 'text-twin-sub'"
        >
          {{ snapshot.busy ? '同步中…' : snapshot.dirty ? '有未归档变更' : '已同步' }}
        </span>
      </div>

      <div class="flex items-center flex-wrap gap-2">
        <el-radio-group
          :model-value="snapshot.gizmoMode"
          size="small"
          aria-label="变换模式"
          @change="emit('setGizmoMode', $event as GizmoMode)"
        >
          <el-radio-button value="translate">平移 W</el-radio-button>
          <el-radio-button value="rotate">旋转 E</el-radio-button>
          <el-radio-button value="scale">缩放 R</el-radio-button>
        </el-radio-group>

        <el-radio-group
          :model-value="snapshot.snapMode"
          size="small"
          aria-label="吸附模式"
          @change="emit('setSnapMode', $event as SnapMode)"
        >
          <el-radio-button value="none">自由</el-radio-button>
          <el-radio-button value="grid">网格</el-radio-button>
          <el-radio-button value="surface">吸附</el-radio-button>
        </el-radio-group>

        <div class="w-px h-[18px] bg-[#84baf8]/24" />

        <el-button
          size="small"
          :disabled="snapshot.busy || !snapshot.canUndo"
          :title="snapshot.undoLabel ? `撤销：${snapshot.undoLabel} (Ctrl+Z)` : '撤销 (Ctrl+Z)'"
          @click="emit('undo')"
        >
          撤销
        </el-button>
        <el-button
          size="small"
          :disabled="snapshot.busy || !snapshot.canRedo"
          :title="snapshot.redoLabel ? `重做：${snapshot.redoLabel} (Ctrl+Y)` : '重做 (Ctrl+Y)'"
          @click="emit('redo')"
        >
          重做
        </el-button>
        <el-button
          size="small"
          :disabled="snapshot.busy || snapshot.selectedIds.length === 0"
          title="复制选中设备 (Ctrl+D)"
          @click="emit('duplicate', snapshot.selectedIds)"
        >
          复制
        </el-button>
        <el-button
          size="small"
          type="danger"
          plain
          :disabled="snapshot.busy || snapshot.selectedIds.length === 0"
          title="删除选中设备 (Delete)"
          @click="emit('delete', snapshot.selectedIds)"
        >
          删除
        </el-button>
      </div>

      <div class="flex items-center flex-wrap gap-2">
        <el-button size="small" :type="leftVisible ? 'primary' : 'default'" plain @click="leftVisible = !leftVisible">
          大纲
        </el-button>
        <el-button size="small" :type="rightVisible ? 'primary' : 'default'" plain @click="rightVisible = !rightVisible">
          属性
        </el-button>
        <el-button size="small" @click="emit('openFullConfig')">台账与备份</el-button>
        <el-button size="small" type="primary" @click="emit('exit')">退出编辑</el-button>
      </div>
    </header>

    <div class="flex-1 min-h-0 flex items-stretch justify-between gap-3 pointer-events-none">
      <SceneOutline
        v-show="leftVisible"
        :project="snapshot.project"
        :selected-ids="snapshot.selectedIds"
        :busy="snapshot.busy"
        :custom-models="customModels"
        @select="(id, options) => emit('select', id, options)"
        @focus="emit('focus', $event)"
        @add-asset="(kind, boreId) => emit('addAsset', kind, boreId)"
        @toggle-visibility="(id, visible) => emit('toggleVisibility', id, visible)"
        @toggle-lock="(id, locked) => emit('toggleLock', id, locked)"
        @upload-glb="emit('uploadGlb', $event)"
        @add-remote-glb="(url, name) => emit('addRemoteGlb', url, name)"
        @delete-custom-model="emit('deleteCustomModel', $event)"
        @place-custom-model="(model, boreId) => emit('placeCustomModel', model, boreId)"
      />

      <div class="flex-1 min-w-0 relative flex items-start justify-center pt-4 pointer-events-none">
        <div
          v-if="dropActive"
          class="px-3.5 py-1.5 rounded-full bg-[#0c2044]/90 border border-solid border-[#6cbaff]/80 text-[#dff1ff] text-[12px] font-600 shadow-[0_8px_24px_rgba(2,8,22,0.55)]"
        >
          松手放置到当前三维落点
        </div>
      </div>

      <PropertyInspector
        v-show="rightVisible"
        :project="snapshot.project"
        :selected-ids="snapshot.selectedIds"
        :busy="snapshot.busy"
        :error="snapshot.error"
        :history="snapshot.history"
        :telemetry-snapshot="telemetrySnapshot"
        :environment="environment"
        :underground="underground"
        :walls-visible="wallsVisible"
        :canopy-visible="canopyVisible"
        :traffic-visible="trafficVisible"
        :detection-visible="detectionVisible"
        :camera-guard-enabled="cameraGuardEnabled"
        @preview-transform="(id, patch) => emit('previewTransform', id, patch)"
        @commit-transform="(id, patch, mergeKey) => emit('commitTransform', id, patch, mergeKey)"
        @update-project-name="emit('updateProjectName', $event)"
        @preview-visuals="emit('previewVisuals', $event)"
        @commit-visuals="emit('commitVisuals', $event)"
        @capture-bookmark="emit('captureBookmark', $event)"
        @fly-bookmark="emit('flyBookmark', $event)"
        @delete-bookmark="emit('deleteBookmark', $event)"
        @focus="emit('focus', $event)"
        @start-gizmo="emit('startGizmo', $event)"
        @duplicate="emit('duplicate', $event)"
        @delete="emit('delete', $event)"
        @clear-selection="emit('clearSelection')"
        @open-full-config="emit('openFullConfig')"
        @set-environment="emit('setEnvironment', $event)"
        @toggle-underground="emit('toggleUnderground', $event)"
        @toggle-walls="emit('toggleWalls', $event)"
        @toggle-canopy="emit('toggleCanopy', $event)"
        @toggle-traffic="emit('toggleTraffic', $event)"
        @toggle-detection="emit('toggleDetection', $event)"
        @toggle-camera-guard="emit('toggleCameraGuard', $event)"
      />
    </div>
  </div>
</template>
