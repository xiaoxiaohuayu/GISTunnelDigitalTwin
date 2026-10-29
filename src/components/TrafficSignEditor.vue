<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import type { TrafficSignsConfig } from '../types/scene'
import { defaultTrafficSignImages, saveTrafficSigns, trafficSignImage, trafficSignNames } from '../engines/trafficSignConfig'
const props=defineProps<{config:TrafficSignsConfig;activeIndex:number;warning:string;apply:(config:TrafficSignsConfig)=>Promise<void>}>()
const emit=defineEmits<{saved:[config:TrafficSignsConfig]}>()
const draft=shallowRef<TrafficSignsConfig>({images:[...props.config.images]}),previews=shallowRef([...defaultTrafficSignImages]),busy=shallowRef(false),message=shallowRef(props.warning)
let generation=0
watch(()=>props.config,config=>{draft.value={images:[...config.images]}})
watch(draft,async config=>{const version=++generation;try{const images=await Promise.all(config.images.map((image,index)=>trafficSignImage(index,image)));if(version===generation)previews.value=images}catch{if(version===generation)message.value='图片无法解码，请重新选择 PNG、JPEG 或 WebP 图片'}},{immediate:true})
onBeforeUnmount(()=>{generation++})
function replace(index:number,image:Blob|null):void{const images:TrafficSignsConfig['images']=[...draft.value.images];images[index]=image;draft.value={images};message.value=''}
async function upload(index:number,event:Event):Promise<void>{const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;try{await trafficSignImage(index,file);replace(index,file)}catch{message.value='图片无法解码，已保留原标志'}}
async function save():Promise<void>{busy.value=true;message.value='';try{await Promise.all(draft.value.images.map((image,index)=>trafficSignImage(index,image)));await saveTrafficSigns(draft.value);await props.apply(draft.value);emit('saved',draft.value);message.value='已保存，两端入口的交通标志已同步更新'}catch(error){message.value=String(error)}finally{busy.value=false}}
</script>
<template>
  <section class="sign-editor traffic-sign-editor" aria-label="洞口交通标志编辑">
    <h3>洞口交通标志</h3><p class="panel-note">点击场景中的交通牌可直接编辑。三块牌可分别换图，保存在当前浏览器，两端同步。</p>
    <div v-for="(name,index) in trafficSignNames" :key="name" class="traffic-sign-row" :class="{active:index===activeIndex}">
      <img :src="previews[index]" :alt="`${name}当前图片`"><div><label>{{name}}<input type="file" accept="image/png,image/jpeg,image/webp" :disabled="busy" :aria-label="`替换${name}图片`" @change="upload(index,$event)"></label><button :disabled="busy" @click="replace(index,null)">恢复这块默认图片</button></div>
    </div>
    <button class="save-traffic-signs" :disabled="busy" @click="save">{{busy?'正在保存…':'保存交通标志'}}</button><p v-if="message" role="status" class="panel-note">{{message}}</p>
  </section>
</template>
<style scoped>
.traffic-sign-row{display:flex;gap:12px;padding:14px 0;border-bottom:1px solid #344b6c}.traffic-sign-row.active{outline:1px solid #8acaff;outline-offset:4px}.traffic-sign-row img{width:66px;height:66px;object-fit:contain;border-radius:50%;background:#fff;flex-shrink:0}.traffic-sign-row>div{min-width:0;flex:1}.traffic-sign-row label{margin:0 0 8px}.traffic-sign-row input{font-size:10px;padding:6px}.traffic-sign-row button{font-size:11px;padding:6px 8px}.save-traffic-signs{padding:10px 13px;margin-top:18px;font-size:12px;width:100%}
</style>
