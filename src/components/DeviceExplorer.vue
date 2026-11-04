<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { deviceTelemetry } from '../engines/deviceTelemetry'
import { searchDevices } from '../engines/deviceSearch'
import { categoryNames, deviceCatalog } from '../engines/tunnelSystemsState'
import type { DeviceKind, SceneDevice, SystemsState } from '../engines/tunnelSystemsState'
const props=defineProps<{devices:SceneDevice[];state:SystemsState;length:number;boreNames?:string[]}>()
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
  <label class="search-label">查找设备或设施<el-input v-model="search" clearable placeholder="编号、名称、桩号，如 fan-1 / K1+000" @input="limit=30" /></label>
  <div class="device-filters">
    <label>洞筒<el-select v-model="tube" @change="limit=30"><el-option value="all" label="全部洞筒" /><el-option v-for="(name,i) in boreNames??['上行洞','下行洞']" :key="i" :label="name" :value="String(i)" /></el-select></label>
    <el-checkbox v-model="abnormalOnly" @change="limit=30">仅异常</el-checkbox>
  </div>
  <div v-if="filtering" class="device-results">
    <p class="result-count" role="status">找到 {{results.length}} 处 · 点击定位</p>
    <el-button v-for="item in visibleResults" :key="item.device.id" :data-device-id="item.device.id" class="device-result" @click="emit('focus',item.device.id)">
      <span>{{item.name}}<small>{{item.device.code??item.device.id}}</small></span>
      <span class="result-address">{{item.address}}</span>
      <span class="result-reading" :class="item.reading.severity">{{item.reading.status}} · {{item.reading.value}}</span>
    </el-button>
    <p v-if="!results.length" class="panel-note">没有匹配的设备，请调整关键词或筛选条件</p>
    <el-button v-if="results.length>limit" class="more-results" @click="limit+=30">显示更多 · 剩余 {{results.length-limit}} 处</el-button>
  </div>
  <div v-else class="device-groups">
    <section v-for="group in groups" :key="group.name" class="device-group"><h3>{{group.name}}</h3>
      <el-button v-for="[,kind,name] in group.items" :key="kind" class="device-kind" :type="selected===kind?'primary':'default'" :plain="selected!==kind" @click="select(kind)"><span>{{name}}</span><span class="device-count">{{devices.filter(d=>d.kind===kind).length}}</span></el-button>
    </section>
    <p v-if="!groups.length" class="panel-note">没有匹配的设备</p>
  </div>
  <div v-if="current&&!filtering" class="device-detail">
    <strong>{{deviceCatalog.find(d=>d[1]===selected)?.[2]}}</strong><span>{{current.tube===0?'上行洞':'下行洞'}} · {{Math.round(current.station)}} m · {{index+1}} / {{matching.length}}</span>
    <p>{{status}}</p><el-button type="primary" plain @click="next">定位下一处 →</el-button>
  </div>
</template>

<style scoped>
.device-filters{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 17px 14px;font-size:11px;color:#bdcee7}.device-filters label{display:flex;align-items:center;gap:8px;min-width:0;flex:1}.device-results{padding:0 17px 18px}.result-count{margin:0 0 10px;font-size:11px;color:#adc3df}.device-result{margin-bottom:7px}.device-result :deep(> span){display:flex;flex-direction:column;align-items:flex-start;gap:7px;width:100%}.device-result :deep(> span > span:first-child){display:flex;flex-direction:row;justify-content:space-between;width:100%;font-size:12px}.device-result small{font-size:10px;color:#a9c4e4}.result-address,.result-reading{font-size:11px;color:#afc6df}.result-reading.alarm{color:#ff9b88}.result-reading.warning{color:#ffd294}.search-label{display:block;padding:0 17px 12px;font-size:12px;color:#c4d5ef}.device-groups{padding:0 17px 12px}.device-group h3{margin:14px 0 8px;font-size:12px;color:#c4d5ef;font-weight:500}.device-kind{width:100%;margin:0 0 6px;justify-content:space-between}.device-detail{padding:14px 17px 18px;border-top:1px solid #2d4168;font-size:12px;color:#c4d5ef}.device-detail p{margin:8px 0}
</style>
