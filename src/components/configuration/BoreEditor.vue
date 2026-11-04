<script setup lang="ts">
import { computed } from 'vue'
import { formatChainage,parseChainage } from '../../engines/projectConfig'
import type { BoreConfig } from '../../engines/projectConfig'
const bore=defineModel<BoreConfig>({required:true})
const emit=defineEmits<{remove:[];direction:[laneId:string,turn:number];lanesAdded:[ids:string[]]}>()
const error=defineModel<string>('error',{default:''})
const length=computed(()=>Math.abs(bore.value.end-bore.value.start))
function chainage(which:'start'|'end',text:string):void{try{bore.value[which]=parseChainage(text);error.value=''}catch(e){error.value=String(e)}}
function lanes(count:number):void{const previous=bore.value.lanes;bore.value.lanes=Array.from({length:count},(_,i)=>previous[i]??{id:crypto.randomUUID(),direction:previous.at(-1)?.direction??1});emit('lanesAdded',bore.value.lanes.filter(l=>!previous.some(p=>p.id===l.id)).map(l=>l.id))}
function direction(lane:BoreConfig['lanes'][number],value:number):void{const next=value as 1|-1;if(next!==lane.direction){lane.direction=next;emit('direction',lane.id,180)}}
</script>
<template>
  <fieldset class="bore-editor"><legend>{{bore.name||'洞筒'}} · {{length}} m</legend>
    <div class="config-grid">
      <label>洞筒名称<el-input v-model="bore.name" /></label>
      <label>起点桩号<el-input :model-value="formatChainage(bore.start)" @change="chainage('start',$event)" /></label>
      <label>终点桩号<el-input :model-value="formatChainage(bore.end)" @change="chainage('end',$event)" /></label>
      <label>相对线路横向偏移（m）<el-input-number v-model="bore.offset" :step="0.1" controls-position="right" /></label>
      <label>车道宽度（m）<el-input-number v-model="bore.laneWidth" :min="2.5" :max="4.5" :step="0.1" controls-position="right" /></label>
      <label>车道数量<el-select :model-value="bore.lanes.length" @change="lanes"><el-option v-for="n in 6" :key="n" :label="`${n} 条`" :value="n" /></el-select></label>
    </div>
    <p class="config-help">车道按线路前进方向从左至右排列。正向沿线路前进，反向沿线路返回，与桩号是否递增无关。</p>
    <div class="lane-directions"><label v-for="(lane,i) in bore.lanes" :key="lane.id">车道 {{i+1}}<el-select :model-value="lane.direction" @change="direction(lane,$event)"><el-option :value="1" label="正向行驶" /><el-option :value="-1" label="反向行驶" /></el-select></label></div>
    <el-button type="danger" plain @click="emit('remove')">删除此洞筒及关联设备</el-button>
  </fieldset>
</template>
