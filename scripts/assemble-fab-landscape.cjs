// Run through npm exec --package=@gltf-transform/cli@4.3.0 -- node this-file.
// Reuse the registered SDK from the CLI without adding a browser dependency.
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const cli=process.env.PATH.split(path.delimiter).map(dir=>path.join(dir,'gltf-transform')).find(p=>fs.existsSync(p));
if(!cli)throw new Error('Run with npm exec --package=@gltf-transform/cli@4.3.0');
const tool=createRequire(fs.realpathSync(cli));
const {NodeIO}=tool('@gltf-transform/core');
const {ALL_EXTENSIONS,EXTMeshGPUInstancing}=tool('@gltf-transform/extensions');
const {copyToDocument,prune,unpartition}=tool('@gltf-transform/functions');
const draco=tool('draco3dgltf');
const ROOT=path.resolve(__dirname,'..');
(async()=>{
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco.createDecoderModule()});
 const doc=await io.read(path.join(ROOT,'src/assets/modelAssets/legacy/portal-terrain-before-fab.glb'));
 const oldDraco=doc.getRoot().listExtensionsUsed().find(e=>e.extensionName==='KHR_draco_mesh_compression');
 if(oldDraco)oldDraco.dispose();
 const library=await io.read(path.join(ROOT,'modelSources/processed/fir-library.glb'));
 const root=doc.getRoot().listNodes().find(node=>node.getName()==='Portal landscape instances');
 const treeNodes=doc.getRoot().listNodes().filter(node=>['tree.001','平面.003'].includes(node.getMesh()?.getName()));
 const records=[];
 for(const node of treeNodes){
  const batch=node.getExtension('EXT_mesh_gpu_instancing');
  const t=batch.getAttribute('TRANSLATION'),r=batch.getAttribute('ROTATION'),s=batch.getAttribute('SCALE');
  for(let i=0;i<t.getCount();i++)records.push({t:Array.from(t.getArray().slice(i*3,i*3+3)),r:Array.from(r.getArray().slice(i*4,i*4+4)),s:Array.from(s.getArray().slice(i*3,i*3+3)),close:node.getMesh().getName()==='tree.001'});
  node.dispose();
 }
 if(records.length!==200)throw new Error('Unexpected source tree placement count');
 for(const extension of library.getRoot().listExtensionsUsed())doc.createExtension(extension.constructor);
 for(const node of library.getRoot().listNodes())if(node.getMesh())node.getMesh().setName(node.getName());
 const copied=copyToDocument(doc,library,library.getRoot().listMeshes());
 const meshes=new Map(library.getRoot().listMeshes().map(mesh=>[mesh.getName(),copied.get(mesh)]));
 const groups=new Map();
 records.forEach((record,index)=>{
  const [x,,z]=record.t;
  const near=record.close||x>-25&&x<45&&Math.abs(z)<55&&record.s[0]>.45;
  const middle=x<100&&Math.abs(z)<75&&record.s[0]>.4;
  const lod=near?0:middle?2:3;
  const name=`fir-${'abc'[index%3]}-lod${lod}`;
  if(!groups.has(name))groups.set(name,[]);groups.get(name).push(record);
 });
 const extension=doc.createExtension(EXTMeshGPUInstancing).setRequired(true);
 const buffer=doc.getRoot().listBuffers()[0];const summary=[];
 for(const [name,items]of groups){
  const batch=extension.createInstancedMesh();
  for(const [semantic,key,type]of [['TRANSLATION','t','VEC3'],['ROTATION','r','VEC4'],['SCALE','s','VEC3']]){
   batch.setAttribute(semantic,doc.createAccessor(`${name}-${semantic}`).setType(type).setArray(new Float32Array(items.flatMap(item=>item[key]))).setBuffer(buffer));
  }
  root.addChild(doc.createNode(name).setMesh(meshes.get(name)).setExtension('EXT_mesh_gpu_instancing',batch));
  const faces=meshes.get(name).listPrimitives().reduce((n,p)=>n+p.getIndices().getCount()/3,0);
  summary.push({name,instances:items.length,trianglesPerInstance:faces,effectiveTriangles:faces*items.length});
 }
 // A small, reusable alpha-card clump, instanced on flat grass verges only.
 const grassDoc=await io.read(path.join(ROOT,'modelSources/processed/fab-grass-clump.glb'));
 for(const material of grassDoc.getRoot().listMaterials())material.setAlphaMode('MASK').setAlphaCutoff(.4).setDoubleSided(true);
 const grassSource=grassDoc.getRoot().listMeshes()[0];
 const grassMesh=copyToDocument(doc,grassDoc,[grassSource]).get(grassSource).setName('fab-grass-clump');
 const grassItems=[];
 let seed=27012026;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<576;i++){
  const x=-112+random()*101,sign=i%2?1:-1;
  const y=i<384?sign*(22+random()*17):sign*(4.5+random()*1.2);
  if(i>=384&&x>-57&&x<-43)continue; // Keep the substation pad clear.
  const angle=random()*Math.PI*2,size=.8+random()*.6;
  grassItems.push({t:[x,-.105,-y],r:[0,Math.sin(angle/2),0,Math.cos(angle/2)],s:[size,size,size]});
 }
 const grassBatch=extension.createInstancedMesh();
 for(const [semantic,key,type]of [['TRANSLATION','t','VEC3'],['ROTATION','r','VEC4'],['SCALE','s','VEC3']])grassBatch.setAttribute(semantic,doc.createAccessor(`grass-${semantic}`).setType(type).setArray(new Float32Array(grassItems.flatMap(item=>item[key]))).setBuffer(buffer));
 root.addChild(doc.createNode('Fab verge grass').setMesh(grassMesh).setExtension('EXT_mesh_gpu_instancing',grassBatch));
 // Drop unused old vegetation data, retaining registered instance attributes.
 await doc.transform(prune(),unpartition());
 const output=path.join(ROOT,'modelSources/processed/portal-terrain-fir-uncompressed.glb');
 await io.write(output,doc);
 const report={source:'src/assets/modelAssets/legacy/portal-terrain-before-fab.glb',trees:records.length,groups:summary,
  treeEffectiveTriangles:summary.reduce((n,g)=>n+g.effectiveTriangles,0),grassClumps:grassItems.length,grassTrianglesPerClump:132};
 fs.writeFileSync(path.join(ROOT,'docs/fab-replacement/landscape.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
