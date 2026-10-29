<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import type { PortalSignConfig } from '../types/scene'
import { defaultPortalSign, portalSignImage, savePortalSign } from '../engines/portalSignConfig'
const props=defineProps<{config:PortalSignConfig;length:number;apply:(config:PortalSignConfig)=>Promise<void>;warning:string}>()
const emit=defineEmits<{saved:[config:PortalSignConfig]}>()
const draft=shallowRef<PortalSignConfig>({...props.config}),preview=shallowRef(''),message=shallowRef(props.warning),busy=shallowRef(false)
let generation=0,alive=true
watch(()=>props.config,value=>{draft.value={...value}})
watch(draft,async value=>{
  const current=++generation
  try{const image=await portalSignImage(value,props.length);if(alive&&current===generation)preview.value=image.toDataURL()}catch(error){if(alive&&current===generation)message.value=error instanceof Error?error.message:String(error)}
},{immediate:true})
onBeforeUnmount(()=>{alive=false;generation++})
function patch(value:Partial<PortalSignConfig>):void{draft.value={...draft.value,...value};message.value=''}
async function upload(event:Event):Promise<void>{
  const file=(event.target as HTMLInputElement).files?.[0];if(!file)return
  try{const bitmap=await createImageBitmap(file);bitmap.close();patch({image:file})}catch{message.value='图片无法解码，请选择 PNG、JPEG 或 WebP 图片'}
}
async function save(config=draft.value):Promise<void>{
  busy.value=true;message.value=''
  try {
    await portalSignImage(config,props.length)
    await savePortalSign(config)
    await props.apply(config)
    emit('saved',config);draft.value={...config};message.value='已保存到当前浏览器，两端入口已更新'
  }catch(error){message.value=error instanceof Error?error.message:String(error)}finally{busy.value=false}
}
</script>
<template>
  <section class="sign-editor" aria-label="入口标牌编辑">
    <h3>入口标牌</h3><p class="panel-note">两端共用，保存在当前浏览器。长度留空时使用测绘长度。也可直接点击场景中的牌面编辑。</p>
    <label>内容模式<select :value="draft.mode" :disabled="busy" @change="patch({mode:($event.target as HTMLSelectElement).value as PortalSignConfig['mode']})"><option value="text">文字牌</option><option value="mixed">文字配图片</option><option value="image">整张图片</option></select></label>
    <template v-if="draft.mode!=='image'"><label>隧道名称<input :value="draft.name" maxlength="40" :disabled="busy" @input="patch({name:($event.target as HTMLInputElement).value})"></label><label>隧道长度<input :value="draft.length" maxlength="40" :placeholder="`${Math.round(length)} m（测绘长度）`" :disabled="busy" @input="patch({length:($event.target as HTMLInputElement).value})"></label><label>英文名称<input :value="draft.subtitle??'Qingshan Tunnel'" maxlength="80" :disabled="busy" @input="patch({subtitle:($event.target as HTMLInputElement).value})"></label><label>底部提示<input :value="draft.notice??'请开灯行驶'" maxlength="30" :disabled="busy" @input="patch({notice:($event.target as HTMLInputElement).value})"></label></template>
    <label v-if="draft.mode!=='text'">标牌图片<input type="file" accept="image/png,image/jpeg,image/webp" :disabled="busy" @change="upload"></label>
    <img v-if="preview" class="sign-preview" :src="preview" alt="入口标牌预览">
    <div class="sign-actions"><button :disabled="busy" @click="save()">{{busy?'正在保存…':'保存并应用'}}</button><button :disabled="busy" @click="save(defaultPortalSign())">恢复默认</button></div>
    <p v-if="message" role="status" class="panel-note">{{message}}</p>
  </section>
</template>
