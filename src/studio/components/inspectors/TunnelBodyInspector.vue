<script setup lang="ts">
import type { TunnelBodyConfig, TunnelBoreConfig } from '../../schema/tunnelSchema'
import type { TunnelAlignmentMetrics } from '../../geometry/alignmentMath'

defineProps<{
  tunnel: TunnelBodyConfig
  alignment: TunnelAlignmentMetrics
}>()

const emit = defineEmits<{
  updateBody: [patch: Partial<TunnelBodyConfig>]
  updateArch: [patch: Partial<TunnelBodyConfig['portalArch']>]
  updateBore: [boreId: string, patch: Partial<TunnelBoreConfig>]
  updatePoint: [which: 'startPoint' | 'endPoint', patch: Partial<TunnelBodyConfig['startPoint']>]
  applyVector: [next: { horizontalLength?: number; headingDeg?: number; gradePercent?: number }]
}>()

function asNum(value: unknown, cb: (num: number) => void): void {
  if (value !== null && value !== undefined && Number.isFinite(Number(value))) {
    cb(Number(value))
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- 隧道名称与编号 -->
    <section class="twin-card p-3 space-y-2.5">
      <h3 class="twin-section-title">隧道基础信息</h3>
      <div class="space-y-1">
        <label class="text-[12px] text-twin-muted block">隧道主名称（各洞口默认题字）</label>
        <el-input
          size="small"
          :model-value="tunnel.name"
          placeholder="例如：青山隧道"
          @update:model-value="(value: unknown) => emit('updateBody', { name: String(value ?? '') })"
        />
      </div>
      <div class="space-y-1">
        <label class="text-[12px] text-twin-muted block">工程编号</label>
        <el-input
          size="small"
          :model-value="tunnel.code"
          placeholder="例如：G42-QS-01"
          @update:model-value="(value: unknown) => emit('updateBody', { code: String(value ?? '') })"
        />
      </div>
    </section>

    <!-- 各洞口门头独立题字 -->
    <section class="twin-card p-3 space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="twin-section-title">各洞口门头题字</h3>
        <div class="flex items-center gap-1.5">
          <span class="text-[11px] text-twin-muted">字色</span>
          <el-color-picker
            size="small"
            :model-value="tunnel.portalArch.textColor"
            @update:model-value="(value: unknown) => value && emit('updateArch', { textColor: String(value) })"
          />
        </div>
      </div>

      <div
        v-for="bore in tunnel.bores"
        :key="bore.id"
        class="p-2.5 rounded-[8px] bg-white/4 border border-solid border-white/10 space-y-2"
      >
        <div class="text-[12px] font-600 text-twin-accent">{{ bore.name }}</div>
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">起点洞口文字（留空跟随主名称）</label>
          <el-input
            size="small"
            :model-value="bore.startPortalName ?? ''"
            :placeholder="tunnel.name || '青山隧道'"
            @update:model-value="(value: unknown) => emit('updateBore', bore.id, { startPortalName: String(value ?? '') })"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">终点洞口文字（留空跟随主名称）</label>
          <el-input
            size="small"
            :model-value="bore.endPortalName ?? ''"
            :placeholder="tunnel.name || '青山隧道'"
            @update:model-value="(value: unknown) => emit('updateBore', bore.id, { endPortalName: String(value ?? '') })"
          />
        </div>
      </div>
    </section>

    <!-- 起止经纬度与高程 -->
    <section class="twin-card p-3 space-y-2.5">
      <h3 class="twin-section-title">隧道起止经纬度</h3>

      <div class="text-[11px] font-600 text-twin-accent">开始坐标（起点洞口）</div>
      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">经度 (°)</label>
          <el-input-number
            size="small"
            class="w-full"
            :precision="6"
            :step="0.0005"
            :min="-180"
            :max="180"
            :controls="false"
            :model-value="tunnel.startPoint.longitude"
            @update:model-value="(value: unknown) => asNum(value, longitude => emit('updatePoint', 'startPoint', { longitude }))"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">纬度 (°)</label>
          <el-input-number
            size="small"
            class="w-full"
            :precision="6"
            :step="0.0005"
            :min="-85"
            :max="85"
            :controls="false"
            :model-value="tunnel.startPoint.latitude"
            @update:model-value="(value: unknown) => asNum(value, latitude => emit('updatePoint', 'startPoint', { latitude }))"
          />
        </div>
      </div>
      <div class="space-y-1">
        <label class="text-[11px] text-twin-muted block">起点高程 (m)</label>
        <el-input-number
          size="small"
          class="w-full"
          :precision="2"
          :step="1"
          :min="-500"
          :max="8000"
          :model-value="tunnel.startPoint.elevation"
          @update:model-value="(value: unknown) => asNum(value, elevation => emit('updatePoint', 'startPoint', { elevation }))"
        />
      </div>

      <div class="text-[11px] font-600 text-twin-accent pt-1">结束坐标（终点洞口）</div>
      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">经度 (°)</label>
          <el-input-number
            size="small"
            class="w-full"
            :precision="6"
            :step="0.0005"
            :min="-180"
            :max="180"
            :controls="false"
            :model-value="tunnel.endPoint.longitude"
            @update:model-value="(value: unknown) => asNum(value, longitude => emit('updatePoint', 'endPoint', { longitude }))"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">纬度 (°)</label>
          <el-input-number
            size="small"
            class="w-full"
            :precision="6"
            :step="0.0005"
            :min="-85"
            :max="85"
            :controls="false"
            :model-value="tunnel.endPoint.latitude"
            @update:model-value="(value: unknown) => asNum(value, latitude => emit('updatePoint', 'endPoint', { latitude }))"
          />
        </div>
      </div>
      <div class="space-y-1">
        <label class="text-[11px] text-twin-muted block">终点高程 (m)</label>
        <el-input-number
          size="small"
          class="w-full"
          :precision="2"
          :step="1"
          :min="-500"
          :max="8000"
          :model-value="tunnel.endPoint.elevation"
          @update:model-value="(value: unknown) => asNum(value, elevation => emit('updatePoint', 'endPoint', { elevation }))"
        />
      </div>
    </section>

    <!-- 快捷轴线反算 -->
    <section class="twin-card p-3 space-y-2.5">
      <h3 class="twin-section-title">轴线几何解算（双向联动）</h3>
      <div class="grid grid-cols-3 gap-2">
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">水平全长 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="50"
            :max="20000"
            :step="20"
            :controls="false"
            :model-value="alignment.horizontalLength"
            @update:model-value="(value: unknown) => asNum(value, horizontalLength => emit('applyVector', { horizontalLength }))"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">方位角 (°)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="0"
            :max="360"
            :step="1"
            :controls="false"
            :model-value="alignment.headingDeg"
            @update:model-value="(value: unknown) => asNum(value, headingDeg => emit('applyVector', { headingDeg }))"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">纵坡 (%)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="-10"
            :max="10"
            :step="0.2"
            :precision="2"
            :controls="false"
            :model-value="alignment.gradePercent"
            @update:model-value="(value: unknown) => asNum(value, gradePercent => emit('applyVector', { gradePercent }))"
          />
        </div>
      </div>
      <div class="text-[11px] text-twin-sub tabular">
        空间斜距：{{ alignment.slopeLength }} m · 高差：{{ alignment.elevationDelta }} m
      </div>
    </section>
  </div>
</template>
