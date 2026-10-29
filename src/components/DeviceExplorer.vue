<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { deviceTelemetry } from '../engines/deviceTelemetry'
import { categoryNames, deviceCatalog } from '../engines/tunnelSystemsState'
import type { DeviceKind, SceneDevice, SystemsState } from '../engines/tunnelSystemsState'
const props=defineProps<{devices:SceneDevice[];state:SystemsState;length:number}>()
const emit=defineEmits<{focus:[id:string]}>()
const search=shallowRef(''),selected=shallowRef<DeviceKind>('lane'),index=shallowRef(0)
const matching=computed(()=>props.devices.filter(d=>d.kind===selected.value))
const current=computed(()=>matching.value[index.value%Math.max(1,matching.value.length)])
const groups=computed(()=>Object.entries(categoryNames).map(([key,name])=>({name,items:deviceCatalog.filter(d=>d[0]===key&&d[2].toLowerCase().includes(search.value.toLowerCase()))})).filter(g=>g.items.length))
function select(kind:DeviceKind):void {selected.value=kind;index.value=0;if(current.value)emit('focus',current.value.id)}
function next():void {index.value=(index.value+1)%Math.max(1,matching.value.length);if(current.value)emit('focus',current.value.id)}
const status=computed(()=>current.value?`${deviceTelemetry(current.value,props.state,props.length).status} · ${deviceTelemetry(current.value,props.state,props.length).value}`:'未选择设备')
</script>
<template>
  <label class="search-label">查找设备或设施<input v-model="search" type="search" placeholder="例如：车道、风机、横洞"></label>
  <div class="device-groups">
    <section v-for="group in groups" :key="group.name" class="device-group"><h3>{{group.name}}</h3>
      <button v-for="[,kind,name] in group.items" :key="kind" :aria-pressed="selected===kind" @click="select(kind)"><span>{{name}}</span><span class="device-count">{{devices.filter(d=>d.kind===kind).length}}</span></button>
    </section>
    <p v-if="!groups.length" class="panel-note">没有匹配的设备</p>
  </div>
  <div v-if="current" class="device-detail">
    <strong>{{deviceCatalog.find(d=>d[1]===selected)?.[2]}}</strong><span>{{current.tube===0?'上行洞':'下行洞'}} · {{Math.round(current.station)}} m · {{index+1}} / {{matching.length}}</span>
    <p>{{status}}</p><button @click="next">定位下一处 →</button>
  </div>
</template>
