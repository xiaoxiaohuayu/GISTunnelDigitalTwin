<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import type { OverlayPosition, PlacedOverlay, SceneOverlay } from '../types/scene'
import { layoutOverlays } from '../engines/scenePresentation'
const props=defineProps<{items:SceneOverlay[];panelOpen:boolean}>()
const emit=defineEmits<{select:[id:string]}>()
const root=useTemplateRef<HTMLDivElement>('root'),placed=shallowRef<PlacedOverlay[]>([])
let observer:ResizeObserver|undefined,width=0,height=0
const cards=new Map<string,HTMLElement>(),lines=new Map<string,SVGLineElement>(),dots=new Map<string,SVGCircleElement>()
let positions=new Map<string,OverlayPosition>()
function setCard(id:string,node:unknown):void{if(node instanceof HTMLElement)cards.set(id,node);else cards.delete(id)}
function setLine(id:string,node:unknown):void{if(node instanceof SVGLineElement)lines.set(id,node);else lines.delete(id)}
function setDot(id:string,node:unknown):void{if(node instanceof SVGCircleElement)dots.set(id,node);else dots.delete(id)}
function updatePositions(next:OverlayPosition[]):void {
  positions=new Map(next.map(point=>[point.id,point]))
  for(const item of placed.value) {
    const point=positions.get(item.id),card=cards.get(item.id),line=lines.get(item.id),dot=dots.get(item.id)
    if(!card||!line||!dot)continue
    const left=point?point.x+item.left-item.x:0,top=point?point.y+item.top-item.y:0
    const visible=!!point&&left>=0&&left+220<=width&&top>=65&&top+82<=height-130
    const visibility=visible?'visible':'hidden'
    card.style.visibility=visibility;line.style.visibility=visibility;dot.style.visibility=visibility
    if(!point||!visible)continue
    card.style.transform=`translate3d(${left}px,${top}px,0)`
    line.setAttribute('x1',String(point.x));line.setAttribute('y1',String(point.y));line.setAttribute('x2',String(left+110));line.setAttribute('y2',String(top>point.y?top:top+82))
    dot.setAttribute('cx',String(point.x));dot.setAttribute('cy',String(point.y))
  }
}
function layout():void {
  const element=root.value;if(!element)return
  const viewport=element.parentElement!,bounds=viewport.getBoundingClientRect();width=bounds.width;height=bounds.height
  const blocked=[...viewport.querySelectorAll('.scene-panel,.device-inspector,.device-alerts,.roaming-controls,.monitor-view,.viewport-tools,.scene-actions,.scene-context,.arrival,.broadcast-state')].map(node=>{const r=node.getBoundingClientRect();return {x:r.left-bounds.left,y:r.top-bounds.top,width:r.width,height:r.height}})
  const items=props.items.map(item=>({...item,...positions.get(item.id)}))
  placed.value=layoutOverlays(items,width,height,blocked,placed.value)
  void nextTick(()=>updatePositions([...positions.values()]))
}
watch(()=>[props.items,props.panelOpen],layout,{flush:'post'})
onMounted(()=>{observer=new ResizeObserver(layout);observer.observe(root.value!);layout()})
onBeforeUnmount(()=>{observer?.disconnect();cards.clear();lines.clear();dots.clear()})
defineExpose({updatePositions})
</script>
<template>
  <div ref="root" class="scene-overlays" aria-label="场景模拟信息">
    <svg class="overlay-leaders" aria-hidden="true"><line v-for="item in placed" :key="item.id" :ref="(node:unknown)=>setLine(item.id,node)" :x1="item.x" :y1="item.y" :x2="item.left+110" :y2="item.top>item.y?item.top:item.top+82" :class="{selected:item.selected}"/><circle v-for="item in placed" :key="`dot-${item.id}`" :ref="(node:unknown)=>setDot(item.id,node)" :cx="item.x" :cy="item.y" r="3"/></svg>
    <component :is="item.plateColor?'div':'button'" v-for="item in placed" :key="item.id" :ref="(node:unknown)=>setCard(item.id,node)" class="scene-overlay-card" :class="[item.severity,{selected:item.selected,vehicle:!!item.plateColor}]" :style="{left:0,top:0,transform:`translate3d(${item.left}px,${item.top}px,0)`,willChange:'transform'}" :aria-label="item.plateColor?undefined:`选择${item.title}`" @click="!item.plateColor&&emit('select',item.id)">
      <span class="overlay-title"><i v-if="item.plateColor" class="plate-swatch" :class="{'plate-yellow':item.plateColor==='黄牌','plate-green':item.plateColor==='绿牌'}"/>{{item.title}}<small>{{item.selected?'已选中':'模拟'}}</small></span><strong>{{item.value}}</strong><span class="overlay-status"><i aria-hidden="true" />{{item.status}}</span>
    </component>
  </div>
</template>

<style scoped>
.scene-overlay-card{height:82px;padding:11px 13px;background:#122538f5;border:0;border-radius:8px;box-shadow:0 7px 24px #02081255;gap:5px;transition:background .18s,box-shadow .18s;color:#edf5ff}
.scene-overlay-card::before{content:'';position:absolute;inset:0;border:1px solid #9ad7ff45;border-radius:inherit;pointer-events:none}.scene-overlay-card:hover{background:#19394df5!important;box-shadow:0 7px 28px #02081277}.scene-overlay-card.selected{padding:11px 13px;background:#17364df5;border:0}.scene-overlay-card.selected::before{border-color:#a2dfff;box-shadow:inset 0 0 12px #8acaff15}.scene-overlay-card.alarm::before{border-color:#ffb7a1}.scene-overlay-card.warning::before{border-color:#ffda9a}
.overlay-title{font-size:11px;color:#d4e5f6}.overlay-title small{font-size:9px;color:#bbd5e9}.scene-overlay-card strong{font-size:15px;font-weight:500;line-height:1.3;color:#f1f7ff}.overlay-status{display:flex;align-items:center;gap:5px;font-size:10px;color:#bdd5e7}.overlay-status i{width:4px;height:4px;background:#a3e2ca;border-radius:50%}.alarm .overlay-status,.alarm .overlay-status i{color:#ffb7a1}.alarm .overlay-status i{background:#ffb7a1}.warning .overlay-status i{background:#ffda9a}.vehicle .overlay-title{font-size:13px}.vehicle strong{font-size:11px}
@media(prefers-reduced-motion:reduce){.scene-overlay-card{transition:none}}
</style>
