<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { TunnelFacilityItem, TunnelSceneDocument } from '../schema/tunnelSchema'
import { StudioCesiumEngine, type StudioCameraPreset } from '../engine/StudioCesiumEngine'

const props = defineProps<{
  doc: TunnelSceneDocument
  selectedFacilityId: string | null
}>()

const emit = defineEmits<{
  selectFacility: [facilityId: string]
  moveFacility: [facilityId: string, patch: Partial<TunnelFacilityItem>]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const isLoading = ref(true)
const isRebuilding = ref(false)
const errorMessage = ref('')

let engine: StudioCesiumEngine | null = null
let syncTimer: number | null = null

onMounted(async () => {
  if (!containerRef.value) return
  engine = new StudioCesiumEngine()
  await engine.mount(containerRef.value, props.doc, {
    onReady: () => {
      isLoading.value = false
      engine?.setSelectedFacility(props.selectedFacilityId)
    },
    onRebuilding: rebuilding => {
      isRebuilding.value = rebuilding
    },
    onError: message => {
      isLoading.value = false
      isRebuilding.value = false
      errorMessage.value = message
    },
    onSelectFacility: facilityId => {
      emit('selectFacility', facilityId)
    },
    onMoveFacility: (facilityId, patch) => {
      emit('moveFacility', facilityId, patch)
    },
  })
})

watch(
  () => props.doc,
  nextDoc => {
    if (!engine) return
    if (syncTimer !== null) window.clearTimeout(syncTimer)
    syncTimer = window.setTimeout(() => {
      void engine?.syncScene(nextDoc)
      syncTimer = null
    }, 120)
  },
  { deep: true },
)

watch(
  () => props.selectedFacilityId,
  nextId => {
    engine?.setSelectedFacility(nextId)
  },
)

onBeforeUnmount(() => {
  if (syncTimer !== null) window.clearTimeout(syncTimer)
  engine?.dispose()
  engine = null
})

function focusPreset(preset: StudioCameraPreset): void {
  engine?.focusPreset(preset, true)
}

function focusFacility(facility: TunnelFacilityItem): void {
  engine?.focusFacility(facility)
}

defineExpose({
  focusPreset,
  focusFacility,
})
</script>

<template>
  <section class="relative flex-1 min-w-0 min-h-0 rounded-[14px] overflow-hidden border border-solid border-[var(--twin-border)] bg-[#0b1322]">
    <div ref="containerRef" class="w-full h-full" />

    <div
      v-if="isLoading"
      class="absolute inset-0 flex items-center justify-center bg-[#0b1322]/85 backdrop-blur-sm z-10"
    >
      <div class="px-5 py-3 rounded-[10px] twin-card text-[13px] text-twin-ink">
        正在加载原版高保真洞口与隧道 3D 场景…
      </div>
    </div>

    <div
      v-if="isRebuilding && !isLoading"
      class="absolute top-3 right-3 px-3 py-1.5 rounded-[8px] bg-[#0d1c38]/88 border border-solid border-[#6cbaff]/45 text-[12px] text-twin-ink z-20"
    >
      正在同步更新 3D 隧道结构…
    </div>

    <div
      v-if="errorMessage"
      class="absolute top-3 left-3 right-3 px-3.5 py-2.5 rounded-[10px] bg-[#3b151a]/90 border border-solid border-[#ff6b57]/45 text-[12px] text-[#ffb4a9] z-20"
    >
      视口渲染提示：{{ errorMessage }}
    </div>

    <div class="absolute bottom-3 left-3 px-3 py-1.5 rounded-[8px] bg-[#091326]/78 backdrop-blur-md border border-solid border-[#78b6fc]/25 text-[11px] text-twin-muted pointer-events-none">
      左键平移 · 右键旋转 · 滚轮缩放 · 选中设施可拖动红/绿/蓝三轴自由移动
    </div>
  </section>
</template>
