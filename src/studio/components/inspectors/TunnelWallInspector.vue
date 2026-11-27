<script setup lang="ts">
import type { TunnelWallConfig } from '../../schema/tunnelSchema'

defineProps<{
  wall: TunnelWallConfig
}>()

const emit = defineEmits<{
  update: [patch: Partial<TunnelWallConfig>]
}>()

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
        <h3 class="twin-section-title">隧道墙体与衬砌</h3>
        <el-switch
          size="small"
          :model-value="wall.visible"
          active-text="显示墙体"
          @update:model-value="(value: unknown) => emit('update', { visible: Boolean(value) })"
        />
      </div>

      <div class="space-y-1">
        <div class="flex items-center justify-between text-[12px] text-twin-muted">
          <span>墙体不透明度（半透明透视内部）</span>
          <span class="tabular">{{ Math.round(wall.opacity * 100) }}%</span>
        </div>
        <el-slider
          size="small"
          :min="0.15"
          :max="1"
          :step="0.05"
          :model-value="wall.opacity"
          @update:model-value="(value: unknown) => asNum(value, opacity => emit('update', { opacity }))"
        />
      </div>
    </section>
  </div>
</template>
