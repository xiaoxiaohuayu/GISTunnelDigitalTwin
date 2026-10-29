<script setup lang="ts">
import { computed } from 'vue'
import { formatChainage,parseChainage } from '../../engines/projectConfig'
import type { BoreConfig } from '../../engines/projectConfig'
const bore=defineModel<BoreConfig>({required:true})
const emit=defineEmits<{remove:[]}>()
const error=defineModel<string>('error',{default:''})
const length=computed(()=>Math.abs(bore.value.end-bore.value.start))
function chainage(which:'start'|'end',event:Event):void{try{bore.value[which]=parseChainage((event.target as HTMLInputElement).value);error.value=''}catch(e){error.value=String(e)}}
function lanes(event:Event):void{const count=Number((event.target as HTMLSelectElement).value);bore.value.lanes=Array.from({length:count},(_,i)=>bore.value.lanes[i]??{id:crypto.randomUUID(),direction:1})}
</script>
<template>
  <fieldset class="bore-editor"><legend>{{bore.name||'洞筒'}} · {{length}} m</legend>
    <div class="config-grid">
      <label>洞筒名称<input v-model="bore.name"></label>
      <label>起点桩号<input :value="formatChainage(bore.start)" @change="chainage('start',$event)"></label>
      <label>终点桩号<input :value="formatChainage(bore.end)" @change="chainage('end',$event)"></label>
      <label>相对线路横向偏移（m）<input v-model.number="bore.offset" type="number" step="0.1"></label>
      <label>车道宽度（m）<input v-model.number="bore.laneWidth" type="number" min="2.5" max="4.5" step="0.1"></label>
      <label>车道数量<select :value="bore.lanes.length" @change="lanes"><option v-for="n in 6" :key="n" :value="n">{{n}} 条</option></select></label>
    </div>
    <p class="config-help">车道按线路前进方向从左至右排列。正向沿线路前进，反向沿线路返回，与桩号是否递增无关。</p>
    <div class="lane-directions"><label v-for="(lane,i) in bore.lanes" :key="lane.id">车道 {{i+1}}<select v-model.number="lane.direction"><option :value="1">正向行驶</option><option :value="-1">反向行驶</option></select></label></div>
    <button class="config-danger" @click="emit('remove')">删除此洞筒及关联设备</button>
  </fieldset>
</template>
