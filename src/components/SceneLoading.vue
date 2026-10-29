<script setup lang="ts">
import type { LoadProgress } from '../types/scene'
defineProps<{progress:LoadProgress;error:string}>()
function retry():void{window.location.reload()}
</script>
<template>
  <div class="scene-loading" :role="error?'alert':'status'">
    <strong>{{error?`场景加载失败 · ${progress.stage}`:progress.stage}}</strong>
    <div role="progressbar" aria-label="场景初始化进度" :aria-valuenow="progress.percent" aria-valuemin="0" aria-valuemax="100" class="scene-progress"><span :style="{width:`${progress.percent}%`}"/></div>
    <div class="load-caption"><span>{{progress.resource}}</span><b>{{progress.percent}}%</b></div>
    <p v-if="error">{{error}}</p><p v-else>场景初始化进度 · 包含地形、模型与材质准备</p>
    <button v-if="error" @click="retry">重新加载</button>
  </div>
</template>
