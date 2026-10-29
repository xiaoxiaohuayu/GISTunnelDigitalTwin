<script setup lang="ts">
import { computed } from 'vue'
import type { RoamingState } from '../types/tunnel'
const props=defineProps<{state:RoamingState;boreNames?:string[]}>()
defineEmits<{close:[];play:[playing:boolean];options:[patch:Partial<Pick<RoamingState,'tube'|'speed'>>];seek:[progress:number]}>()
const progress=computed(()=>(props.state.distance+220)/Math.max(1,props.state.length+440))
</script>
<template>
  <aside class="roaming-controls" aria-label="巡检漫游">
    <header><strong>巡检漫游</strong><span>{{state.distance<0?'洞外引道':state.distance>state.length?'出口引道':`距基点 ${Math.round(state.distance)} m`}}</span><button aria-label="关闭巡检漫游" @click="$emit('play',false);$emit('close')">×</button></header>
    <div class="roaming-settings">
      <label>洞筒<select :value="state.tube" @change="$emit('options',{tube:Number(($event.target as HTMLSelectElement).value) as 0|1})"><option v-for="(name,i) in boreNames??['上行洞 · 向东','下行洞 · 向西']" :key="i" :value="i">{{name}}</option></select></label>
      <label>速度<select :value="state.speed" @change="$emit('options',{speed:Number(($event.target as HTMLSelectElement).value)})"><option :value="30">30 km/h</option><option :value="60">60 km/h</option><option :value="90">90 km/h</option></select></label>
      <button @click="$emit('play',!state.playing)">{{state.playing?'暂停巡检':'继续巡检'}}</button>
    </div>
    <label class="roaming-progress">线路位置<input aria-label="巡检位置" type="range" min="0" max="1" step="0.001" :value="progress" @input="$emit('seek',Number(($event.target as HTMLInputElement).value))"></label>
  </aside>
</template>
