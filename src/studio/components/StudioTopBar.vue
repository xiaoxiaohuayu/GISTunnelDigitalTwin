<script setup lang="ts">
import type { TunnelAlignmentMetrics } from '../geometry/alignmentMath'
import type { StudioCameraPreset } from '../engine/StudioCesiumEngine'

defineProps<{
  tunnelName: string
  alignment: TunnelAlignmentMetrics
  canUndo: boolean
  canRedo: boolean
  wallVisible: boolean
  validationCount: number
}>()

const emit = defineEmits<{
  undo: []
  redo: []
  focusPreset: [preset: StudioCameraPreset]
  toggleWallVisible: []
  exportJson: []
  importJson: [raw: string]
  resetDefault: []
  backLegacy: []
}>()

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      emit('importJson', reader.result)
    }
    input.value = ''
  }
  reader.readAsText(file)
}
</script>

<template>
  <header class="twin-topbar px-4 py-2.5 flex items-center justify-between gap-3">
    <div class="flex items-center gap-3 min-w-0">
      <div class="flex items-center gap-2">
        <span class="inline-block w-2.5 h-2.5 rounded-full bg-[#4ea8ff] shadow-[0_0_10px_#4ea8ff]" />
        <h1 class="m-0 text-[15px] font-600 text-twin-ink tracking-[0.02em] whitespace-nowrap">
          隧道场景编辑器
        </h1>
        <span class="px-2 py-0.5 text-[11px] rounded bg-[#4ea8ff]/18 text-[#8ecaff] border border-solid border-[#4ea8ff]/35">
          v1.0
        </span>
      </div>

      <div class="hidden xl:flex items-center gap-2 text-[12px] text-twin-muted tabular">
        <span class="px-2 py-0.5 rounded bg-white/5 text-twin-ink font-500 truncate max-w-[180px]">
          {{ tunnelName || '未命名隧道' }}
        </span>
        <span>全长 {{ Math.round(alignment.horizontalLength) }} m</span>
        <span>·</span>
        <span>方位 {{ alignment.headingDeg.toFixed(1) }}°</span>
        <span>·</span>
        <span>纵坡 {{ alignment.gradePercent.toFixed(2) }}%</span>
        <span
          v-if="validationCount > 0"
          class="px-2 py-0.5 rounded bg-[#ff6b57]/20 text-[#ffb4a9] border border-solid border-[#ff6b57]/40"
        >
          {{ validationCount }} 项校验提示
        </span>
      </div>
    </div>

    <div class="flex items-center gap-2 flex-wrap">
      <div class="flex items-center gap-1 pr-2 border-0 border-r border-solid border-white/10">
        <el-button size="small" :disabled="!canUndo" @click="emit('undo')">撤销</el-button>
        <el-button size="small" :disabled="!canRedo" @click="emit('redo')">重做</el-button>
      </div>

      <div class="flex items-center gap-1 pr-2 border-0 border-r border-solid border-white/10">
        <el-button size="small" @click="emit('focusPreset', 'overview')">全景</el-button>
        <el-button size="small" @click="emit('focusPreset', 'start_portal')">起点洞口</el-button>
        <el-button size="small" @click="emit('focusPreset', 'end_portal')">终点洞口</el-button>
        <el-button size="small" @click="emit('focusPreset', 'interior')">洞内视角</el-button>
        <el-button
          size="small"
          :type="wallVisible ? 'default' : 'primary'"
          @click="emit('toggleWallVisible')"
        >
          {{ wallVisible ? '透视墙体' : '显示墙体' }}
        </el-button>
      </div>

      <div class="flex items-center gap-1.5">
        <label class="el-button el-button--small cursor-pointer m-0">
          导入 JSON
          <input type="file" accept=".json,application/json" class="hidden" @change="onFileChange" />
        </label>
        <el-button size="small" @click="emit('exportJson')">导出 JSON</el-button>
        <el-button size="small" @click="emit('resetDefault')">重置默认</el-button>
        <el-button size="small" type="primary" plain @click="emit('backLegacy')">返回旧版视图</el-button>
      </div>
    </div>
  </header>
</template>
