<script setup lang="ts">
import { computed } from 'vue'
import VmsEditor from './VmsEditor.vue'
import DeviceControls from './DeviceControls.vue'
import { incidentCatalog, incidentDefinition, deviceCatalog } from '../engines/tunnelSystemsState'
import type { DeviceSettings, SceneDevice, SystemsState } from '../engines/tunnelSystemsState'
const props=defineProps<{state:SystemsState;devices:SceneDevice[];deviceId:string;length:number;boreNames?:string[]}>()
const emit=defineEmits<{change:[patch:Partial<SystemsState>];locateIncident:[];locateDevice:[id:string];selectDevice:[id:string];deviceChange:[id:string,patch:DeviceSettings]}>()
const selected=computed(()=>props.devices.find(d=>d.id===props.deviceId)??props.devices.find(d=>d.kind==='vms')??props.devices[0])
const matching=computed(()=>props.devices.filter(d=>d.kind===selected.value?.kind))
function kind(value:string):void{const device=props.devices.find(d=>d.kind===value);if(device)emit('selectDevice',device.id)}
function place(device:SceneDevice):string{return `${device.code??device.id} · ${device.boreName??(device.portalEnd===undefined?(device.tube===0?'上行洞':'下行洞'):(device.portalEnd===0?'西洞口':'东洞口'))} · ${Math.round(device.station)} m`}
</script>
<template>
  <div class="systems-form">
    <p class="panel-note">本地场景演示 · 控制仅作用于当前页面</p>
    <fieldset><legend>环境与照明策略</legend>
      <label>环境<el-select :model-value="state.environment" @change="emit('change',{environment:$event})"><el-option value="day" label="白天" /><el-option value="night" label="夜间" /><el-option value="fog" label="雾天" /></el-select></label>
      <label>照明默认策略<el-select :model-value="state.plc" @change="emit('change',{plc:$event})"><el-option value="auto" label="PLC 自动策略" /><el-option value="manual" label="手动" /></el-select></label>
      <p class="field-help">自动策略仅作用于尚未单独设置的灯具，单设备设置保持独立。</p>
    </fieldset>
    <fieldset><legend>单设备控制</legend>
      <label>设备类型<el-select :model-value="selected?.kind" @change="kind"><el-option v-for="[,kind,name] in deviceCatalog" :key="kind" :label="name" :value="kind" /></el-select></label>
      <label>设备编号<el-select :model-value="selected?.id" @change="emit('selectDevice',$event)"><el-option v-for="device in matching" :key="device.id" :label="place(device)" :value="device.id" /></el-select></label>
      <el-button v-if="selected" @click="emit('locateDevice',selected.id)">定位当前设备</el-button>
      <template v-if="selected"><VmsEditor v-if="selected.kind==='vms'" :key="selected.id" :device="selected" :state="state" @change="emit('deviceChange',selected!.id,$event)" /><DeviceControls v-else :device="selected" :state="state" :length="length" @change="emit('deviceChange',selected!.id,$event)" /></template>
    </fieldset>
    <fieldset><legend>交通与事故联动</legend>
      <label>事发洞筒<el-select :model-value="state.incidentTube" @change="emit('change',{incidentTube:$event})"><el-option v-for="(name,i) in boreNames??['上行洞 · 向东行驶','下行洞 · 向西行驶']" :key="i" :label="name" :value="i" /></el-select></label>
      <label>演示场景<el-select :model-value="state.incident" @change="emit('change',{incident:$event})"><el-option value="none" label="正常通行" /><el-option v-for="item in incidentCatalog" :key="item.kind" :label="item.name" :value="item.kind" /></el-select></label>
      <p v-if="state.incident!=='none'" class="incident-note" role="status">{{incidentDefinition(state.incident)?.detail}}。此处为本地演练。</p>
      <el-button v-if="state.incident!=='none'" type="warning" plain @click="emit('locateIncident')">查看事发位置</el-button>
    </fieldset>
    <p class="panel-note">传感器已布设模型，监测读数与真实控制协议尚未接入。</p>
  </div>
</template>
