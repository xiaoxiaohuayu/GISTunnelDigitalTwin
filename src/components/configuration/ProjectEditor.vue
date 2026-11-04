<script setup lang="ts">
import { computed,nextTick,ref,shallowRef,watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'
import { upgradeProject,mountBase,resolveAsset } from '../../engines/assetPlacement'
import type { Mount } from '../../engines/assetPlacement'
import BoreEditor from './BoreEditor.vue'
import { defaultProject,formatChainage,parseChainage,projectErrors,laneLateral,boreLength } from '../../engines/projectConfig'
import type { MouthName } from '../../engines/projectConfig'
import { portalEndName } from '../../engines/sceneFrame'
import type { AssetRecord,BoreConfig,PassageRecord,TunnelProject } from '../../engines/projectConfig'
import { BASIC_SPACING, ENHANCED_SPACING, PROFILE_HALF } from '../../engines/sectionProfile'
import type { SectionProfile } from '../../engines/sectionProfile'
import { encodeTunnelPackage, readTunnelPackage } from '../../engines/projectPackage'
import type { TunnelPackageExtras } from '../../engines/projectPackage'
import { readControlOverrides } from '../../engines/projectStorage'
import { readPortalSign } from '../../engines/portalSignConfig'
import { readTrafficSigns } from '../../engines/trafficSignConfig'
import { assetCsvTemplate,previewAssetImport } from '../../engines/assetImport'
import { deviceCatalog } from '../../engines/tunnelSystemsState'
const props=defineProps<{project:TunnelProject;selectedId?:string;apply:(project:TunnelProject|null,focusId?:string,extras?:TunnelPackageExtras)=>Promise<void>}>()
const emit=defineEmits<{close:[]}>()
const draft=ref<TunnelProject>(upgradeProject(props.project))
const tab=shallowRef<'tunnel'|'assets'|'transfer'>(props.selectedId?'assets':'tunnel'),query=shallowRef(''),selectedId=shallowRef(props.selectedId??'')
const boreFilter=shallowRef('all'),kindFilter=shallowRef('all')
const sortKey=shallowRef<'code'|'name'|'kind'|'bore'|'chainage'>('chainage'),sortAsc=shallowRef(true)
const busy=shallowRef(false),error=shallowRef(''),csv=shallowRef(''),imported=shallowRef<ReturnType<typeof previewAssetImport>>(),pendingProject=shallowRef<TunnelProject>(),pendingExtras=shallowRef<TunnelPackageExtras>(),stagedExtras=shallowRef<TunnelPackageExtras>()
const issues=computed(()=>projectErrors(draft.value)),selected=computed(()=>draft.value.assets.find(a=>a.id===selectedId.value))
const kindName=(kind:string)=>deviceCatalog.find(row=>row[1]===kind)?.[2]??kind
const boreName=(id:string)=>draft.value.bores.find(bore=>bore.id===id)?.name??''
const kindChoices=computed(()=>{const present=new Set(draft.value.assets.map(asset=>asset.kind));return deviceCatalog.filter(([,kind])=>present.has(kind)).map(([,kind,name])=>({kind,name}))})
function hit(asset:AssetRecord,term:string):boolean{
  const fields=[asset.code,asset.name,boreName(asset.boreId),kindName(asset.kind),formatChainage(asset.chainage)].map(value=>value.toLowerCase())
  return fields.some(field=>{
    let from=0
    while(from<=field.length){
      const at=field.indexOf(term,from)
      if(at<0)return false
      const next=field[at+term.length]
      if(!/\d$/.test(term)||!next||!/\d/.test(next))return true
      from=at+1
    }
    return false
  })
}
const matches=computed(()=>{
  const terms=query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const rows=draft.value.assets.filter(asset=>{
    if(boreFilter.value!=='all'&&asset.boreId!==boreFilter.value)return false
    if(kindFilter.value!=='all'&&asset.kind!==kindFilter.value)return false
    return terms.every(term=>hit(asset,term))
  })
  const dir=sortAsc.value?1:-1,key=sortKey.value
  return rows.sort((a,b)=>{
    const left=key==='chainage'?a.chainage:key==='bore'?boreName(a.boreId):key==='kind'?kindName(a.kind):a[key]
    const right=key==='chainage'?b.chainage:key==='bore'?boreName(b.boreId):key==='kind'?kindName(b.kind):b[key]
    return typeof left==='number'&&typeof right==='number'?(left-right)*dir:String(left).localeCompare(String(right),'zh')*dir
  })
})
const orphaned=computed(()=>draft.value.assets.filter(a=>a.mount?.kind==='lane'&&!draft.value.bores.find(b=>b.id===a.boreId)?.lanes.some(l=>l.id===a.mount!.laneId)))
function pick(id:string):void{selectedId.value=selectedId.value===id?'':id}
function toggleSort(key:typeof sortKey.value):void{if(sortKey.value===key)sortAsc.value=!sortAsc.value;else{sortKey.value=key;sortAsc.value=true}}
function sortState(key:typeof sortKey.value):'ascending'|'descending'|'none'{return sortKey.value===key?(sortAsc.value?'ascending':'descending'):'none'}
function step(id:string,event:KeyboardEvent):void{
  if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return
  const index=matches.value.findIndex(asset=>asset.id===id)
  const next=matches.value[index+(event.key==='ArrowDown'?1:-1)]
  if(!next)return
  event.preventDefault();selectedId.value=next.id
  void nextTick(()=>document.getElementById(`ledger-${next.id}`)?.focus())
}
watch(matches,rows=>{if(selectedId.value&&!rows.some(asset=>asset.id===selectedId.value))selectedId.value=''})
watch([selectedId,tab],()=>{const id=selectedId.value;if(!id||tab.value!=='assets')return;void nextTick(()=>document.getElementById(`ledger-${id}`)?.scrollIntoView({block:'nearest'}))})
function mount(kind:Mount['kind']):void{if(!selected.value)return;const a=selected.value,b=draft.value.bores.find(b=>b.id===a.boreId)!;const next:Mount={kind,side:a.lateral<0?-1:1,laneId:b.lanes[0]?.id,offset:0};next.offset=a.lateral-mountBase(next,b);a.mount=next}
function lateral(value:number|null|undefined):void{if(!selected.value||value==null||Number.isNaN(value))return;const a=selected.value,b=draft.value.bores.find(b=>b.id===a.boreId)!;a.lateral=value;if(a.mount)a.mount.offset=a.lateral-mountBase(a.mount,b)}
function linkTarget(id:string):void{if(!selected.value)return;const b=draft.value.bores.find(b=>b.id===id);if(!b){delete selected.value.link;return}selected.value.link={targetBoreId:id,targetChainage:b.start,memberIds:[]}}
function targetStation(text:string):void{try{if(selected.value?.link)selected.value.link.targetChainage=parseChainage(text);error.value=''}catch(e){error.value=String(e)}}
async function removeOrphans():Promise<void>{try{await ElMessageBox.confirm(`删除失去所属车道的 ${orphaned.value.length} 条设备？`,'删除设备',{type:'warning',confirmButtonText:'删除',cancelButtonText:'取消'})}catch{return}const ids=new Set(orphaned.value.map(a=>a.id));draft.value.assets=draft.value.assets.filter(a=>!ids.has(a.id))}
function laneDirection(id:string,turn:number):void{for(const a of draft.value.assets)if(a.kind==='lane'&&a.mount?.laneId===id)a.heading=(a.heading+turn+360)%360}
function laneAdded(bore:BoreConfig,ids:string[]):void{
  const stations=new Map<number,AssetRecord>()
  for(const a of draft.value.assets)if(a.kind==='lane'&&a.boreId===bore.id)stations.set(a.chainage,a)
  for(const id of ids)for(const source of stations.values()){const i=bore.lanes.findIndex(l=>l.id===id),key=crypto.randomUUID();draft.value.assets.push({...source,id:key,code:`${source.code}-${key.slice(0,8)}`,heading:bore.lanes[i]!.direction===1?0:180,lateral:laneLateral(bore,i),mount:{kind:'lane',laneId:id,offset:0}})}
}
function addBore():void{const b=defaultProject().bores[1]!;b.id=crypto.randomUUID();b.name='第二洞筒';draft.value.bores.push(b)}
async function removeBore(index:number):Promise<void>{
  const bore=draft.value.bores[index]!,related=draft.value.assets.filter(a=>a.link&&(a.boreId===bore.id||a.link.targetBoreId===bore.id)),ids=new Set([...draft.value.assets.filter(a=>a.boreId===bore.id).map(a=>a.id),...related.flatMap(a=>[a.id,...a.link!.memberIds])])
  try{await ElMessageBox.confirm(`删除 ${bore.name} 及 ${ids.size} 条台账？${related.length?`关联横洞也将删除：${related.map(a=>a.code).join('、')}，以及两端的关联门。`:''}保存前不会影响当前场景。`,'删除洞筒',{type:'warning',confirmButtonText:'删除',cancelButtonText:'取消'})}catch{return}
  draft.value.assets=draft.value.assets.filter(a=>!ids.has(a.id));draft.value.bores.splice(index,1)
  if(draft.value.bores.length===1)draft.value.bores[0]!.offset=0
  const mouths=draft.value.mouths?.filter(mouth=>draft.value.bores.some(bore=>bore.id===mouth.boreId))
  draft.value.mouths=mouths?.length?mouths:undefined
}
const portalEnds=[0,1] as const
function mouthText(boreId:string,end:0|1):string{return draft.value.mouths?.find(mouth=>mouth.boreId===boreId&&mouth.end===end)?.name??''}
function setMouth(boreId:string,end:0|1,value:string):void{
  const name=value.trim()
  const mouths=(draft.value.mouths??[]).filter(mouth=>!(mouth.boreId===boreId&&mouth.end===end))
  if(name&&name!==draft.value.name.trim())mouths.push({boreId,end,name} satisfies MouthName)
  draft.value.mouths=mouths.length?mouths:undefined
}
function addAsset():void{
  const bore=draft.value.bores[0];if(!bore){error.value='请先添加洞筒';return}
  const id=crypto.randomUUID(),a:AssetRecord={id,code:`DEV-${draft.value.assets.length+1}`,name:'新设备',kind:'camera',boreId:bore.id,chainage:bore.start,lateral:0,height:4.5,heading:0}
  draft.value.assets.push(a);selectedId.value=id
}
function changeChainage(which:'chainage'|'endChainage',text:string):void{
  if(!selected.value)return
  try{if(which==='endChainage'&&!text.trim())delete selected.value.endChainage;else selected.value[which]=parseChainage(text);error.value=''}catch(e){error.value=String(e)}
}
function download(text:string,name:string,type:string):void{const url=URL.createObjectURL(new Blob([text],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function setSection(key:keyof SectionProfile,value:string):void{const text=value.trim();const section={...draft.value.section};if(!text)delete section[key];else section[key]=Number(text);draft.value.section=Object.keys(section).length?section:undefined}
function addPassage():void{const bore=draft.value.bores[0];const passage:PassageRecord={station:bore?Math.round(boreLength(bore)/2):0,vehicle:(draft.value.passages?.length??0)===1};draft.value.passages=[...(draft.value.passages??[]),passage]}
function removePassage(index:number):void{const passages=draft.value.passages?.filter((_,i)=>i!==index)??[];if(passages.length)draft.value.passages=passages;else delete draft.value.passages}
function newProject():void{draft.value=upgradeProject(defaultProject());draft.value.assets=[];selectedId.value='';error.value='';stagedExtras.value=undefined;pendingExtras.value=undefined}
async function exportPackage():Promise<void>{
  const [controls,portalSign,trafficSigns]=await Promise.all([
    readControlOverrides(draft.value.id).catch(()=>({})),
    readPortalSign().catch(()=>undefined),
    readTrafficSigns().catch(()=>undefined),
  ])
  download(JSON.stringify(await encodeTunnelPackage({project:draft.value,controls,portalSign,trafficSigns}),null,2),'隧道配置包.json','application/json')
}
async function file(upload:UploadFile,kind:'csv'|'json'):Promise<void>{
  const f=upload.raw;if(!f)return
  try{if(f.size>(kind==='json'?25_000_000:10_000_000))throw new Error(kind==='json'?'配置包不得超过 25 MB':'配置文件不得超过 10 MB');const text=await f.text();if(kind==='csv'){csv.value=text;imported.value=previewAssetImport(text,draft.value)}else{const loaded=readTunnelPackage(JSON.parse(text));pendingProject.value=loaded.project;pendingExtras.value=loaded.extras}error.value=''}catch(e){error.value=e instanceof Error?e.message:String(e)}
}
function acceptProject():void{if(pendingProject.value){draft.value=structuredClone(pendingProject.value);stagedExtras.value=pendingExtras.value;pendingProject.value=undefined;pendingExtras.value=undefined;selectedId.value='';error.value=''}}
function acceptCsv():void{const preview=previewAssetImport(csv.value,draft.value);imported.value=preview;if(preview.errors.length)return;draft.value.assets.push(...preview.assets);imported.value=undefined;csv.value='';tab.value='assets'}
function onCsv(upload:UploadFile):void{void file(upload,'csv')}
function onJson(upload:UploadFile):void{void file(upload,'json')}
async function save():Promise<void>{
  if(document.activeElement instanceof HTMLElement)document.activeElement.blur()
  await nextTick()
  if(error.value||issues.value.length)return
  busy.value=true
  try{await props.apply(JSON.parse(JSON.stringify({...draft.value,assets:draft.value.assets.map(a=>resolveAsset(a,draft.value))})),selectedId.value||undefined,stagedExtras.value);stagedExtras.value=undefined}catch(e){error.value=e instanceof Error?e.message:String(e)}finally{busy.value=false}
}
async function demo():Promise<void>{try{await ElMessageBox.confirm('返回原演示场景？已应用配置将从浏览器移除，请先导出备份。','返回演示场景',{type:'warning',confirmButtonText:'返回演示',cancelButtonText:'取消'})}catch{return}busy.value=true;try{await props.apply(null)}catch(e){error.value=String(e)}finally{busy.value=false}}
</script>

<template>
  <aside class="project-editor" aria-label="隧道配置与设备台账" @keydown.esc.stop="emit('close')">
    <header class="project-header"><div><h2>隧道配置与设备台账</h2><p>本机缓存 · 导出配置包可带走线路、台账、标牌和控制</p></div><el-button aria-label="关闭配置管理" :disabled="busy" @click="emit('close')">关闭</el-button></header>
    <el-radio-group v-model="tab" class="project-tabs" aria-label="配置类别"><el-radio-button value="tunnel">隧道与洞筒</el-radio-button><el-radio-button value="assets">设备与设施台账</el-radio-button><el-radio-button value="transfer">批量录入与备份</el-radio-button></el-radio-group>
    <div class="project-body">
      <template v-if="tab==='tunnel'">
        <div class="config-toolbar"><p>未保存的修改不会影响场景。保存后更新受影响的结构和设备。</p><el-button @click="newProject">新建空白项目</el-button></div>
        <div class="config-grid">
          <label>隧道名称<el-input v-model="draft.name" maxlength="40" /></label>
          <label>入口中心经度<el-input-number v-model="draft.origin.longitude" :step="0.000001" :precision="6" controls-position="right" /></label>
          <label>入口中心纬度<el-input-number v-model="draft.origin.latitude" :step="0.000001" :precision="6" controls-position="right" /></label>
          <label>入口路面高程（m）<el-input-number v-model="draft.origin.elevation" :step="0.1" :precision="1" controls-position="right" /></label>
          <label>线路方位角（°，北为 0，东为 90）<el-input-number v-model="draft.origin.heading" :step="0.1" :precision="1" controls-position="right" /></label>
          <label>线路纵坡（%）<el-input-number v-model="draft.origin.grade" :step="0.1" :precision="1" controls-position="right" /></label>
          <label>断面半宽（m，留空为 {{PROFILE_HALF}}）<el-input :model-value="draft.section?.templateHalf??''" :placeholder="String(PROFILE_HALF)" @change="setSection('templateHalf',$event)" /></label>
          <label>基本照明间距（m，留空为 {{BASIC_SPACING}}）<el-input :model-value="draft.section?.basicSpacing??''" :placeholder="String(BASIC_SPACING)" @change="setSection('basicSpacing',$event)" /></label>
          <label>加强照明间距（m，留空为 {{ENHANCED_SPACING}}）<el-input :model-value="draft.section?.enhancedSpacing??''" :placeholder="String(ENHANCED_SPACING)" @change="setSection('enhancedSpacing',$event)" /></label>
        </div>
        <section class="mouth-names" aria-label="洞口门楣名称"><h3>洞口门楣</h3><p class="config-help">每个洞门单独填写，同一端的两个洞口也可以不同。留空则使用隧道名称。</p><div v-for="bore in draft.bores" :key="bore.id" class="mouth-row"><strong>{{bore.name}}</strong><label v-for="end in portalEnds" :key="end">{{bore.name}} · {{portalEndName(draft.origin.heading,end)}}<el-input :model-value="mouthText(bore.id,end)" maxlength="16" :placeholder="draft.name || '沿用隧道名称'" :aria-label="`${bore.name}${portalEndName(draft.origin.heading,end)}门楣`" @input="setMouth(bore.id,end,$event)" @change="setMouth(bore.id,end,$event)" /></label></div></section>
        <p class="config-help">当前位置按直线线路建模，高程为绝对高度。断面半宽只放大行车道，路缘以外仍按米计。照明间距只影响还没写入台账的程序化布灯；台账里的灯保持原编号和桩号。单洞双向请在同一洞筒内设置正、反向车道。道路与设备共用安装参照；改变车道数量会联动调整路缘和壁挂设备。已有车道指示器时，新增车道会在相同桩号补建指示器。设备可布设至洞口前后 240 m 的引道。</p>
        <section class="transfer-section" aria-label="横洞桩号"><h3>横洞桩号</h3><p>台账里已有人行或车行横洞时，以台账位置为准。下面的桩号只在台账没有横洞时使用，距离是沿线路离开洞口的米数。</p><div v-for="(passage,index) in draft.passages??[]" :key="index" class="config-toolbar"><label>桩号（m）<el-input-number v-model="passage.station" :step="1" controls-position="right" /></label><label>类型<el-select :model-value="passage.vehicle?1:0" @change="passage.vehicle=$event===1"><el-option :value="0" label="人行" /><el-option :value="1" label="车行" /></el-select></label><el-button @click="removePassage(index)">移除</el-button></div><el-button v-if="(draft.passages?.length??0)<12" @click="addPassage">添加横洞桩号</el-button></section>
        <BoreEditor v-for="(bore,i) in draft.bores" :key="bore.id" v-model="draft.bores[i]!" v-model:error="error" @remove="removeBore(i)" @direction="laneDirection" @lanes-added="laneAdded(bore,$event)" />
        <section v-if="orphaned.length" class="import-preview" aria-label="待处理车道设备"><h3>{{orphaned.length}} 条设备失去所属车道</h3><p>重新选择每条设备的车道，或明确删除后才能保存。</p><div v-for="asset in orphaned" :key="asset.id" class="config-toolbar"><span>{{asset.code}} · {{asset.name}}</span><el-select aria-label="重新指定车道" placeholder="请选择车道" @change="asset.mount!.laneId=$event"><el-option v-for="(lane,i) in draft.bores.find(b=>b.id===asset.boreId)?.lanes" :key="lane.id" :label="`车道 ${i+1}`" :value="lane.id" /></el-select></div><el-button type="danger" plain @click="removeOrphans">删除以上失去所属车道的设备</el-button></section>
        <el-button v-if="draft.bores.length<2" class="config-add" @click="addBore">添加洞筒</el-button>
      </template>
      <template v-else-if="tab==='assets'">
        <div class="ledger">
          <div class="ledger-tools">
            <el-input v-model="query" class="ledger-search" clearable aria-label="搜索编号、名称或桩号" placeholder="编号、名称或桩号" />
            <el-select v-model="boreFilter" aria-label="按洞筒筛选"><el-option value="all" label="全部洞筒" /><el-option v-for="bore in draft.bores" :key="bore.id" :label="bore.name" :value="bore.id" /></el-select>
            <el-select v-model="kindFilter" aria-label="按类型筛选"><el-option value="all" label="全部类型" /><el-option v-for="item in kindChoices" :key="item.kind" :label="item.name" :value="item.kind" /></el-select>
            <span class="ledger-count">{{matches.length===draft.assets.length?`${matches.length} 条`:`${matches.length} / ${draft.assets.length}`}}</span>
            <el-button type="primary" plain @click="addAsset">新增</el-button>
          </div>
          <div class="ledger-board" :class="{editing:!!selected}">
            <div class="ledger-scroll" role="region" aria-label="设备台账列表">
              <table class="ledger-table">
                <thead><tr>
                  <th scope="col"><button type="button" class="ledger-sort" :aria-sort="sortState('code')" @click="toggleSort('code')">编号</button></th>
                  <th scope="col"><button type="button" class="ledger-sort" :aria-sort="sortState('name')" @click="toggleSort('name')">名称</button></th>
                  <th scope="col"><button type="button" class="ledger-sort" :aria-sort="sortState('kind')" @click="toggleSort('kind')">类型</button></th>
                  <th scope="col"><button type="button" class="ledger-sort" :aria-sort="sortState('bore')" @click="toggleSort('bore')">洞筒</button></th>
                  <th scope="col"><button type="button" class="ledger-sort station" :aria-sort="sortState('chainage')" @click="toggleSort('chainage')">桩号</button></th>
                </tr></thead>
                <tbody>
                  <tr v-for="asset in matches" :id="`ledger-${asset.id}`" :key="asset.id" :class="{on:selectedId===asset.id}" tabindex="0" :aria-selected="selectedId===asset.id" @click="pick(asset.id)" @keydown.enter.prevent="pick(asset.id)" @keydown.space.prevent="pick(asset.id)" @keydown="step(asset.id,$event)">
                    <td>{{asset.code}}</td><td class="name">{{asset.name}}</td><td>{{kindName(asset.kind)}}</td><td>{{boreName(asset.boreId)}}</td><td class="station">{{formatChainage(asset.chainage)}}</td>
                  </tr>
                  <tr v-if="!matches.length"><td class="ledger-empty" colspan="5">{{draft.assets.length?'没有符合条件的设备。换个关键词，或清空筛选。':'台账是空的。可以新增，或到批量录入里用 CSV 写入。'}}</td></tr>
                </tbody>
              </table>
            </div>
            <section v-if="selected" class="asset-form" aria-label="设备位置编辑">
              <header class="asset-head"><div><h3>{{selected.code}}</h3><p>{{boreName(selected.boreId)}} · {{formatChainage(selected.chainage)}} · {{kindName(selected.kind)}}</p></div><el-button text @click="selectedId=''">收起</el-button></header>
              <div class="config-grid">
                <label>桩号<el-input :key="selected.id+'start'" :model-value="formatChainage(selected.chainage)" @change="changeChainage('chainage',$event)" /></label>
                <label>所属物理洞筒<el-select v-model="selected.boreId"><el-option v-for="b in draft.bores" :key="b.id" :label="b.name" :value="b.id" /></el-select></label>
                <label>横向偏移（m，左负右正）<el-input-number :model-value="resolveAsset(selected,draft).lateral" :step="0.1" controls-position="right" @change="lateral" /></label>
                <label>安装高度（m）<el-input-number v-model="selected.height" :step="0.1" controls-position="right" /></label>
                <label>相对线路朝向（°）<el-input-number v-model="selected.heading" :step="1" controls-position="right" /></label>
                <label>设施结束桩号，可留空<el-input :key="selected.id+'end'" :model-value="selected.endChainage===undefined?'':formatChainage(selected.endChainage)" @change="changeChainage('endChainage',$event)" /></label>
                <label>设备编号<el-input v-model="selected.code" /></label><label>设备名称<el-input v-model="selected.name" /></label>
                <label>设备类型<el-select v-model="selected.kind"><el-option v-for="[,kind,name] in deviceCatalog" :key="kind" :label="name" :value="kind" /></el-select></label>
                <label>安装参照<el-select :model-value="selected.mount?.kind??'unresolved'" @change="mount($event)"><el-option value="unresolved" label="待确认" /><el-option value="lane" label="所属车道" /><el-option value="wall" label="墙面" /><el-option value="edge" label="路缘" /><el-option value="ceiling" label="拱顶" /><el-option value="site" label="场地固定位置" /></el-select></label><label v-if="selected.mount?.kind==='lane'">所属车道<el-select v-model="selected.mount.laneId"><el-option v-for="(l,i) in draft.bores.find(b=>b.id===selected?.boreId)?.lanes" :key="l.id" :label="`车道 ${i+1}`" :value="l.id" /></el-select></label>
                <template v-if="['pedestrian','vehicle'].includes(selected.kind)"><label>横洞另一端洞筒<el-select :model-value="selected.link?.targetBoreId??''" placeholder="请选择目标洞筒" @change="linkTarget"><el-option v-for="b in draft.bores.filter(b=>b.id!==selected?.boreId)" :key="b.id" :label="b.name" :value="b.id" /></el-select></label><label v-if="selected.link">另一端桩号<el-input :model-value="formatChainage(selected.link.targetChainage)" @change="targetStation" /></label><label v-if="selected.link">关联横洞门（可多选）<el-select v-model="selected.link.memberIds" multiple><el-option v-for="a in draft.assets.filter(a=>a.kind==='shutter'&&(a.boreId===selected?.boreId||a.boreId===selected?.link?.targetBoreId))" :key="a.id" :label="a.code" :value="a.id" /></el-select></label></template>
              </div>
              <el-button type="danger" plain @click="draft.assets=draft.assets.filter(a=>a.id!==selectedId);selectedId=''">从草稿移除此设备</el-button>
            </section>
          </div>
        </div>
      </template>
      <template v-else>
        <section class="transfer-section"><h3>批量录入设备</h3><p>下载模板后用 Excel 填写并保存为 CSV UTF-8。类型可填写设备类型名称或代码，洞筒可填写名称或 ID。横向偏移左负右正，高度单位为米。</p><div class="transfer-actions"><el-button @click="download(assetCsvTemplate(draft),'设备录入模板.csv','text/csv;charset=utf-8')">下载 CSV 模板</el-button><el-upload :auto-upload="false" :show-file-list="false" accept=".csv,.tsv" :on-change="onCsv"><el-button>选择设备 CSV</el-button></el-upload></div>
          <div v-if="imported" class="import-preview"><h4>导入预览 · {{imported.assets.length}} 条有效数据</h4><ul v-if="imported.errors.length" class="config-errors"><li v-for="message in imported.errors.slice(0,20)" :key="message">{{message}}</li></ul><p v-for="asset in imported.assets.slice(0,5)" :key="asset.id">{{asset.code}} · {{asset.name}} · {{formatChainage(asset.chainage)}}</p><el-button :disabled="!!imported.errors.length||!imported.assets.length" @click="acceptCsv">加入草稿，暂不保存</el-button></div>
        </section>
        <section class="transfer-section"><h3>完整配置包</h3><p>一份 JSON 包含线路、洞筒、设备台账、入口标牌、交通标志图片和单设备控制。浏览器里的记录只是本机缓存。旧的纯项目 JSON 仍可导入。导入后先替换草稿，只有保存并应用后才修改场景。</p><div class="transfer-actions"><el-button type="primary" plain @click="exportPackage">导出完整配置包</el-button><el-upload :auto-upload="false" :show-file-list="false" accept=".json,application/json" :on-change="onJson"><el-button>导入配置包或 JSON</el-button></el-upload></div><div v-if="pendingProject" class="import-preview"><p>{{pendingProject.name}} · {{pendingProject.bores.length}} 个洞筒 · {{pendingProject.assets.length}} 条台账{{pendingExtras?' · 含标牌与设备控制':''}}</p><el-button type="primary" @click="acceptProject()">用此配置替换草稿</el-button></div></section>
        <el-button type="warning" plain @click="demo">返回原演示场景</el-button>
      </template>
    </div>
    <footer class="project-footer"><div><p v-if="error" role="alert" class="config-errors">{{error}}</p><p v-if="issues.length" role="status" class="config-errors">{{issues.slice(0,3).join('；')}}<details v-if="issues.length>3"><summary>查看全部 {{issues.length}} 项问题</summary><ul><li v-for="issue in issues" :key="issue">{{issue}}</li></ul></details></p><p v-else class="config-help">校验通过 · {{draft.bores.length}} 个洞筒 · {{draft.assets.length}} 条台账</p></div><el-button type="primary" :disabled="busy||!!error||!!issues.length" @click="save">{{busy?'正在保存…':'保存并应用到场景'}}</el-button></footer>
  </aside>
</template>

<style>
.project-editor{position:absolute;z-index:12;inset:65px 20px 130px;display:flex;flex-direction:column;background:#101d31;border:1px solid #445d7d;border-radius:8px;color:#edf4ff;overflow:hidden}.project-header{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;border-bottom:1px solid #344861}.project-header h2{margin:0;font-size:19px}.project-header p{margin:7px 0 0;color:#b4c9e2;font-size:12px}.project-header button{padding:8px 14px}.project-tabs{display:flex;gap:8px;padding:12px 22px;border-bottom:1px solid #344861}.project-tabs button{padding:9px 14px;font-size:12px}.project-tabs button[aria-pressed=true]{background:#294d70;color:#fff}.project-body{padding:20px 24px;overflow:auto;flex:1;min-height:0;scrollbar-width:thin;scrollbar-color:#597693 transparent}.config-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.mouth-names{margin:18px 0 8px}.mouth-names h3{margin:0 0 6px;font-size:14px}.mouth-row{display:grid;grid-template-columns:120px 1fr 1fr;gap:12px;align-items:end;margin:10px 0}.mouth-row strong{padding-bottom:8px;font-size:13px;color:#edf4ff}.project-editor label{display:flex;flex-direction:column;gap:8px;font-size:12px;color:#c6d8ed}.project-editor .el-input-number{width:100%}.config-help{font-size:11px;color:#b6cce4;line-height:1.7}.config-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}.config-toolbar p{font-size:12px;color:#b6cce4}.config-toolbar button,.config-add{padding:9px 13px;font-size:12px}.bore-editor{margin:24px 0 16px;padding:18px;border:1px solid #405b7c}.bore-editor legend{padding:0 9px;font-size:14px}.lane-directions{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}.lane-directions label{min-width:115px}.config-danger{padding:8px 12px;font-size:11px;color:#ffb9aa;margin-top:12px}.project-footer{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:13px 22px;border-top:1px solid #405b7c;background:#14243b}.project-footer p{margin:0}.apply-project{padding:12px 18px;background:#285980;white-space:nowrap}.config-errors{color:#ffc0af;font-size:12px;line-height:1.6;white-space:pre-line}.project-body:has(.ledger){display:flex;flex-direction:column;overflow:hidden}.ledger{flex:1;min-height:0;display:flex;flex-direction:column;gap:12px}.ledger-tools{display:flex;align-items:center;gap:10px}.project-editor .ledger-tools .ledger-search{flex:1;width:auto;min-width:180px}.project-editor .ledger-tools .el-select{width:168px;flex:none}.ledger-count{flex:none;font-size:12px;color:#abbfdc;font-variant-numeric:tabular-nums}.ledger-board{flex:1;min-height:0;display:flex;min-width:0}.ledger-scroll{flex:1;min-width:0;overflow:auto;border:1px solid #2c4268;border-radius:4px;scrollbar-width:thin;scrollbar-color:#597693 transparent}.ledger-table{width:100%;border-collapse:collapse}.ledger-table th{position:sticky;top:0;z-index:1;background:#14243b;text-align:left}.ledger-table td,.ledger-table th{padding:7px 12px;border-bottom:1px solid #243656;font-size:13px;white-space:nowrap}.ledger-table button.ledger-sort,.ledger-table button.ledger-sort:hover{border:0;background:transparent;padding:0;border-radius:0;box-shadow:none;color:#abbfdc;font:inherit;font-size:12px;cursor:pointer}.ledger-table button.ledger-sort:hover{color:#edf4ff}.ledger-table button.ledger-sort[aria-sort=ascending]::after{content:" ↑";color:#6cbaff}.ledger-table button.ledger-sort[aria-sort=descending]::after{content:" ↓";color:#6cbaff}.ledger-table td.name{max-width:280px;overflow:hidden;text-overflow:ellipsis}.ledger-table td.station,.ledger-table th:last-child{text-align:right}.ledger-table td.station{color:#6cbaff;font-variant-numeric:tabular-nums}.ledger-table tbody tr{cursor:pointer}.ledger-table tbody tr:hover{background:#162844}.ledger-table tbody tr.on{background:#17304f;box-shadow:inset 2px 0 0 #6cbaff}.ledger-table tbody tr:focus-visible{outline:2px solid #6cbaff;outline-offset:-2px}.ledger-empty{white-space:normal;color:#abbfdc;padding:28px 12px}.ledger-board.editing .asset-form{width:360px;flex:none;overflow:auto;margin-left:16px;padding:0 0 12px 16px;border-left:1px solid #2c4268}.asset-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.asset-head h3{margin:0;font-size:18px;font-weight:600}.asset-head p{margin:6px 0 0;color:#6cbaff;font-size:12px;font-variant-numeric:tabular-nums}.ledger-board.editing .asset-form .config-grid{grid-template-columns:1fr}.asset-form h3,.transfer-section h3{font-size:15px;margin:0 0 12px}.asset-form .el-button--danger{margin-top:16px}.transfer-section{margin-bottom:30px;padding-bottom:24px;border-bottom:1px solid #405b7c}.transfer-section p{max-width:75ch;color:#bdd0e7;line-height:1.7;font-size:12px}.transfer-actions{display:flex;align-items:center;gap:20px;flex-wrap:wrap}.transfer-actions button,.import-preview button{padding:10px 14px;font-size:12px}.import-preview{margin-top:18px;padding:16px;background:#172c46}.import-preview h4{font-size:13px;margin:0 0 10px}.mouth-names{margin:8px 0 20px}.mouth-names h3{margin:0 0 8px;font-size:15px}.mouth-row{display:grid;grid-template-columns:120px 1fr 1fr;gap:12px;align-items:end;margin-top:12px}.mouth-row strong{padding-bottom:10px;font-size:13px;font-weight:500}
@media(max-width:760px){.project-editor{inset:92px 10px 155px}.project-header{padding:13px}.project-header h2{font-size:15px}.project-tabs{padding:10px;gap:4px}.project-tabs button{padding:8px 6px;font-size:11px}.project-body{padding:16px}.config-grid,.asset-form .config-grid{grid-template-columns:1fr}.config-toolbar{align-items:stretch;flex-direction:column}.ledger-tools{flex-wrap:wrap}.project-editor .ledger-tools .el-select,.project-editor .ledger-tools .ledger-search{width:100%}.ledger-board.editing{flex-direction:column}.ledger-board.editing .ledger-scroll{display:none}.ledger-board.editing .asset-form{width:100%;margin:0;padding:0;border:0}.mouth-row{grid-template-columns:1fr}.project-footer{padding:12px;align-items:stretch;flex-direction:column;gap:10px}.project-footer .config-errors{max-height:70px;overflow:auto}.apply-project{min-height:40px}}
</style>
