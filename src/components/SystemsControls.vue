<script setup lang="ts">
import { computed } from 'vue'
import VmsEditor from './VmsEditor.vue'
import DeviceControls from './DeviceControls.vue'
import { incidentCatalog, incidentDefinition, deviceCatalog } from '../engines/tunnelSystemsState'
import type { DeviceSettings, SceneDevice, SystemsState } from '../engines/tunnelSystemsState'
import type { AuditEntry } from '../services'
const props=defineProps<{state:SystemsState;devices:SceneDevice[];deviceId:string;length:number;boreNames?:string[];auditEntries?:AuditEntry[];controlBusy?:boolean}>()
const emit=defineEmits<{change:[patch:Partial<SystemsState>];locateIncident:[];locateDevice:[id:string];selectDevice:[id:string];deviceChange:[id:string,patch:DeviceSettings]}>()
const selected=computed(()=>props.devices.find(d=>d.id===props.deviceId)??props.devices.find(d=>d.kind==='vms')??props.devices[0])
const matching=computed(()=>props.devices.filter(d=>d.kind===selected.value?.kind))
function kind(value:string):void{const device=props.devices.find(d=>d.kind===value);if(device)emit('selectDevice',device.id)}
function place(device:SceneDevice):string{return `${device.code??device.id} · ${device.boreName??(device.portalEnd===undefined?(device.tube===0?'上行洞':'下行洞'):(device.portalEnd===0?'西洞口':'东洞口'))} · ${Math.round(device.station)} m`}
function clock(time:number):string{return new Date(time).toLocaleTimeString('zh-CN',{hour12:false})}
const statusText:Record<AuditEntry['status'],string>={applied:'已生效',queued:'已下发',rejected:'被拒绝',error:'失败'}
</script>
<template>
  <div class="systems-form">
    <p class="panel-note">{{controlBusy?'正在下发控制指令…':'支持本地演示与实时网关切换 · 高危指令需二次确认'}}</p>
    <fieldset><legend>环境与照明策略</legend>
      <label>环境<el-select :model-value="state.environment" :disabled="controlBusy" @change="emit('change',{environment:$event})"><el-option value="day" label="白天" /><el-option value="night" label="夜间" /><el-option value="fog" label="雾天" /></el-select></label>
      <label>照明默认策略<el-select :model-value="state.plc" :disabled="controlBusy" @change="emit('change',{plc:$event})"><el-option value="auto" label="PLC 自动策略" /><el-option value="manual" label="手动" /></el-select></label>
      <p class="field-help">自动策略仅作用于尚未单独设置的灯具，单设备设置保持独立。</p>
    </fieldset>
    <fieldset><legend>单设备控制</legend>
      <label>设备类型<el-select :model-value="selected?.kind" @change="kind"><el-option v-for="[,kind,name] in deviceCatalog" :key="kind" :label="name" :value="kind" /></el-select></label>
      <label>设备编号<el-select :model-value="selected?.id" @change="emit('selectDevice',$event)"><el-option v-for="device in matching" :key="device.id" :label="place(device)" :value="device.id" /></el-select></label>
      <el-button v-if="selected" @click="emit('locateDevice',selected.id)">定位当前设备</el-button>
      <template v-if="selected"><VmsEditor v-if="selected.kind==='vms'" :key="selected.id" :device="selected" :state="state" @change="emit('deviceChange',selected!.id,$event)" /><DeviceControls v-else :device="selected" :state="state" :length="length" @change="emit('deviceChange',selected!.id,$event)" /></template>
    </fieldset>
    <fieldset><legend>交通与事故联动</legend>
      <label>事发洞筒<el-select :model-value="state.incidentTube" :disabled="controlBusy" @change="emit('change',{incidentTube:$event})"><el-option v-for="(name,i) in boreNames??['上行洞 · 向东行驶','下行洞 · 向西行驶']" :key="i" :label="name" :value="i" /></el-select></label>
      <label>演示场景<el-select :model-value="state.incident" :disabled="controlBusy" @change="emit('change',{incident:$event})"><el-option value="none" label="正常通行" /><el-option v-for="item in incidentCatalog" :key="item.kind" :label="item.name" :value="item.kind" /></el-select></label>
      <p v-if="state.incident!=='none'" class="incident-note" role="status">{{incidentDefinition(state.incident)?.detail}}。此处为本地演练。</p>
      <el-button v-if="state.incident!=='none'" type="warning" plain @click="emit('locateIncident')">查看事发位置</el-button>
    </fieldset>
    <details v-if="auditEntries?.length" class="audit-history">
      <summary>操作审计记录 · {{auditEntries.length}}</summary>
      <ol>
        <li v-for="entry in auditEntries" :key="entry.id">
          <div><strong>{{entry.target}}</strong><span :class="`audit-${entry.status}`">{{statusText[entry.status]}}</span></div>
          <p><time>{{clock(entry.timestamp)}}</time> · {{entry.action}}</p>
          <p v-if="entry.message" class="audit-message">{{entry.message}}</p>
        </li>
      </ol>
    </details>
  </div>
</template>
<style scoped>
.audit-history{margin-top:12px;padding-top:12px;border-top:1px solid #2d4168;font-size:11px;color:#c4d6ed}
.audit-history summary{cursor:pointer;padding:4px 0}
.audit-history ol{list-style:none;margin:8px 0 0;padding:0;max-height:220px;overflow:auto}
.audit-history li{padding:8px 0;border-bottom:1px solid #223653}
.audit-history li>div{display:flex;justify-content:space-between;gap:8px;align-items:center}
.audit-history strong{font-size:11px;font-weight:500}
.audit-history p{margin:4px 0 0;font-size:10px;color:#a8bcda;line-height:1.5}
.audit-applied,.audit-queued{color:#86d3bb;font-size:10px}
.audit-rejected,.audit-error{color:#ff9b88;font-size:10px}
.audit-message{color:#ffb7a1!important}
</style>
