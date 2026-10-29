<script setup lang="ts">
import { computed } from 'vue'
import { incidentImpact } from '../engines/incidentImpact'
import { deviceCatalog } from '../engines/tunnelSystemsState'
import type { SceneDevice, SystemsState } from '../engines/tunnelSystemsState'
const props=defineProps<{devices:SceneDevice[];state:SystemsState;length:number}>()
defineEmits<{locate:[id:string]}>()
const impact=computed(()=>incidentImpact(props.devices,props.state,props.length))
const groups=computed(()=>[0,1].flatMap(tube=>deviceCatalog.flatMap(([,kind,name])=>{
  const items=impact.value.filter(item=>item.device.tube===tube&&item.device.kind===kind)
  return items.length?[{key:`${tube}-${kind}`,name:`${items[0]!.device.boreName??(tube===0?'上行洞':'下行洞')} · ${name}`,items}]:[]
})))
</script>

<template>
  <section v-if="state.incident!=='none'" class="incident-impact" aria-label="演练联动清单">
    <h3>联动与监测反馈 <span>{{impact.length}} 处</span></h3>
    <p class="impact-note">按设备当前状态计算，展开可查看解除演练后的反馈。</p>
    <details v-for="group in groups" :key="group.key" class="impact-group">
      <summary>{{group.name}}<span>{{group.items.length}} 处</span></summary>
      <div v-for="item in group.items" :key="item.device.id" class="impact-item">
        <button class="impact-locate" @click="$emit('locate',item.device.id)">{{item.name}} · 定位</button>
        <span class="impact-active">当前：{{item.active.status}} · {{item.active.value}}</span>
        <span>解除后：{{item.restored.status}} · {{item.restored.value}}</span>
      </div>
    </details>
    <p v-if="!impact.length" class="impact-note">当前事件未改变设备反馈。</p>
    <p class="impact-note">解除后退出事件策略，保留单设备手动设置。读数均为本地演示。</p>
  </section>
</template>

<style scoped>
.incident-impact{border-top:1px solid #344b6c;margin-top:18px;padding-top:14px}.incident-impact h3{display:flex;align-items:center;justify-content:space-between;margin:0;font-size:13px;font-weight:500}.incident-impact h3 span{font-size:11px;color:#8acaff}.impact-note{font-size:10px;line-height:1.7;color:#b8cde5;margin:10px 0}.impact-group{border-bottom:1px solid #2b3f60}.impact-group summary{cursor:pointer;padding:11px 0;font-size:11px;color:#d1e2f5}.impact-group summary>span{float:right;color:#9fbedf}.impact-item{display:flex;flex-direction:column;gap:6px;padding:10px;background:#102039;margin-bottom:7px;font-size:10px;line-height:1.6;color:#abc2de;overflow-wrap:anywhere}.impact-locate{padding:0;border:0;background:transparent;text-align:left;color:#a7d7ff;font-size:11px}.impact-active{color:#e2d3bb}
</style>
