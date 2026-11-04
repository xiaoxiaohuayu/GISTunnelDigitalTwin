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
function clamp(value:number|undefined,min:number,max:number):number{const n=Number(value);return Math.max(min,Math.min(max,Number.isFinite(n)?n:min))}
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
    <label class="switch-row"><span>LED 灯珠效果</span><el-switch :model-value="display.dots" @change="patch({dots:$event})" /></label>
    <div class="vms-fields"><label>屏幕宽度（m）<el-input-number :model-value="display.width" :min="2" :max="12" :step="0.1" controls-position="right" @change="patch({width:clamp($event,2,12)})" /></label><label>屏幕高度（m）<el-input-number :model-value="display.height" :min="0.4" :max="2.4" :step="0.01" :precision="2" controls-position="right" @change="patch({height:clamp($event,.4,2.4)})" /></label></div>
    <label class="switch-row"><span>显示内容</span><el-switch :model-value="display.enabled" @change="patch({enabled:$event})" /></label>
    <label>情报板内容<el-input type="textarea" :model-value="state.devices[device.id]?.message??state.message" :rows="3" maxlength="80" placeholder="输入内容，回车换行；留空为黑屏" @input="emit('change',{message:$event})" /></label>
    <p v-if="state.incident!=='none'&&device.tube===state.incidentTube" class="incident-note">当前设备正显示演练提示，解除后恢复此设备的编辑内容。</p>
    <div class="vms-fields">
      <label>字体颜色<el-color-picker :model-value="display.color" @change="patch({color:$event||display.color})" /></label>
      <label>字号（屏幕像素）<el-input-number :model-value="display.fontSize" :min="16" :max="80" :step="1" controls-position="right" @change="patch({fontSize:clamp($event,16,80)})" /></label>
    </div>
    <label>字体<el-select :model-value="display.font" @change="patch({font:$event})"><el-option value="sans" label="黑体" /><el-option value="serif" label="宋体" /><el-option value="kai" label="楷体" /></el-select></label>
    <div class="vms-fields">
      <label>水平排版<el-select :model-value="display.align" @change="patch({align:$event})"><el-option value="left" label="左对齐" /><el-option value="center" label="居中" /><el-option value="right" label="右对齐" /></el-select></label>
      <label>垂直排版<el-select :model-value="display.vertical" @change="patch({vertical:$event})"><el-option value="top" label="顶部" /><el-option value="middle" label="居中" /><el-option value="bottom" label="底部" /></el-select></label>
    </div>
    <label>文字滚动<el-select :model-value="display.scroll" @change="patch({scroll:$event})"><el-option value="none" label="静止" /><el-option value="left" label="向左滚动" /><el-option value="right" label="向右滚动" /><el-option value="up" label="向上滚动" /><el-option value="down" label="向下滚动" /></el-select></label>
    <label v-if="display.scroll!=='none'">滚动速度 · {{display.speed}} px/s<el-slider :model-value="display.speed" :min="20" :max="200" :step="10" @input="patch({speed:clamp(Number($event),20,200)})" /></label>
    <p class="field-help">静止和纵向滚动自动折行；横向滚动按整行展示。超出屏幕的内容会裁切，可缩小字号或启用滚动。字体使用设备已安装字体。</p>
  </fieldset>
</template>
<style scoped>
.vms-editor {scroll-margin-top:66px}
.vms-editor canvas {display:block;width:100%;height:auto;background:#000;border:1px solid #354c77;border-radius:3px;margin-bottom:8px}
.vms-fields {display:grid;grid-template-columns:1fr 1fr;gap:12px;min-width:0}
.vms-fields label {min-width:0}
.switch-row {display:flex;align-items:center;justify-content:space-between;margin:12px 0}
</style>
