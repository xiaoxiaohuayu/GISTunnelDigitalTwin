<script setup lang="ts">
import { computed, onMounted, onUnmounted, useTemplateRef, watch } from 'vue'
import { createVmsText, drawVmsPreview, vmsSize } from '../engines/vmsDisplay'
import type { VmsDisplay } from '../engines/vmsDisplay'
import { deviceVms, deviceMessage } from '../engines/tunnelSystemsState'
import type { SystemsState, SceneDevice, DeviceSettings } from '../engines/tunnelSystemsState'
const props=defineProps<{state:SystemsState;device:SceneDevice}>()
const emit=defineEmits<{change:[patch:DeviceSettings]}>()
const display=computed(()=>deviceVms(props.device,props.state))
const message=computed(()=>deviceMessage(props.device,props.state))
const size=computed(()=>vmsSize(display.value))
const preview=useTemplateRef<HTMLCanvasElement>('preview')
let texture:HTMLCanvasElement|undefined,started=0,timer=0
function patch(next:Partial<VmsDisplay>):void{emit('change',{vms:next})}
function value(event:Event):string{return (event.target as HTMLInputElement).value}
function number(event:Event,min:number,max:number):number{return Math.max(min,Math.min(max,Number(value(event))||min))}
function render():void{if(preview.value&&texture)drawVmsPreview(preview.value,texture,display.value,(performance.now()-started)/1000)}
function refresh():void{texture=createVmsText(message.value,display.value);started=performance.now();render()}
watch([()=>props.device.id,()=>JSON.stringify(display.value),()=>message.value],refresh,{flush:'post'})
onMounted(()=>{refresh();timer=window.setInterval(()=>{if(display.value.enabled&&display.value.scroll!=='none')render()},50)})
onUnmounted(()=>window.clearInterval(timer))
</script>
<template>
  <fieldset class="vms-editor"><legend>LED 情报板</legend>
    <canvas ref="preview" :width="size.width" :height="size.height" role="img" :aria-label="display.enabled?`情报板预览：${message||'空屏'}`:'情报板已关闭'" />
    <p class="field-help">实时预览 · 仅应用于 {{device.id}} · 黑色区域为熄灭灯珠</p>
    <label class="switch-row"><span>LED 灯珠效果</span><input type="checkbox" :checked="display.dots" @change="patch({dots:($event.target as HTMLInputElement).checked})"></label>
    <div class="vms-fields"><label>屏幕宽度（m）<input type="number" min="2" max="12" step="0.1" :value="display.width" @change="patch({width:number($event,2,12)})"></label><label>屏幕高度（m）<input type="number" min="0.4" max="2.4" step="0.01" :value="display.height" @change="patch({height:number($event,.4,2.4)})"></label></div>
    <label class="switch-row"><span>显示内容</span><input type="checkbox" :checked="display.enabled" @change="patch({enabled:($event.target as HTMLInputElement).checked})"></label>
    <label>情报板内容<textarea :value="state.devices[device.id]?.message??state.message" rows="3" maxlength="80" placeholder="输入内容，回车换行；留空为黑屏" @input="emit('change',{message:value($event)})" /></label>
    <p v-if="state.incident!=='none'&&device.tube===state.incidentTube" class="incident-note">当前设备正显示演练提示，解除后恢复此设备的编辑内容。</p>
    <div class="vms-fields">
      <label>字体颜色<input type="color" :value="display.color" @input="patch({color:value($event)})"></label>
      <label>字号（屏幕像素）<input type="number" min="16" max="80" :value="display.fontSize" @change="patch({fontSize:number($event,16,80)})"></label>
    </div>
    <label>字体<select :value="display.font" @change="patch({font:value($event) as VmsDisplay['font']})"><option value="sans">黑体</option><option value="serif">宋体</option><option value="kai">楷体</option></select></label>
    <div class="vms-fields">
      <label>水平排版<select :value="display.align" @change="patch({align:value($event) as VmsDisplay['align']})"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
      <label>垂直排版<select :value="display.vertical" @change="patch({vertical:value($event) as VmsDisplay['vertical']})"><option value="top">顶部</option><option value="middle">居中</option><option value="bottom">底部</option></select></label>
    </div>
    <label>文字滚动<select :value="display.scroll" @change="patch({scroll:value($event) as VmsDisplay['scroll']})"><option value="none">静止</option><option value="left">向左滚动</option><option value="right">向右滚动</option><option value="up">向上滚动</option><option value="down">向下滚动</option></select></label>
    <label v-if="display.scroll!=='none'">滚动速度 · {{display.speed}} px/s<input type="range" min="20" max="200" step="10" :value="display.speed" @input="patch({speed:number($event,20,200)})"></label>
    <p class="field-help">静止和纵向滚动自动折行；横向滚动按整行展示。超出屏幕的内容会裁切，可缩小字号或启用滚动。字体使用设备已安装字体。</p>
  </fieldset>
</template>
<style scoped>
.vms-editor {scroll-margin-top:66px}
.vms-editor canvas {display:block;width:100%;height:auto;background:#000;border:1px solid #354c77;border-radius:3px;margin-bottom:8px}
.vms-editor textarea {width:100%;resize:vertical;min-height:76px;border:1px solid #3c5178;border-radius:4px;background:#111f3c;color:#edf4ff;padding:8px;font:inherit;line-height:1.6}
.vms-editor textarea:focus-visible {outline:2px solid #8acaff;outline-offset:3px}
.vms-fields {display:grid;grid-template-columns:1fr 1fr;gap:12px;min-width:0}
.vms-fields label {min-width:0}
.vms-fields input[type=color] {padding:3px;cursor:pointer}
</style>
