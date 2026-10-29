<script setup lang="ts">
import { computed } from 'vue'
import VmsEditor from './VmsEditor.vue'
import DeviceControls from './DeviceControls.vue'
import { incidentCatalog, incidentDefinition, deviceCatalog } from '../engines/tunnelSystemsState'
import type { DeviceSettings, SceneDevice, SystemsState } from '../engines/tunnelSystemsState'
const props=defineProps<{state:SystemsState;devices:SceneDevice[];deviceId:string;length:number}>()
const emit=defineEmits<{change:[patch:Partial<SystemsState>];locateIncident:[];locateDevice:[id:string];selectDevice:[id:string];deviceChange:[id:string,patch:DeviceSettings]}>()
const selected=computed(()=>props.devices.find(d=>d.id===props.deviceId)??props.devices.find(d=>d.kind==='vms'))
const matching=computed(()=>props.devices.filter(d=>d.kind===selected.value?.kind))
function kind(event:Event):void{const device=props.devices.find(d=>d.kind===value(event));if(device)emit('selectDevice',device.id)}
function value(event:Event):string{return (event.target as HTMLSelectElement).value}
</script>
<template>
  <div class="systems-form">
    <p class="panel-note">本地场景演示 · 控制仅作用于当前页面</p>
    <fieldset><legend>环境与照明策略</legend>
      <label>环境<select :value="state.environment" @change="emit('change',{environment:value($event) as SystemsState['environment']})"><option value="day">白天</option><option value="night">夜间</option><option value="fog">雾天</option></select></label>
      <label>照明默认策略<select :value="state.plc" @change="emit('change',{plc:value($event) as SystemsState['plc']})"><option value="auto">PLC 自动策略</option><option value="manual">手动</option></select></label>
      <p class="field-help">自动策略仅作用于尚未单独设置的灯具，单设备设置保持独立。</p>
    </fieldset>
    <fieldset><legend>单设备控制</legend>
      <label>设备类型<select :value="selected?.kind" @change="kind"><option v-for="[,kind,name] in deviceCatalog" :key="kind" :value="kind">{{name}}</option></select></label>
      <label>设备编号<select :value="selected?.id" @change="emit('selectDevice',value($event))"><option v-for="device in matching" :key="device.id" :value="device.id">{{device.id}} · {{device.portalEnd===undefined?(device.tube===0?'上行洞':'下行洞'):(device.portalEnd===0?'西洞口':'东洞口')}} · {{Math.round(device.station)}} m</option></select></label>
      <button v-if="selected" @click="emit('locateDevice',selected.id)">定位当前设备</button>
      <template v-if="selected"><VmsEditor v-if="selected.kind==='vms'" :key="selected.id" :device="selected" :state="state" @change="emit('deviceChange',selected!.id,$event)" /><DeviceControls v-else :device="selected" :state="state" :length="length" @change="emit('deviceChange',selected!.id,$event)" /></template>
    </fieldset>
    <fieldset><legend>交通与事故联动</legend>
      <label>事发隧道<select :value="state.incidentTube" @change="emit('change',{incidentTube:Number(value($event)) as 0|1})"><option :value="0">上行洞 · 向东行驶</option><option :value="1">下行洞 · 向西行驶</option></select></label>
      <label>演示场景<select :value="state.incident" @change="emit('change',{incident:value($event) as SystemsState['incident']})"><option value="none">正常通行</option><option v-for="item in incidentCatalog" :key="item.kind" :value="item.kind">{{item.name}}</option></select></label>
      <p v-if="state.incident!=='none'" class="incident-note" role="status">{{incidentDefinition(state.incident)?.detail}}。此处为本地演练。</p>
      <button v-if="state.incident!=='none'" class="incident-location" @click="emit('locateIncident')">查看事发位置</button>
    </fieldset>
    <p class="panel-note">传感器已布设模型，监测读数与真实控制协议尚未接入。</p>
  </div>
</template>
