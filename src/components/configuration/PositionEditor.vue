<script setup lang="ts">
import { ref,watch } from 'vue'
import type { AssetRecord } from '../../engines/projectConfig'
import { formatChainage,parseChainage } from '../../engines/projectConfig'
const props=defineProps<{asset:AssetRecord;save:()=>Promise<void>}>()
const emit=defineEmits<{preview:[patch:Partial<AssetRecord>];cancel:[]}>()
const error=ref(''),inputError=ref(''),busy=ref(false),chainage=ref(formatChainage(props.asset.chainage))
watch(()=>props.asset.chainage,value=>chainage.value=formatChainage(value))
const constrained=['pedestrian','vehicle','layby'].includes(props.asset.kind)
function station(){try{emit('preview',{chainage:parseChainage(chainage.value)});inputError.value=''}catch(e){inputError.value=String(e)}}
async function save(){if(inputError.value)return;error.value='';busy.value=true;try{await props.save()}catch(e){error.value=e instanceof Error?e.message:String(e)}finally{busy.value=false}}
</script>
<template>
  <aside class="position-editor" aria-label="调整位置" @keydown.esc.stop="emit('cancel')">
    <h2>调整位置 · {{asset.code}}</h2><p>拖动{{constrained?' X 轴调整桩号，关联结构一起移动':' X / Y / Z 轴，或输入精确数值'}}。</p>
    <label>桩号<input v-model="chainage" @change="station"></label>
    <label>横向偏移（m）<input :value="Number(asset.lateral.toFixed(3))" :disabled="constrained" type="number" step="0.1" @input="emit('preview',{lateral:Number(($event.target as HTMLInputElement).value)})"></label>
    <label>安装高度（m）<input :value="Number(asset.height.toFixed(3))" :disabled="constrained" type="number" step="0.1" @input="emit('preview',{height:Number(($event.target as HTMLInputElement).value)})"></label>
    <label>朝向（°）<input :value="Number(asset.heading.toFixed(2))" :disabled="constrained" type="number" step="1" @input="emit('preview',{heading:Number(($event.target as HTMLInputElement).value)})"></label>
    <p v-if="error||inputError" role="alert">{{inputError||error}}</p><footer><button :disabled="busy" @click="emit('cancel')">取消</button><button :disabled="busy||!!inputError" @click="save">{{busy?'正在保存':'保存位置'}}</button></footer>
  </aside>
</template>
<style scoped>
.position-editor{position:absolute;right:24px;top:110px;width:min(330px,calc(100vw - 48px));padding:20px;border:1px solid #496471;background:#122431f5;color:#e9f0f3;border-radius:12px;z-index:12;box-sizing:border-box}.position-editor h2{font-size:17px;margin:0 0 12px}.position-editor p{font-size:13px;line-height:1.6;color:#b9cbd5}.position-editor label{display:grid;grid-template-columns:1fr 135px;align-items:center;margin:12px 0;font-size:13px}.position-editor input{width:100%;box-sizing:border-box;padding:7px;background:#091923;border:1px solid #496471;border-radius:4px;color:inherit}.position-editor footer{display:flex;justify-content:flex-end;gap:12px;margin-top:18px}.position-editor button{padding:8px 14px;background:#27495b;border:1px solid #638292;border-radius:5px;color:inherit}.position-editor [role=alert]{color:#ffb4a9}
</style>
