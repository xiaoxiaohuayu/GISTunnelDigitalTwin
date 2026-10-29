<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { deviceAlarm, deviceAlarmIds, changeDevice, incidentCatalog, incidentDefinition } from '../engines/tunnelSystemsState'
import type { IncidentKind, SystemsState } from '../engines/tunnelSystemsState'
import { alarmScenarios } from '../engines/deviceTelemetry'
import IncidentImpact from './IncidentImpact.vue'
import type { SceneDevice } from '../engines/tunnelSystemsState'
const props=defineProps<{state:SystemsState;ready:boolean;open:boolean;devices:SceneDevice[];length:number}>()
const emit=defineEmits<{close:[];change:[patch:Partial<SystemsState>];locateIncident:[];locateDevice:[id:string]}>()
const tab=shallowRef<'traffic'|'devices'>('traffic')
const records=shallowRef<{id:number;name:string;time:string;resolved:boolean;key:string}[]>([])
let sequence=0
const entries=computed(()=>[
  ...(props.state.incident!=='none'?[{key:`incident:${props.state.incident}:${props.state.incidentTube}`,name:incidentDefinition(props.state.incident)?.name??'',detail:incidentDefinition(props.state.incident)?.detail??''}]:[]),
  ...deviceAlarmIds(props.state).map(id=>{const scenario=alarmScenarios.find(item=>item.mode===deviceAlarm(id,props.state));return {key:id,name:`${id} · ${scenario?.title??'设备异常'}`,detail:scenario?.detail??''}}),
])
const active=computed(()=>entries.value[0])
const signature=computed(()=>entries.value.map(entry=>entry.key+entry.name).join('|'))
watch(signature,()=>{
  const keys=new Set(entries.value.map(entry=>entry.key))
  records.value=records.value.map(record=>({...record,resolved:!keys.has(record.key)}))
  for(const entry of entries.value)if(!records.value.some(record=>record.key===entry.key&&!record.resolved))records.value=[{id:++sequence,key:entry.key,name:entry.name,time:new Date().toLocaleTimeString('zh-CN',{hour12:false}),resolved:false},...records.value].slice(0,8)
})
function incident(kind:IncidentKind):void{emit('change',{incident:kind});emit('locateIncident')}
function device(mode:SystemsState['deviceAlarm']):void {
  const scenario=alarmScenarios.find(item=>item.mode===mode);if(!scenario)return
  const on=deviceAlarm(scenario.id,props.state)==='none'
  const next=changeDevice(props.state,scenario.id,{alarm:on?mode:'none'})
  emit('change',{devices:next.devices});emit('locateDevice',scenario.id)
}
function resolve():void {
  let next=props.state
  for(const id of deviceAlarmIds(next))next=changeDevice(next,id,{alarm:'none'})
  emit('change',{incident:'none',deviceAlarm:'none',devices:next.devices})
}
function locate():void {
  if(props.state.incident!=='none')emit('locateIncident')
  else {const id=deviceAlarmIds(props.state)[0];if(id)emit('locateDevice',id)}
}

</script>
<template>
  <aside v-show="open" class="scene-panel event-drawer" aria-label="事件演练">
    <header><h2>事件演练</h2><button aria-label="关闭事件演练" @click="emit('close')">×</button></header>
    <div class="alarm-console-body">
      <div class="event-tabs" role="group" aria-label="事件类别"><button :aria-pressed="tab==='traffic'" @click="tab='traffic'">交通事件</button><button :aria-pressed="tab==='devices'" @click="tab='devices'">设备异常</button></div>
      <template v-if="tab==='traffic'">
        <label class="event-tube">事发方向<select :value="state.incidentTube" @change="emit('change',{incidentTube:Number(($event.target as HTMLSelectElement).value) as 0|1})"><option :value="0">上行洞</option><option :value="1">下行洞</option></select></label>
        <div class="event-grid"><button v-for="item in incidentCatalog" :key="item.kind" :disabled="!ready" :aria-pressed="state.incident===item.kind" @click="incident(item.kind)">{{item.name}}</button></div>
      </template>
      <div v-else class="alarm-options"><button v-for="scenario in alarmScenarios" :key="scenario.mode" :disabled="!ready" :aria-pressed="deviceAlarm(scenario.id,state)===scenario.mode" @click="device(scenario.mode)">{{scenario.title}}</button></div>
      <div v-if="active" class="active-alarm" role="status"><span class="alarm-pulse"/><div><strong>{{active.name}}</strong><span>{{active.detail}}</span></div></div>
      <p v-else class="alarm-empty">当前无演练事件</p>
      <div v-if="active" class="event-actions"><button @click="locate">定位事件</button><button @click="resolve">解除全部演练</button></div>
      <IncidentImpact :devices="devices" :state="state" :length="length" @locate="emit('locateDevice',$event)" />
      <details v-if="records.length" class="event-history"><summary>本次演练记录 · {{records.length}}</summary><ol><li v-for="record in records" :key="record.id"><time>{{record.time}}</time><span>{{record.name}}</span><small>{{record.resolved?'已解除':'演练中'}}</small></li></ol></details>
      <small>仅本地模拟，未连接现场设备</small>
    </div>
  </aside>
</template>
