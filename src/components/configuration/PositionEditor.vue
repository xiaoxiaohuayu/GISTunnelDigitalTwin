<script setup lang="ts">
import { computed,ref,watch } from 'vue'
import type { AssetRecord } from '../../engines/projectConfig'
import { formatChainage,parseChainage } from '../../engines/projectConfig'
const props=defineProps<{asset:AssetRecord;save:()=>Promise<void>}>()
const emit=defineEmits<{preview:[patch:Partial<AssetRecord>];cancel:[]}>()
const error=ref(''),inputError=ref(''),busy=ref(false),chainage=ref(formatChainage(props.asset.chainage))
watch(()=>props.asset.chainage,value=>chainage.value=formatChainage(value))
const constrained=computed(()=>['pedestrian','vehicle','layby'].includes(props.asset.kind))
const currentScale=computed(()=>Number((props.asset.scale??1).toFixed(2)))
function station(){try{emit('preview',{chainage:parseChainage(chainage.value)});inputError.value=''}catch(e){inputError.value=String(e)}}
function number(key:'lateral'|'height'|'heading'|'scale',value:number|null|undefined){
  if(value==null||Number.isNaN(value))return
  const next=key==='scale'?Math.max(0.25,Math.min(4,Number(value.toFixed(2)))):value
  emit('preview',{[key]:next})
}
function onScaleSlider(value:number|number[]){if(Array.isArray(value))return;number('scale',value)}
async function save(){if(inputError.value)return;error.value='';busy.value=true;try{await props.save()}catch(e){error.value=e instanceof Error?e.message:String(e)}finally{busy.value=false}}
</script>
<template>
  <aside class="position-editor" aria-label="调整位置与大小" @keydown.esc.stop="emit('cancel')">
    <h2>调整位置与大小 · {{asset.code}}</h2><p>拖动{{constrained?' X 轴调整桩号，关联结构一起移动':' X / Y / Z 轴，或输入精确数值与缩放比例'}}。</p>
    <label>桩号<el-input v-model="chainage" @change="station" /></label>
    <label>横向偏移（m）<el-input-number :model-value="Number(asset.lateral.toFixed(3))" :disabled="constrained" :step="0.1" controls-position="right" @change="number('lateral',$event)" /></label>
    <label>安装高度（m）<el-input-number :model-value="Number(asset.height.toFixed(3))" :disabled="constrained" :step="0.1" controls-position="right" @change="number('height',$event)" /></label>
    <label>朝向（°）<el-input-number :model-value="Number(asset.heading.toFixed(2))" :disabled="constrained" :step="1" controls-position="right" @change="number('heading',$event)" /></label>
    <label>大小缩放（×）<el-input-number :model-value="currentScale" :disabled="constrained" :min="0.25" :max="4" :step="0.05" :precision="2" controls-position="right" @change="number('scale',$event)" /></label>
    <div v-if="!constrained" class="scale-slider-row">
      <el-slider :model-value="currentScale" :min="0.25" :max="4" :step="0.05" :show-tooltip="false" @input="onScaleSlider" />
      <el-button size="small" :disabled="currentScale===1" @click="number('scale',1)">1×</el-button>
    </div>
    <p v-if="error||inputError" role="alert">{{inputError||error}}</p><footer><el-button :disabled="busy" @click="emit('cancel')">取消</el-button><el-button type="primary" :disabled="busy||!!inputError" @click="save">{{busy?'正在保存':'保存设置'}}</el-button></footer>
  </aside>
</template>
<style scoped>
.position-editor{position:absolute;right:24px;top:110px;width:min(330px,calc(100vw - 48px));padding:20px;border:1px solid #496471;background:#122431f5;color:#e9f0f3;border-radius:12px;z-index:12;box-sizing:border-box}.position-editor h2{font-size:17px;margin:0 0 12px}.position-editor p{font-size:13px;line-height:1.6;color:#b9cbd5}.position-editor label{display:grid;grid-template-columns:1fr 160px;align-items:center;margin:12px 0;font-size:13px}.position-editor .scale-slider-row{display:grid;grid-template-columns:1fr auto;align-items:center;gap:12px;margin:-4px 0 12px}.position-editor footer{display:flex;justify-content:flex-end;gap:12px;margin-top:18px}.position-editor [role=alert]{color:#ffb4a9}
</style>
