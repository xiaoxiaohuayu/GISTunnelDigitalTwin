<script setup lang="ts">
import { computed } from 'vue'
import { deviceAlarm, deviceEnabled, deviceEntrance, deviceLane } from '../engines/tunnelSystemsState'
import type { DeviceSettings, SceneDevice, SystemsState } from '../engines/tunnelSystemsState'
const props=defineProps<{device:SceneDevice;state:SystemsState;length:number}>()
const emit=defineEmits<{change:[patch:DeviceSettings]}>()
const enabled=computed(()=>deviceEnabled(props.device,props.state))
const controllable=computed(()=>['fan','pump','speaker','shutter','basic','enhanced','street','camera'].includes(props.device.kind))
const verb=computed(()=>props.device.kind==='shutter'?(enabled.value?'关闭本扇卷帘门':'开启本扇卷帘门'):props.device.kind==='fan'?(enabled.value?'停止本台风机':'启动本台风机'):(enabled.value?'关闭当前设备':'开启当前设备'))
const incident=computed(()=>props.state.incident!=='none'&&props.device.tube===props.state.incidentTube)
</script>
<template>
  <div class="individual-controls">
    <p class="field-help">仅控制 {{device.code??device.id}}</p>
    <button v-if="controllable" class="locate-device" :aria-pressed="enabled" @click="emit('change',{enabled:!enabled})">{{verb}}</button>
    <label v-if="device.kind==='signal'">当前信号<select :value="deviceEntrance(device,state)" :disabled="incident" @change="emit('change',{entrance:($event.target as HTMLSelectElement).value as DeviceSettings['entrance']})"><option value="green">绿灯 · 通行</option><option value="yellow">黄灯 · 注意</option><option value="red">红灯 · 停止</option></select></label>
    <label v-if="device.kind==='lane'">当前车道指示<select :value="deviceLane(device,length,state)" :disabled="incident" @change="emit('change',{lane:($event.target as HTMLSelectElement).value as DeviceSettings['lane']})"><option value="down">向下 · 通行</option><option value="left">向左 · 疏散</option><option value="cross">红叉 · 禁止通行</option></select></label>
    <label v-if="['fan','camera','covi'].includes(device.kind)">本设备异常演示<select :value="deviceAlarm(device.id,state)" @change="emit('change',{alarm:($event.target as HTMLSelectElement).value as DeviceSettings['alarm']})"><option value="none">正常</option><option :value="device.kind==='covi'?'environment':device.kind">{{device.kind==='fan'?'风机故障':device.kind==='camera'?'通信离线':'CO 浓度超限'}}</option></select></label>
    <p v-if="incident&&['lane','signal'].includes(device.kind)" class="field-help">演练临时接管此设备指示，解除后恢复该设备设置。</p>
  </div>
</template>
<style scoped>
.individual-controls {margin-top:12px}
.individual-controls label {display:flex;flex-direction:column;gap:8px;color:#c4d5ef;font-size:12px}
.individual-controls select {min-height:36px;width:100%;padding:7px;background:#111f3c;color:#edf4ff;border:1px solid #3c5178;border-radius:4px}
.individual-controls button {width:100%;min-height:38px;padding:8px}
</style>
