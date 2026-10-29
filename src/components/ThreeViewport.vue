<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { useEngine } from '../composables/useEngine'
import { createThreeScene } from '../engines/threeScene'

const container = useTemplateRef<HTMLDivElement>('container')
const { ready, error, resetView, getHandle } = useEngine(container, createThreeScene)
</script>

<template>
  <section class="viewport" aria-label="三维场景">
    <div ref="container" class="engine-container" />
    <div class="viewport-caption">
      <span class="eyebrow">TUNNEL DETAIL STUDY</span>
      <h2>双洞精细样板</h2>
      <p>120 m 衬砌 · 圆筒风机 · 消防设施 · 人行联络通道</p>
      <p class="sample-note">局部模型演示 · 地理山体请切换 GIS 地图</p>
    </div>
    <div v-if="error" class="viewport-message" role="alert">三维初始化失败：{{ error }}</div>
    <div v-else-if="!ready" class="viewport-message" role="status">正在初始化三维场景…</div>
    <div class="viewport-tools">
      <span>左键旋转 · 右键平移 · 滚轮缩放</span>
      <button :disabled="!ready" @click="resetView">洞口样板</button>
      <button :disabled="!ready" @click="getHandle()?.focus('interior')">洞内细节</button>
      <button :disabled="!ready" @click="getHandle()?.focus('passage')">联络通道</button>
    </div>
  </section>
</template>

<style scoped>
.sample-note { margin-top: 8px; font-size: 10px; }
.viewport-tools { flex-wrap: wrap; max-width: calc(100% - 32px); gap: 8px; }
</style>
