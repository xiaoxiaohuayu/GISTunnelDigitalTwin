<script setup lang="ts">
import { computed,ref,shallowRef } from 'vue'
import { upgradeProject,mountBase,resolveAsset } from '../../engines/assetPlacement'
import type { Mount } from '../../engines/assetPlacement'
import BoreEditor from './BoreEditor.vue'
import { defaultProject,formatChainage,parseChainage,projectErrors,laneLateral } from '../../engines/projectConfig'
import type { AssetRecord,BoreConfig,TunnelProject } from '../../engines/projectConfig'
import { assetCsvTemplate,previewAssetImport } from '../../engines/assetImport'
import { deviceCatalog } from '../../engines/tunnelSystemsState'
const props=defineProps<{project:TunnelProject;selectedId?:string;apply:(project:TunnelProject|null,focusId?:string)=>Promise<void>}>()
const emit=defineEmits<{close:[]}>()
const draft=ref<TunnelProject>(upgradeProject(props.project))
const tab=shallowRef<'tunnel'|'assets'|'transfer'>(props.selectedId?'assets':'tunnel'),query=shallowRef(''),selectedId=shallowRef(props.selectedId??''),limit=shallowRef(30)
const busy=shallowRef(false),error=shallowRef(''),csv=shallowRef(''),imported=shallowRef<ReturnType<typeof previewAssetImport>>(),pendingProject=shallowRef<TunnelProject>()
const issues=computed(()=>projectErrors(draft.value)),selected=computed(()=>draft.value.assets.find(a=>a.id===selectedId.value))
const matches=computed(()=>draft.value.assets.filter(a=>`${a.code} ${a.name} ${draft.value.bores.find(b=>b.id===a.boreId)?.name}`.toLowerCase().includes(query.value.toLowerCase())))
const orphaned=computed(()=>draft.value.assets.filter(a=>a.mount?.kind==='lane'&&!draft.value.bores.find(b=>b.id===a.boreId)?.lanes.some(l=>l.id===a.mount!.laneId)))
const rows=computed(()=>matches.value.slice(0,limit.value))
function mount(kind:Mount['kind']):void{if(!selected.value)return;const a=selected.value,b=draft.value.bores.find(b=>b.id===a.boreId)!;const next:Mount={kind,side:a.lateral<0?-1:1,laneId:b.lanes[0]?.id,offset:0};next.offset=a.lateral-mountBase(next,b);a.mount=next}
function lateral(event:Event):void{if(!selected.value)return;const a=selected.value,b=draft.value.bores.find(b=>b.id===a.boreId)!;a.lateral=Number((event.target as HTMLInputElement).value);if(a.mount)a.mount.offset=a.lateral-mountBase(a.mount,b)}
function linkTarget(id:string):void{if(!selected.value)return;const b=draft.value.bores.find(b=>b.id===id);if(!b){delete selected.value.link;return}selected.value.link={targetBoreId:id,targetChainage:b.start,memberIds:[]}}
function targetStation(event:Event):void{try{if(selected.value?.link)selected.value.link.targetChainage=parseChainage((event.target as HTMLInputElement).value);error.value=''}catch(e){error.value=String(e)}}
function removeOrphans():void{if(confirm(`删除失去所属车道的 ${orphaned.value.length} 条设备？`)){const ids=new Set(orphaned.value.map(a=>a.id));draft.value.assets=draft.value.assets.filter(a=>!ids.has(a.id))}}
function laneDirection(id:string,turn:number):void{for(const a of draft.value.assets)if(a.kind==='lane'&&a.mount?.laneId===id)a.heading=(a.heading+turn+360)%360}
function laneAdded(bore:BoreConfig,ids:string[]):void{
  const stations=new Map<number,AssetRecord>()
  for(const a of draft.value.assets)if(a.kind==='lane'&&a.boreId===bore.id)stations.set(a.chainage,a)
  for(const id of ids)for(const source of stations.values()){const i=bore.lanes.findIndex(l=>l.id===id),key=crypto.randomUUID();draft.value.assets.push({...source,id:key,code:`${source.code}-${key.slice(0,8)}`,heading:bore.lanes[i]!.direction===1?0:180,lateral:laneLateral(bore,i),mount:{kind:'lane',laneId:id,offset:0}})}
}
function addBore():void{const b=defaultProject().bores[1]!;b.id=crypto.randomUUID();b.name='第二洞筒';draft.value.bores.push(b)}
function removeBore(index:number):void{
  const bore=draft.value.bores[index]!,related=draft.value.assets.filter(a=>a.link&&(a.boreId===bore.id||a.link.targetBoreId===bore.id)),ids=new Set([...draft.value.assets.filter(a=>a.boreId===bore.id).map(a=>a.id),...related.flatMap(a=>[a.id,...a.link!.memberIds])])
  if(!confirm(`删除 ${bore.name} 及 ${ids.size} 条台账？${related.length?`关联横洞也将删除：${related.map(a=>a.code).join('、')}，以及两端的关联门。`:''}保存前不会影响当前场景。`))return
  draft.value.assets=draft.value.assets.filter(a=>!ids.has(a.id));draft.value.bores.splice(index,1)
  if(draft.value.bores.length===1)draft.value.bores[0]!.offset=0
}
function addAsset():void{
  const bore=draft.value.bores[0];if(!bore){error.value='请先添加洞筒';return}
  const id=crypto.randomUUID(),a:AssetRecord={id,code:`DEV-${draft.value.assets.length+1}`,name:'新设备',kind:'camera',boreId:bore.id,chainage:bore.start,lateral:0,height:4.5,heading:0}
  draft.value.assets.push(a);selectedId.value=id
}
function changeChainage(which:'chainage'|'endChainage',event:Event):void{
  if(!selected.value)return
  const text=(event.target as HTMLInputElement).value
  try{if(which==='endChainage'&&!text.trim())delete selected.value.endChainage;else selected.value[which]=parseChainage(text);error.value=''}catch(e){error.value=String(e)}
}
function download(text:string,name:string,type:string):void{const url=URL.createObjectURL(new Blob([text],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function file(event:Event,kind:'csv'|'json'):Promise<void>{
  const input=event.target as HTMLInputElement,f=input.files?.[0];if(!f)return
  try{if(f.size>10_000_000)throw new Error('配置文件不得超过 10 MB');const text=await f.text();if(kind==='csv'){csv.value=text;imported.value=previewAssetImport(text,draft.value)}else{const parsed=JSON.parse(text);const errors=projectErrors(parsed);if(errors.length)throw new Error(errors.slice(0,8).join('\n'));pendingProject.value=upgradeProject(parsed)}error.value=''}catch(e){error.value=e instanceof Error?e.message:String(e)}finally{input.value=''}
}
function acceptProject():void{if(pendingProject.value){draft.value=structuredClone(pendingProject.value);pendingProject.value=undefined;selectedId.value='';error.value=''}}
function acceptCsv():void{const preview=previewAssetImport(csv.value,draft.value);imported.value=preview;if(preview.errors.length)return;draft.value.assets.push(...preview.assets);imported.value=undefined;csv.value='';tab.value='assets'}
async function save():Promise<void>{if(error.value||issues.value.length)return;busy.value=true;try{await props.apply(JSON.parse(JSON.stringify({...draft.value,assets:draft.value.assets.map(a=>resolveAsset(a,draft.value))})),selectedId.value||undefined)}catch(e){error.value=e instanceof Error?e.message:String(e)}finally{busy.value=false}}
async function demo():Promise<void>{if(!confirm('返回原演示场景？已应用配置将从浏览器移除，请先导出备份。'))return;busy.value=true;try{await props.apply(null)}catch(e){error.value=String(e)}finally{busy.value=false}}
</script>

<template>
  <aside class="project-editor" aria-label="隧道配置与设备台账" @keydown.esc.stop="emit('close')">
    <header class="project-header"><div><h2>隧道配置与设备台账</h2><p>本地保存 · 设备按物理洞筒与桩号定位</p></div><button aria-label="关闭配置管理" :disabled="busy" @click="emit('close')">关闭</button></header>
    <nav class="project-tabs" aria-label="配置类别"><button v-for="item in [{id:'tunnel',name:'隧道与洞筒'},{id:'assets',name:'设备与设施台账'},{id:'transfer',name:'批量录入与备份'}] as const" :key="item.id" :aria-pressed="tab===item.id" @click="tab=item.id">{{item.name}}</button></nav>
    <div class="project-body">
      <template v-if="tab==='tunnel'">
        <div class="config-toolbar"><p>未保存的修改不会影响场景。保存后更新受影响的结构和设备。</p><button @click="draft=upgradeProject(defaultProject());draft.assets=[];selectedId='';error=''">新建空白项目</button></div>
        <div class="config-grid">
          <label>隧道名称<input v-model="draft.name" maxlength="40"></label>
          <label>入口中心经度<input v-model.number="draft.origin.longitude" type="number" step="0.000001"></label>
          <label>入口中心纬度<input v-model.number="draft.origin.latitude" type="number" step="0.000001"></label>
          <label>入口路面高程（m）<input v-model.number="draft.origin.elevation" type="number" step="0.1"></label>
          <label>线路方位角（°，北为 0，东为 90）<input v-model.number="draft.origin.heading" type="number" step="0.1"></label>
          <label>线路纵坡（%）<input v-model.number="draft.origin.grade" type="number" step="0.1"></label>
        </div>
        <p class="config-help">当前位置按直线线路建模，高程为绝对高度。单洞双向请在同一洞筒内设置正、反向车道。道路与设备共用安装参照；改变车道数量会联动调整路缘和壁挂设备。已有车道指示器时，新增车道会在相同桩号补建指示器。设备可布设至洞口前后 240 m 的引道。</p>
        <BoreEditor v-for="(bore,i) in draft.bores" :key="bore.id" v-model="draft.bores[i]!" v-model:error="error" @remove="removeBore(i)" @direction="laneDirection" @lanes-added="laneAdded(bore,$event)" />
        <section v-if="orphaned.length" class="import-preview" aria-label="待处理车道设备"><h3>{{orphaned.length}} 条设备失去所属车道</h3><p>重新选择每条设备的车道，或明确删除后才能保存。</p><div v-for="asset in orphaned" :key="asset.id" class="config-toolbar"><span>{{asset.code}} · {{asset.name}}</span><select aria-label="重新指定车道" :value="''" @change="asset.mount!.laneId=($event.target as HTMLSelectElement).value"><option value="" disabled>请选择车道</option><option v-for="(lane,i) in draft.bores.find(b=>b.id===asset.boreId)?.lanes" :key="lane.id" :value="lane.id">车道 {{i+1}}</option></select></div><button @click="removeOrphans">删除以上失去所属车道的设备</button></section>
        <button v-if="draft.bores.length<2" class="config-add" @click="addBore">添加洞筒</button>
      </template>
      <template v-else-if="tab==='assets'">
        <div class="config-toolbar"><label class="ledger-search">搜索编号、名称、洞筒<input v-model="query" type="search" @input="limit=30"></label><button @click="addAsset">新增设备或设施</button></div>
        <div class="ledger-layout"><section class="ledger-list" aria-label="设备台账列表"><p class="config-help">{{matches.length}} 条台账</p><button v-for="asset in rows" :key="asset.id" :aria-pressed="selectedId===asset.id" @click="selectedId=asset.id"><strong>{{asset.code}} · {{asset.name}}</strong><span>{{draft.bores.find(b=>b.id===asset.boreId)?.name}} · {{formatChainage(asset.chainage)}}</span></button><button v-if="matches.length>limit" @click="limit+=30">显示更多</button><p v-if="!matches.length" class="config-help">台账为空，可以新增或通过 CSV 批量录入。</p></section>
          <section v-if="selected" class="asset-form" aria-label="设备位置编辑"><h3>{{selected.code}} · 位置与属性</h3><p class="config-help">编号用于台账检索；内部 ID 不随位置或名称变化。</p><div class="config-grid">
            <label>设备编号<input v-model="selected.code"></label><label>设备名称<input v-model="selected.name"></label>
            <label>设备类型<select v-model="selected.kind"><option v-for="[,kind,name] in deviceCatalog" :key="kind" :value="kind">{{name}}</option></select></label>
            <label>所属物理洞筒<select v-model="selected.boreId"><option v-for="b in draft.bores" :key="b.id" :value="b.id">{{b.name}}</option></select></label>
            <label>桩号<input :key="selected.id+'start'" :value="formatChainage(selected.chainage)" @change="changeChainage('chainage',$event)"></label>
            <label>设施结束桩号，可留空<input :key="selected.id+'end'" :value="selected.endChainage===undefined?'':formatChainage(selected.endChainage)" @change="changeChainage('endChainage',$event)"></label>
            <label>安装参照<select :value="selected.mount?.kind??'unresolved'" @change="mount(($event.target as HTMLSelectElement).value as Mount['kind'])"><option value="unresolved">待确认</option><option value="lane">所属车道</option><option value="wall">墙面</option><option value="edge">路缘</option><option value="ceiling">拱顶</option><option value="site">场地固定位置</option></select></label><label v-if="selected.mount?.kind==='lane'">所属车道<select v-model="selected.mount.laneId"><option v-for="(l,i) in draft.bores.find(b=>b.id===selected?.boreId)?.lanes" :key="l.id" :value="l.id">车道 {{i+1}}</option></select></label>
            <label>横向偏移（m，左负右正）<input :value="resolveAsset(selected,draft).lateral" @input="lateral" type="number" step="0.1"></label><label>安装高度（m）<input v-model.number="selected.height" type="number" step="0.1"></label>
            <label>相对线路朝向（°）<input v-model.number="selected.heading" type="number" step="1"></label>
            <template v-if="['pedestrian','vehicle'].includes(selected.kind)"><label>横洞另一端洞筒<select :value="selected.link?.targetBoreId??''" @change="linkTarget(($event.target as HTMLSelectElement).value)"><option value="">请选择目标洞筒</option><option v-for="b in draft.bores.filter(b=>b.id!==selected?.boreId)" :key="b.id" :value="b.id">{{b.name}}</option></select></label><label v-if="selected.link">另一端桩号<input :value="formatChainage(selected.link.targetChainage)" @change="targetStation"></label><label v-if="selected.link">关联横洞门（可多选）<select v-model="selected.link.memberIds" multiple><option v-for="a in draft.assets.filter(a=>a.kind==='shutter'&&(a.boreId===selected?.boreId||a.boreId===selected?.link?.targetBoreId))" :key="a.id" :value="a.id">{{a.code}}</option></select></label></template>
          </div><button class="config-danger" @click="draft.assets=draft.assets.filter(a=>a.id!==selectedId);selectedId=''">从草稿移除此设备</button></section>
        </div>
      </template>
      <template v-else>
        <section class="transfer-section"><h3>批量录入设备</h3><p>下载模板后用 Excel 填写并保存为 CSV UTF-8。类型可填写设备类型名称或代码，洞筒可填写名称或 ID。横向偏移左负右正，高度单位为米。</p><div class="transfer-actions"><button @click="download(assetCsvTemplate(draft),'设备录入模板.csv','text/csv;charset=utf-8')">下载 CSV 模板</button><label>选择设备 CSV<input type="file" accept=".csv,.tsv" @change="file($event,'csv')"></label></div>
          <div v-if="imported" class="import-preview"><h4>导入预览 · {{imported.assets.length}} 条有效数据</h4><ul v-if="imported.errors.length" class="config-errors"><li v-for="message in imported.errors.slice(0,20)" :key="message">{{message}}</li></ul><p v-for="asset in imported.assets.slice(0,5)" :key="asset.id">{{asset.code}} · {{asset.name}} · {{formatChainage(asset.chainage)}}</p><button :disabled="!!imported.errors.length||!imported.assets.length" @click="acceptCsv">加入草稿，暂不保存</button></div>
        </section>
        <section class="transfer-section"><h3>完整配置备份</h3><p>JSON 包含隧道、洞筒、车道方向和设备台账。导入后先替换草稿，只有保存并应用后才修改场景。</p><div class="transfer-actions"><button @click="download(JSON.stringify(draft,null,2),'隧道配置.json','application/json')">导出当前草稿 JSON</button><label>导入配置 JSON<input type="file" accept=".json" @change="file($event,'json')"></label></div><div v-if="pendingProject" class="import-preview"><p>{{pendingProject.name}} · {{pendingProject.bores.length}} 个洞筒 · {{pendingProject.assets.length}} 条台账</p><button @click="acceptProject()">用此配置替换草稿</button></div></section>
        <button @click="demo">返回原演示场景</button>
      </template>
    </div>
    <footer class="project-footer"><div><p v-if="error" role="alert" class="config-errors">{{error}}</p><p v-if="issues.length" role="status" class="config-errors">{{issues.slice(0,3).join('；')}}<details v-if="issues.length>3"><summary>查看全部 {{issues.length}} 项问题</summary><ul><li v-for="issue in issues" :key="issue">{{issue}}</li></ul></details></p><p v-else class="config-help">校验通过 · {{draft.bores.length}} 个洞筒 · {{draft.assets.length}} 条台账</p></div><button class="apply-project" :disabled="busy||!!error||!!issues.length" @click="save">{{busy?'正在保存…':'保存并应用到场景'}}</button></footer>
  </aside>
</template>

<style>
.project-editor{position:absolute;z-index:12;inset:65px 20px 130px;display:flex;flex-direction:column;background:#101d31;border:1px solid #445d7d;border-radius:8px;color:#edf4ff;overflow:hidden}.project-header{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;border-bottom:1px solid #344861}.project-header h2{margin:0;font-size:19px}.project-header p{margin:7px 0 0;color:#b4c9e2;font-size:12px}.project-header button{padding:8px 14px}.project-tabs{display:flex;gap:8px;padding:12px 22px;border-bottom:1px solid #344861}.project-tabs button{padding:9px 14px;font-size:12px}.project-tabs button[aria-pressed=true]{background:#294d70;color:#fff}.project-body{padding:20px 24px;overflow:auto;flex:1;min-height:0;scrollbar-width:thin;scrollbar-color:#597693 transparent}.config-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.project-editor label{display:flex;flex-direction:column;gap:8px;font-size:12px;color:#c6d8ed}.project-editor input,.project-editor select{width:100%;min-height:38px;padding:8px 10px;background:#0c172a;border:1px solid #506b8d;border-radius:4px;color:#edf4ff;font:inherit}.project-editor input:focus-visible,.project-editor select:focus-visible{outline:2px solid #8acaff;outline-offset:2px}.project-editor button:focus-visible{outline:2px solid #8acaff;outline-offset:2px}.config-help{font-size:11px;color:#b6cce4;line-height:1.7}.config-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}.config-toolbar p{font-size:12px;color:#b6cce4}.config-toolbar button,.config-add{padding:9px 13px;font-size:12px}.bore-editor{margin:24px 0 16px;padding:18px;border:1px solid #405b7c}.bore-editor legend{padding:0 9px;font-size:14px}.lane-directions{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}.lane-directions label{min-width:115px}.config-danger{padding:8px 12px;font-size:11px;color:#ffb9aa;margin-top:12px}.project-footer{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:13px 22px;border-top:1px solid #405b7c;background:#14243b}.project-footer p{margin:0}.apply-project{padding:12px 18px;background:#285980;white-space:nowrap}.config-errors{color:#ffc0af;font-size:12px;line-height:1.6;white-space:pre-line}.ledger-layout{display:grid;grid-template-columns:minmax(230px,1fr) minmax(360px,2fr);gap:24px}.ledger-list>button{display:flex;flex-direction:column;gap:7px;width:100%;padding:12px;margin-bottom:6px;text-align:left}.ledger-list>button[aria-pressed=true]{border-color:#8acaff;background:#244465}.ledger-list strong{font-size:12px;font-weight:500}.ledger-list span{font-size:11px;color:#bdd0e7}.ledger-search{width:min(420px,60%)}.asset-form h3,.transfer-section h3{font-size:15px;margin:0 0 12px}.asset-form{padding-top:10px}.asset-form .config-grid{grid-template-columns:1fr 1fr}.transfer-section{margin-bottom:30px;padding-bottom:24px;border-bottom:1px solid #405b7c}.transfer-section p{max-width:75ch;color:#bdd0e7;line-height:1.7;font-size:12px}.transfer-actions{display:flex;align-items:center;gap:20px;flex-wrap:wrap}.transfer-actions button,.import-preview button{padding:10px 14px;font-size:12px}.import-preview{margin-top:18px;padding:16px;background:#172c46}.import-preview h4{font-size:13px;margin:0 0 10px}
@media(max-width:760px){.project-editor{inset:92px 10px 155px}.project-header{padding:13px}.project-header h2{font-size:15px}.project-tabs{padding:10px;gap:4px}.project-tabs button{padding:8px 6px;font-size:11px}.project-body{padding:16px}.config-grid,.asset-form .config-grid{grid-template-columns:1fr}.ledger-layout{grid-template-columns:1fr}.config-toolbar{align-items:stretch;flex-direction:column}.ledger-search{width:100%}.ledger-list{max-height:230px;overflow:auto}.project-footer{padding:12px;align-items:stretch;flex-direction:column;gap:10px}.project-footer .config-errors{max-height:70px;overflow:auto}.apply-project{min-height:40px}}
</style>
