<script setup lang="ts">
import { ref } from 'vue'
import { useAppRouter } from '../../router'
import { useTunnelStudioStore } from '../store/useTunnelStudioStore'
import type { StudioCameraPreset } from '../engine/StudioCesiumEngine'
import StudioTopBar from '../components/StudioTopBar.vue'
import StudioOutlinePanel from '../components/StudioOutlinePanel.vue'
import StudioViewport from '../components/StudioViewport.vue'
import TunnelBodyInspector from '../components/inspectors/TunnelBodyInspector.vue'
import BoreInspector from '../components/inspectors/BoreInspector.vue'
import TunnelWallInspector from '../components/inspectors/TunnelWallInspector.vue'
import FacilityInspector from '../components/inspectors/FacilityInspector.vue'

const { navigateTo } = useAppRouter()
const store = useTunnelStudioStore()

const viewportRef = ref<InstanceType<typeof StudioViewport> | null>(null)
const toastMessage = ref('')
let toastTimer: number | null = null

function showNotice(message: string): void {
  toastMessage.value = message
  if (toastTimer !== null) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastMessage.value = ''
    toastTimer = null
  }, 3200)
}

function handleFocusPreset(preset: StudioCameraPreset): void {
  viewportRef.value?.focusPreset(preset)
}

function handleFocusFacility(facilityId: string): void {
  const target = store.doc.value.facilities.find(f => f.id === facilityId)
  if (!target) return
  store.select({ kind: 'facility', id: facilityId })
  viewportRef.value?.focusFacility(target)
}

function handleExportJson(): void {
  const json = store.exportJson()
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${store.doc.value.tunnel.name || 'tunnel-scene'}.studio.json`
  link.click()
  URL.revokeObjectURL(url)
  showNotice('已导出场景配置 JSON 文件')
}

function handleImportJson(raw: string): void {
  const result = store.importJson(raw)
  if (result.ok) {
    showNotice('已成功导入场景配置并刷新 3D 视口')
  } else {
    showNotice(result.error ?? '导入失败')
  }
}

function handleResetDefault(): void {
  store.resetToDefault()
  viewportRef.value?.focusPreset('start_portal')
  showNotice('已恢复默认隧道配置')
}
</script>

<template>
  <div class="w-full h-screen flex flex-col gap-2.5 p-2.5 box-border bg-[#070d19] text-twin-ink overflow-hidden select-none">
    <!-- 顶部工具栏 -->
    <StudioTopBar
      :tunnel-name="store.doc.value.tunnel.name"
      :alignment="store.alignment.value"
      :can-undo="store.canUndo.value"
      :can-redo="store.canRedo.value"
      :wall-visible="store.doc.value.wall.visible"
      :validation-count="store.validationErrors.value.length"
      @undo="store.undo"
      @redo="store.redo"
      @focus-preset="handleFocusPreset"
      @toggle-wall-visible="store.updateWall({ visible: !store.doc.value.wall.visible })"
      @export-json="handleExportJson"
      @import-json="handleImportJson"
      @reset-default="handleResetDefault"
      @back-legacy="navigateTo('legacy')"
    />

    <!-- 三栏场景编辑器主体 -->
    <main class="flex-1 min-h-0 flex gap-2.5">
      <!-- 左侧：场景大纲与设施库 -->
      <StudioOutlinePanel
        :doc="store.doc.value"
        :selection="store.selection.value"
        @select="store.select"
        @add-bore="store.addBore"
        @swap-directions="store.swapBoreDirections"
        @add-facility="type => {
          const created = store.addFacility(type)
          viewportRef?.focusFacility(created)
        }"
        @toggle-facility-visible="(id, visible) => store.updateFacility(id, { visible })"
        @focus-facility="handleFocusFacility"
        @duplicate-facility="store.duplicateFacility"
        @remove-facility="store.removeFacility"
      />

      <!-- 中间：3D Cesium 实时编辑视口 -->
      <StudioViewport
        ref="viewportRef"
        :doc="store.doc.value"
        :selected-facility-id="store.selection.value.kind === 'facility' ? store.selection.value.id : null"
        @select-facility="id => store.select({ kind: 'facility', id })"
        @move-facility="(id, patch) => store.updateFacility(id, patch)"
      />

      <!-- 右侧：属性检查器 -->
      <aside class="twin-dock w-[340px] shrink-0 flex flex-col min-h-0">
        <div class="px-3.5 py-2.5 twin-divider-b flex items-center justify-between">
          <h2 class="twin-section-title">属性配置检查器</h2>
          <span class="text-[11px] text-twin-muted">实时同步 3D</span>
        </div>

        <div class="flex-1 overflow-y-auto p-3 space-y-3">
          <div
            v-if="store.validationErrors.value.length > 0"
            class="p-2.5 rounded-[8px] bg-[#3b151a]/75 border border-solid border-[#ff6b57]/40 text-[11.5px] text-[#ffb4a9] space-y-1"
          >
            <div class="font-600">配置校验提醒：</div>
            <div v-for="(err, idx) in store.validationErrors.value" :key="idx">• {{ err }}</div>
          </div>

          <TunnelBodyInspector
            v-if="store.selection.value.kind === 'tunnel'"
            :tunnel="store.doc.value.tunnel"
            :alignment="store.alignment.value"
            @update-body="store.updateTunnelBody"
            @update-arch="store.updatePortalArch"
            @update-bore="store.updateBore"
            @update-point="store.updateGeoPoint"
            @apply-vector="store.applyAlignmentVector"
          />

          <BoreInspector
            v-else-if="store.selection.value.kind === 'bore' && store.selectedBore.value"
            :bore="store.selectedBore.value"
            :tunnel-name="store.doc.value.tunnel.name"
            :can-delete="store.doc.value.tunnel.bores.length > 1"
            :tunnel-length="store.alignment.value.horizontalLength"
            @update="patch => store.updateBore(store.selectedBore.value!.id, patch)"
            @swap-directions="store.swapBoreDirections"
            @remove="store.removeBore(store.selectedBore.value!.id)"
          />

          <TunnelWallInspector
            v-else-if="store.selection.value.kind === 'wall'"
            :wall="store.doc.value.wall"
            @update="store.updateWall"
          />

          <FacilityInspector
            v-else-if="store.selection.value.kind === 'facility' && store.selectedFacility.value"
            :facility="store.selectedFacility.value"
            :bores="store.doc.value.tunnel.bores"
            :tunnel-length="store.alignment.value.horizontalLength"
            @update="patch => store.updateFacility(store.selectedFacility.value!.id, patch)"
            @focus="handleFocusFacility(store.selectedFacility.value!.id)"
            @duplicate="store.duplicateFacility(store.selectedFacility.value!.id)"
            @remove="store.removeFacility(store.selectedFacility.value!.id)"
          />
        </div>
      </aside>
    </main>

    <!-- 轻量级操作提示 -->
    <div
      v-if="toastMessage"
      class="fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2 rounded-[10px] bg-[#13294d]/92 border border-solid border-[#6cbaff]/50 text-[12.5px] text-twin-ink shadow-twin z-50"
    >
      {{ toastMessage }}
    </div>
  </div>
</template>
