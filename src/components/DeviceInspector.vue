<script setup lang="ts">
import DeviceControls from './DeviceControls.vue'
import { computed } from 'vue'
import type { SceneDevice, SystemsState, DeviceSettings } from '../engines/tunnelSystemsState'
import { deviceName, deviceTelemetry } from '../engines/deviceTelemetry'
const props = defineProps<{ device: SceneDevice; state: SystemsState;index:number;total:number;length:number;returnLabel?:string }>()
defineEmits<{ close: []; back:[]; locate: [id: string]; change:[patch:DeviceSettings]; camera:[id:string];next:[direction:number];editVms:[] }>()
const reading = computed(() => deviceTelemetry(props.device, props.state, props.length))

</script>
<template>
  <aside class="device-inspector" :class="reading.severity" aria-label="设备详情">
    <header class="inspector-header"><h2>设备详情</h2><button class="inspector-close" aria-label="关闭设备详情" @click="$emit('close')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></header>
    <div class="inspector-content">
      <button v-if="returnLabel" class="inspector-back" @click="$emit('back')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>{{returnLabel}}</button>
      <div class="device-stepper"><button :disabled="total<2" @click="$emit('next',-1)">上一个</button><span>{{index+1}} / {{total}}</span><button :disabled="total<2" @click="$emit('next',1)">下一个</button></div>
      <div :key="device.id" class="device-body">
      <h3 class="device-title">{{ deviceName(device) }}</h3>
      <p class="device-address">{{device.portalEnd===undefined?(device.tube===0?'上行洞':'下行洞'):(device.portalEnd===0?'西洞口':'东洞口')}} · 距基点 {{ Math.round(device.station) }} m</p>
      <div class="device-state"><span class="state-caption">运行状态</span><span class="state-badge" :class="reading.severity"><i aria-hidden="true" />{{reading.status}}</span></div>
      <div class="device-reading"><span class="reading-caption">当前数值</span><strong :key="`${device.id}:${reading.value}`" class="reading-value">{{reading.value}}</strong><span class="reading-source">模拟数据 · 本地演示</span></div>
      <dl class="device-facts"><div><dt>设备编号</dt><dd>{{device.id}}</dd></div><div><dt>所属方向</dt><dd>{{device.tube===0?'上行洞':'下行洞'}}</dd></div><div><dt>沿线位置</dt><dd>{{Math.round(device.station)}} m</dd></div></dl>
      <p class="reading-note" :class="reading.severity" role="status">{{reading.note}}</p>
      <div class="inspector-actions">
        <button class="locate-device primary-locate" @click="$emit('locate', device.id)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>定位到设备</button>
        <button v-if="device.kind==='vms'" class="locate-device" @click="$emit('editVms')">编辑情报板内容与尺寸</button>
        <button v-if="device.kind==='camera'" class="locate-device" :disabled="reading.status==='通信离线'||reading.status==='关闭'" @click="$emit('camera',device.id)">预览三维监控视角</button>
        <DeviceControls :device="device" :state="state" :length="length" @change="$emit('change',$event)" />
      </div>
      </div>
    </div>
  </aside>
