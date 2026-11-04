<script setup lang="ts">
import { computed } from 'vue'
import type { RoamingState } from '../types/tunnel'
const props=defineProps<{state:RoamingState;boreNames?:string[]}>()
defineEmits<{close:[];play:[playing:boolean];options:[patch:Partial<Pick<RoamingState,'tube'|'speed'>>];seek:[progress:number]}>()
const progress=computed(()=>(props.state.distance+220)/Math.max(1,props.state.length+440))
</script>
<template>
  <aside class="roaming-controls" aria-label="巡检漫游">
    <header><strong>巡检漫游</strong><span>{{state.distance<0?'洞外引道':state.distance>state.length?'出口引道':`距基点 ${Math.round(state.distance)} m`}}</span><el-button text aria-label="关闭巡检漫游" @click="$emit('play',false);$emit('close')">×</el-button></header>
    <div class="roaming-settings">
      <label>洞筒<el-select :model-value="state.tube" @change="$emit('options',{tube:$event})"><el-option v-for="(name,i) in boreNames??['上行洞 · 向东','下行洞 · 向西']" :key="i" :label="name" :value="i" /></el-select></label>
      <label>速度<el-select :model-value="state.speed" @change="$emit('options',{speed:$event})"><el-option :value="30" label="30 km/h" /><el-option :value="60" label="60 km/h" /><el-option :value="90" label="90 km/h" /></el-select></label>
      <el-button :type="state.playing?'warning':'primary'" @click="$emit('play',!state.playing)">{{state.playing?'暂停巡检':'继续巡检'}}</el-button>
    </div>
    <label class="roaming-progress">线路位置<el-slider aria-label="巡检位置" :model-value="progress" :min="0" :max="1" :step="0.001" :show-tooltip="false" @input="$emit('seek',Number($event))" /></label>
  </aside>
</template>
