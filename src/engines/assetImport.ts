import { deviceCatalog } from './tunnelSystemsState.ts'
import { parseChainage,projectErrors } from './projectConfig.ts'
import type { AssetRecord,TunnelProject } from './projectConfig.ts'
export function csvRows(text:string):string[][] {
  const delimiter=text.split(/\r?\n/,1)[0]!.includes('\t')?'\t':','
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false
  text=text.replace(/^\uFEFF/,'')
  for(let i=0;i<text.length;i++){
    const ch=text[i]
    if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
    else if(!quoted&&(ch===delimiter||ch==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(ch==='\n'){if(row.some(v=>v.trim()))rows.push(row);row=[]}}
    else cell+=ch
  }
  if(quoted)throw new Error('CSV 引号未闭合')
  row.push(cell.replace(/\r$/,''));if(row.some(v=>v.trim()))rows.push(row)
  return rows
}
export function previewAssetImport(text:string,project:TunnelProject):{assets:AssetRecord[];errors:string[]} {
  const rows=csvRows(text),headers=rows.shift()?.map(v=>v.trim())??[]
  const required=['编号','名称','类型','洞筒','桩号','横向偏移','安装高度','朝向']
  if(required.some(h=>!headers.includes(h)))return {assets:[],errors:[`表头必须包含：${required.join('、')}`]}
  const assets:AssetRecord[]=[],errors:string[]=[]
  rows.forEach((row,index)=>{
    const field=(name:string)=>row[headers.indexOf(name)]?.trim()??''
    try{
      const kind=deviceCatalog.find(d=>d[1]===field('类型')||d[2]===field('类型'))?.[1]
      const bore=project.bores.find(b=>b.id===field('洞筒')||b.name===field('洞筒'))
      if(!kind||!bore)throw new Error('设备类型或洞筒不存在')
      const numeric=(name:string)=>{const s=field(name);if(s===''||!Number.isFinite(Number(s)))throw new Error(`${name}须填写数字`);return Number(s)}
      const asset:AssetRecord={id:crypto.randomUUID(),code:field('编号'),name:field('名称'),kind,boreId:bore.id,chainage:parseChainage(field('桩号')),lateral:numeric('横向偏移'),height:numeric('安装高度'),heading:numeric('朝向')}
      if(field('结束桩号'))asset.endChainage=parseChainage(field('结束桩号'))
      const issues=projectErrors({...project,assets:[...project.assets,...assets,asset]})
      if(issues.length)throw new Error(issues[0])
      assets.push(asset)
    }catch(error){errors.push(`第 ${index+2} 行：${error instanceof Error?error.message:String(error)}`)}
  })
  return {assets,errors}
}
export function assetCsvTemplate(project:TunnelProject):string {
  const bore=project.bores[0]!
  const quote=(s:string)=>`"${s.replaceAll('"','""')}"`
  return '\uFEFF编号,名称,类型,洞筒,桩号,横向偏移,安装高度,朝向,结束桩号\r\n'+['CAM-001','入口摄像机','camera',bore.id,String(bore.start),'-3','4.5','0',''].map(quote).join(',')+'\r\n'
}