</template>
<style scoped>
.inspector-back{display:flex;align-items:center;gap:5px;padding:6px 0;margin:0 0 14px;border:0;background:transparent;font-size:12px;color:#a8d5fa}.inspector-back svg{width:16px;height:16px}.inspector-back:hover{color:#fff;background:transparent}
.device-inspector{--device-accent:#92d1ff;z-index:4;width:360px;top:var(--device-panel-top,72px);max-height:calc(100% - var(--device-panel-top,72px) - 142px);border:0;border-radius:12px;background:#101e32;box-shadow:0 18px 48px #02081266;scrollbar-width:thin;scrollbar-color:#526e8d transparent;animation:inspector-arrive .45s cubic-bezier(.16,1,.3,1)}
.device-inspector.alarm{--device-accent:#ffb7a1}.device-inspector.warning{--device-accent:#ffda9a}.device-inspector::before{z-index:2;content:'';position:absolute;top:0;left:22px;right:22px;height:1px;background:linear-gradient(90deg,transparent,var(--device-accent),transparent);box-shadow:0 1px 10px #8acaff33;pointer-events:none}
.inspector-header{padding:14px 20px;background:#14243b;border-bottom:1px solid #c7e0ff12}.inspector-header h2{font-size:13px;font-weight:500;letter-spacing:0;color:#c2d5ec}.inspector-close{display:grid;place-items:center;border:0;width:30px;height:30px;color:#b6cce4}.inspector-close svg{width:19px;height:19px}
.device-body{animation:device-switch .32s cubic-bezier(.16,1,.3,1)}
.inspector-content{padding:18px 22px 22px}.device-stepper{margin-bottom:23px}.device-stepper button{padding:7px 9px;font-size:11px;background:transparent;border-color:#a5c9ff26}.device-stepper span{color:#b2c6e0}.device-title{margin:0 0 8px;font-size:22px;line-height:1.45;font-weight:600;letter-spacing:.02em;color:#f1f7ff;overflow-wrap:anywhere}.device-address{margin:0 0 24px;font-size:12px;line-height:1.6;color:#b1c7e0}
.device-state{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:22px}.state-caption,.reading-caption{font-size:12px;color:#b1c7e0}.state-badge{display:inline-flex;align-items:center;gap:7px;border-radius:20px;padding:5px 10px;background:#6dceac0f;font-size:12px;line-height:1.5;color:#a3e2ca}.state-badge i{width:5px;height:5px;background:currentColor;border-radius:50%}.state-badge.alarm{background:#ff9b8812;color:#ffb7a1}.state-badge.warning{background:#ffc98212;color:#ffda9a}
.device-reading{padding:21px 0;border-block:1px solid #c7e0ff18}.reading-value{display:block;margin:12px 0;font-weight:500;font-size:clamp(24px,2vw,30px);line-height:1.35;font-variant-numeric:tabular-nums;color:#f1f7ff;overflow-wrap:anywhere;animation:reading-update .55s ease-out}.reading-source{display:flex;align-items:center;gap:6px;font-size:10px;color:#b1c7e0}.reading-source::before{content:'';width:4px;height:4px;border:1px solid #92d1ff;border-radius:50%}
.device-facts{margin:20px 0 0}.device-facts>div{display:flex;justify-content:space-between;gap:16px;margin:12px 0;font-size:12px;line-height:1.5}.device-facts dt{color:#b1c7e0}.device-facts dd{margin:0;color:#e1edfc;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;text-align:right}.reading-note{margin:20px 0;font-size:11px;line-height:1.7;color:#b1c7e0}.reading-note.alarm{color:#ffb7a1}.reading-note.warning{color:#ffda9a}
.inspector-actions{border-top:1px solid #c7e0ff18;padding-top:15px}.locate-device{display:flex;align-items:center;justify-content:center;gap:9px;min-height:40px;margin:8px 0 0;padding:10px 12px;background:#192d48;border-color:#a5c9ff26;font-size:12px;transition:background .18s,border-color .18s}.locate-device svg{width:17px;height:17px}.primary-locate{background:#24486b;color:#e8f6ff;border-color:#8acaff44}.primary-locate:hover{background:#2c587f!important;border-color:#92d1ff!important}.control-caption{font-size:10px;line-height:1.7;color:#b1c7e0;margin:20px 0 0}.local-control{background:transparent}
@keyframes device-switch{from{opacity:.55;transform:translateX(8px)}to{opacity:1;transform:translateX(0)}}
@keyframes inspector-arrive{from{transform:translateX(14px);filter:brightness(1.12)}to{transform:translateX(0);filter:brightness(1)}}@keyframes reading-update{from{color:var(--device-accent)}to{color:#f1f7ff}}
@media(max-width:760px){.device-inspector{top:var(--device-panel-top,94px);width:min(360px,calc(100% - 20px));max-height:calc(100% - var(--device-panel-top,94px) - 165px)}.inspector-content{padding:15px 18px 18px}.device-title{font-size:19px}.device-stepper{margin-bottom:18px}.device-address{margin-bottom:18px}.device-state{margin-bottom:18px}.device-reading{padding:16px 0}.device-facts>div{margin:10px 0}}
@media(prefers-reduced-motion:reduce){.device-inspector,.device-body,.reading-value{animation:none}.locate-device{transition:none}}
</style>
