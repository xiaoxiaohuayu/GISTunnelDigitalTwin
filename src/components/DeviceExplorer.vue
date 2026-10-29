<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { deviceTelemetry } from '../engines/deviceTelemetry'
import { searchDevices } from '../engines/deviceSearch'
import { categoryNames, deviceCatalog } from '../engines/tunnelSystemsState'
import type { DeviceKind, SceneDevice, SystemsState } from '../engines/tunnelSystemsState'
const props=defineProps<{devices:SceneDevice[];state:SystemsState;length:number}>()
const emit=defineEmits<{focus:[id:string]}>()
const search=shallowRef(''),selected=shallowRef<DeviceKind>('lane'),index=shallowRef(0)
const tube=shallowRef<'all'|'0'|'1'>('all'),abnormalOnly=shallowRef(false),limit=shallowRef(30)
const filtering=computed(()=>!!search.value.trim()||tube.value!=='all'||abnormalOnly.value)
const results=computed(()=>searchDevices(props.devices,props.state,props.length,search.value,tube.value,abnormalOnly.value))
const visibleResults=computed(()=>results.value.slice(0,limit.value))
const matching=computed(()=>props.devices.filter(d=>d.kind===selected.value))
const current=computed(()=>matching.value[index.value%Math.max(1,matching.value.length)])
const groups=computed(()=>Object.entries(categoryNames).map(([key,name])=>({name,items:deviceCatalog.filter(d=>d[0]===key&&d[2].toLowerCase().includes(search.value.toLowerCase()))})).filter(g=>g.items.length))
function select(kind:DeviceKind):void {selected.value=kind;index.value=0;if(current.value)emit('focus',current.value.id)}
function next():void {index.value=(index.value+1)%Math.max(1,matching.value.length);if(current.value)emit('focus',current.value.id)}
const status=computed(()=>current.value?`${deviceTelemetry(current.value,props.state,props.length).status} · ${deviceTelemetry(current.value,props.state,props.length).value}`:'未选择设备')
</script>
<template>
  <label class="search-label">查找设备或设施<input v-model="search" type="search" placeholder="编号、名称、桩号，如 fan-1 / K1+000" @input="limit=30"></label>
  <div class="device-filters">
    <label>方向<select v-model="tube" @change="limit=30"><option value="all">全部方向</option><option value="0">上行洞</option><option value="1">下行洞</option></select></label>
    <label class="abnormal-filter"><input v-model="abnormalOnly" type="checkbox" @change="limit=30">仅异常</label>
  </div>
  <div v-if="filtering" class="device-results">
    <p class="result-count" role="status">找到 {{results.length}} 处 · 点击定位</p>
    <button v-for="item in visibleResults" :key="item.device.id" :data-device-id="item.device.id" class="device-result" @click="emit('focus',item.device.id)">
      <span>{{item.name}}<small>{{item.device.id}}</small></span>
      <span class="result-address">{{item.address}}</span>
      <span class="result-reading" :class="item.reading.severity">{{item.reading.status}} · {{item.reading.value}}</span>
    </button>
    <p v-if="!results.length" class="panel-note">没有匹配的设备，请调整关键词或筛选条件</p>
    <button v-if="results.length>limit" class="more-results" @click="limit+=30">显示更多 · 剩余 {{results.length-limit}} 处</button>
  </div>
  <div v-else class="device-groups">
    <section v-for="group in groups" :key="group.name" class="device-group"><h3>{{group.name}}</h3>
      <button v-for="[,kind,name] in group.items" :key="kind" :aria-pressed="selected===kind" @click="select(kind)"><span>{{name}}</span><span class="device-count">{{devices.filter(d=>d.kind===kind).length}}</span></button>
    </section>
    <p v-if="!groups.length" class="panel-note">没有匹配的设备</p>
  </div>
  <div v-if="current&&!filtering" class="device-detail">
    <strong>{{deviceCatalog.find(d=>d[1]===selected)?.[2]}}</strong><span>{{current.tube===0?'上行洞':'下行洞'}} · {{Math.round(current.station)}} m · {{index+1}} / {{matching.length}}</span>
    <p>{{status}}</p><button @click="next">定位下一处 →</button>
  </div>
</template>

<style scoped>
.device-filters{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 17px 14px;font-size:11px;color:#bdcee7}.device-filters label{display:flex;align-items:center;gap:8px}.device-filters select{padding:6px;background:#132540;color:#edf4ff;border:1px solid #405776;border-radius:4px}.abnormal-filter input{accent-color:#8acaff}.device-results{padding:0 17px 18px}.result-count{margin:0 0 10px;font-size:11px;color:#adc3df}.device-result{display:flex;flex-direction:column;gap:7px;width:100%;padding:12px;text-align:left;margin-bottom:7px;background:#101f38}.device-result>span:first-child{display:flex;justify-content:space-between;gap:8px;font-size:12px}.device-result small{font-size:10px;color:#a9c4e4}.result-address,.result-reading{font-size:11px;color:#afc6df}.result-reading.alarm{color:#ff9b88}.result-reading.warning{color:#ffd294}.more-results{width:100%;padding:10px;font-size:11px}
</style>
