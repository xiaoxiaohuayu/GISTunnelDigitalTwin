<script setup lang="ts">
import { computed } from 'vue'
import { deviceAlarm, deviceEnabled, deviceEntrance, deviceLane } from '../engines/tunnelSystemsState'
import type { DeviceSettings, SceneDevice, SystemsState } from '../engines/tunnelSystemsState'
const props=defineProps<{device:SceneDevice;state:SystemsState;length:number}>()
const emit=defineEmits<{change:[patch:DeviceSettings]}>()
const enabled=computed(()=>deviceEnabled(props.device,props.state))
const lighting=computed(()=>props.device.kind==='basic'||props.device.kind==='enhanced')
const level=computed(()=>Math.round((props.state.devices[props.device.id]?.level??100)))
const controllable=computed(()=>['fan','pump','speaker','shutter','street','camera'].includes(props.device.kind))
function brightness(value:number|number[]):void{const next=Array.isArray(value)?value[0]??0:value;emit('change',{level:Math.max(0,Math.min(100,Math.round(next)))})}
const verb=computed(()=>props.device.kind==='shutter'?(enabled.value?'关闭本扇卷帘门':'开启本扇卷帘门'):props.device.kind==='fan'?(enabled.value?'停止本台风机':'启动本台风机'):(enabled.value?'关闭当前设备':'开启当前设备'))
const incident=computed(()=>props.state.incident!=='none'&&props.device.tube===props.state.incidentTube)
</script>
<template>
  <div class="individual-controls">
    <p class="field-help">仅控制 {{device.code??device.id}}</p>
    <template v-if="lighting"><label class="switch-row"><span>开关</span><el-switch :model-value="enabled" @change="emit('change',{enabled:Boolean($event)})" /></label><label>亮度 · {{level}}%<el-slider :model-value="level" :min="0" :max="100" :step="1" :disabled="!enabled" :show-tooltip="false" @input="brightness" /></label><p class="field-help">只改变这一盏灯。关掉之后，亮度数值会保留。</p></template>
    <el-button v-else-if="controllable" :type="enabled?'primary':'default'" @click="emit('change',{enabled:!enabled})">{{verb}}</el-button>
    <label v-if="device.kind==='signal'">当前信号<el-select :model-value="deviceEntrance(device,state)" :disabled="incident" @change="emit('change',{entrance:$event})"><el-option value="green" label="绿灯 · 通行" /><el-option value="yellow" label="黄灯 · 注意" /><el-option value="red" label="红灯 · 停止" /></el-select></label>
    <label v-if="device.kind==='lane'">当前车道指示<el-select :model-value="deviceLane(device,length,state)" :disabled="incident" @change="emit('change',{lane:$event})"><el-option value="down" label="向下 · 通行" /><el-option value="left" label="向左 · 疏散" /><el-option value="cross" label="红叉 · 禁止通行" /></el-select></label>
    <label v-if="['fan','camera','covi'].includes(device.kind)">本设备异常演示<el-select :model-value="deviceAlarm(device.id,state)" @change="emit('change',{alarm:$event})"><el-option value="none" label="正常" /><el-option :value="device.kind==='covi'?'environment':device.kind" :label="device.kind==='fan'?'风机故障':device.kind==='camera'?'通信离线':'CO 浓度超限'" /></el-select></label>
    <p v-if="incident&&['lane','signal'].includes(device.kind)" class="field-help">演练临时接管此设备指示，解除后恢复该设备设置。</p>
  </div>
</template>
<style scoped>
.individual-controls {margin-top:12px;display:flex;flex-direction:column;gap:12px}
.individual-controls label {display:flex;flex-direction:column;gap:8px;color:#c4d5ef;font-size:12px}
.individual-controls .switch-row {flex-direction:row;align-items:center;justify-content:space-between}
.individual-controls .el-button {width:100%}
</style>
