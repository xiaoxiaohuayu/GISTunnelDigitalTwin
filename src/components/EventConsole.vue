<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { deviceAlarm, deviceAlarmIds, changeDevice, incidentCatalog, incidentDefinition } from '../engines/tunnelSystemsState'
import type { IncidentKind, SystemsState } from '../engines/tunnelSystemsState'
import { alarmScenarios } from '../engines/deviceTelemetry'
import IncidentImpact from './IncidentImpact.vue'
import type { SceneDevice } from '../engines/tunnelSystemsState'
import { updateDrillHistory } from '../engines/drillHistory'
import type { DrillRecord } from '../engines/drillHistory'
const props=defineProps<{state:SystemsState;ready:boolean;open:boolean;devices:SceneDevice[];length:number}>()
const emit=defineEmits<{close:[];change:[patch:Partial<SystemsState>];locateIncident:[];locateDevice:[id:string]}>()
const tab=shallowRef<'traffic'|'devices'>('traffic')
const records=shallowRef<DrillRecord[]>([])
const entries=computed(()=>[
  ...(props.state.incident!=='none'?[{key:`incident:${props.state.incident}:${props.state.incidentTube}`,name:incidentDefinition(props.state.incident)?.name??'',detail:incidentDefinition(props.state.incident)?.detail??''}]:[]),
  ...deviceAlarmIds(props.state).map(id=>{const scenario=alarmScenarios.find(item=>item.mode===deviceAlarm(id,props.state));return {key:id,name:`${id} · ${scenario?.title??'设备异常'}`,detail:scenario?.detail??''}}),
])
const active=computed(()=>entries.value[0])
const signature=computed(()=>entries.value.map(entry=>entry.key+entry.name).join('|'))
watch(signature,()=>{records.value=updateDrillHistory(records.value,entries.value,Date.now())})
function clock(time:number):string{return new Date(time).toLocaleTimeString('zh-CN',{hour12:false})}
function recover(key:string):void {
  if(key.startsWith('incident:'))emit('change',{incident:'none'})
  else emit('change',{devices:changeDevice(props.state,key,{alarm:'none'}).devices})
}
function locateEntry(key:string):void{if(key.startsWith('incident:'))emit('locateIncident');else emit('locateDevice',key)}
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
      <div v-if="active" class="drill-active-list">
        <article v-for="entry in entries" :key="entry.key" class="drill-entry">
          <h3>{{entry.name}}</h3><p>{{entry.detail}}</p>
          <div class="drill-entry-actions"><button @click="locateEntry(entry.key)">定位</button><button @click="recover(entry.key)">{{entry.key.startsWith('incident:')?'解除交通事件':'恢复此设备'}}</button></div>
        </article>
      </div>
      <p v-else class="alarm-empty">当前无演练事件</p>
      <div v-if="active" class="event-actions"><button @click="locate">定位事件</button><button @click="resolve">解除全部演练</button></div>
      <IncidentImpact :devices="devices" :state="state" :length="length" @locate="emit('locateDevice',$event)" />
      <details v-if="records.length" class="drill-history"><summary>本次演练记录 · {{records.length}}</summary><ol><li v-for="record in records" :key="record.id"><strong>{{record.name}}</strong><span>{{record.endedAt===undefined?'演练中':'已解除'}}</span><p><time>{{clock(record.startedAt)}}</time> 触发<template v-if="record.endedAt!==undefined"> · <time>{{clock(record.endedAt)}}</time> 解除 · 持续 {{Math.max(1,Math.round((record.endedAt-record.startedAt)/1000))}} 秒</template></p></li></ol></details>
      <small>仅本地模拟，未连接现场设备</small>
    </div>
  </aside>
</template>

<style scoped>
.drill-active-list{margin-top:16px;border-top:1px solid #344b6c}.drill-entry{padding:14px 0;border-bottom:1px solid #2b3f60}.drill-entry h3{font-size:12px;color:#ffbd9f;font-weight:500;margin:0 0 7px}.drill-entry p{font-size:11px;color:#c4d3e5;line-height:1.6;margin:0 0 10px}.drill-entry-actions{display:flex;gap:8px}.drill-entry-actions button{min-height:32px;padding:6px 12px;font-size:11px}.drill-history{margin-top:18px;padding-top:12px;border-top:1px solid #344b6c;font-size:11px;color:#c4d6ed}.drill-history summary{cursor:pointer;padding:6px 0}.drill-history ol{list-style:none;margin:8px 0 0;padding:0}.drill-history li{padding:12px 0;border-bottom:1px solid #2b3f60}.drill-history strong{font-size:11px;font-weight:500}.drill-history li>span{float:right;color:#a8d8c7;font-size:10px}.drill-history p{font-size:10px;color:#b2c8e2;line-height:1.7;margin:7px 0 0;font-variant-numeric:tabular-nums}
</style>
