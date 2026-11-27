<script setup lang="ts">
import { computed } from 'vue'
import type { BoreDirection, TunnelBoreConfig } from '../../schema/tunnelSchema'
import { formatChainage, getBoreRoadWidth } from '../../geometry/alignmentMath'

const props = defineProps<{
  bore: TunnelBoreConfig
  tunnelName: string
  canDelete: boolean
  tunnelLength: number
}>()

const emit = defineEmits<{
  update: [patch: Partial<TunnelBoreConfig>]
  swapDirections: []
  remove: []
}>()

const roadWidth = computed(() => getBoreRoadWidth(props.bore))
const endChainageLabel = computed(() => formatChainage(props.bore.startChainage + props.tunnelLength))

function asNum(value: unknown, cb: (num: number) => void): void {
  if (value !== null && value !== undefined && Number.isFinite(Number(value))) {
    cb(Number(value))
  }
}
</script>

<template>
  <div class="space-y-4">
    <section class="twin-card p-3 space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="twin-section-title">洞筒与上下行配置</h3>
        <el-switch
          size="small"
          :model-value="bore.visible"
          active-text="显示"
          @update:model-value="(value: unknown) => emit('update', { visible: Boolean(value) })"
        />
      </div>

      <div class="space-y-1">
        <label class="text-[12px] text-twin-muted block">洞筒名称</label>
        <el-input
          size="small"
          :model-value="bore.name"
          @update:model-value="(value: unknown) => emit('update', { name: String(value ?? '') })"
        />
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">起点洞口文字</label>
          <el-input
            size="small"
            :model-value="bore.startPortalName ?? ''"
            :placeholder="tunnelName || '跟随主名称'"
            @update:model-value="(value: unknown) => emit('update', { startPortalName: String(value ?? '') })"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">终点洞口文字</label>
          <el-input
            size="small"
            :model-value="bore.endPortalName ?? ''"
            :placeholder="tunnelName || '跟随主名称'"
            @update:model-value="(value: unknown) => emit('update', { endPortalName: String(value ?? '') })"
          />
        </div>
      </div>

      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <label class="text-[12px] text-twin-muted">上下行方向</label>
          <el-button size="small" link type="primary" @click="emit('swapDirections')">
            一键互换双洞上下行
          </el-button>
        </div>
        <el-radio-group
          size="small"
          class="w-full"
          :model-value="bore.direction"
          @update:model-value="(value: unknown) => emit('update', { direction: value as BoreDirection })"
        >
          <el-radio-button value="upbound">上行（起点→终点）</el-radio-button>
          <el-radio-button value="downbound">下行（终点→起点）</el-radio-button>
          <el-radio-button value="bidirectional">双向</el-radio-button>
        </el-radio-group>
      </div>
    </section>

    <section class="twin-card p-3 space-y-3">
      <h3 class="twin-section-title">隧道车道与断面定位</h3>

      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <label class="text-[12px] text-twin-muted block">隧道内车道数</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="1"
            :max="6"
            :step="1"
            :model-value="bore.laneCount"
            @update:model-value="(value: unknown) => asNum(value, laneCount => emit('update', { laneCount }))"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[12px] text-twin-muted block">单车道宽 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="2.5"
            :max="4.5"
            :step="0.25"
            :precision="2"
            :model-value="bore.laneWidth"
            @update:model-value="(value: unknown) => asNum(value, laneWidth => emit('update', { laneWidth }))"
          />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <label class="text-[12px] text-twin-muted block">横向偏移 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="-120"
            :max="120"
            :step="1"
            :model-value="bore.lateralOffset"
            @update:model-value="(value: unknown) => asNum(value, lateralOffset => emit('update', { lateralOffset }))"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[12px] text-twin-muted block">起始桩号 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="0"
            :max="500000"
            :step="100"
            :model-value="bore.startChainage"
            @update:model-value="(value: unknown) => asNum(value, startChainage => emit('update', { startChainage }))"
          />
        </div>
      </div>

      <div class="px-2.5 py-2 rounded bg-white/4 text-[12px] text-twin-muted space-y-1 tabular">
        <div>路面净宽：{{ roadWidth }} m（{{ bore.laneCount }} × {{ bore.laneWidth }} m）</div>
        <div>桩号区间：{{ formatChainage(bore.startChainage) }} ～ {{ endChainageLabel }}</div>
      </div>
    </section>

    <div v-if="canDelete" class="pt-1">
      <el-button size="small" type="danger" plain class="w-full" @click="emit('remove')">
        删除当前洞筒
      </el-button>
    </div>
  </div>
</template>
