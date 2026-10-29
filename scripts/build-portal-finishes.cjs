// node --experimental-strip-types scripts/build-portal-finishes.cjs
// Reuses supplied stone textures, simplifying only the new detail copies.
const fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const cli=process.env.PATH.split(path.delimiter).map(dir=>path.join(dir,'gltf-transform')).find(p=>fs.existsSync(p));
if(!cli)throw new Error('Run with the glTF Transform CLI on PATH');
const tool=createRequire(fs.realpathSync(cli));
const {Document,NodeIO}=tool('@gltf-transform/core');
const {ALL_EXTENSIONS,EXTMeshGPUInstancing}=tool('@gltf-transform/extensions');
const {copyToDocument,simplify,unpartition,prune}=tool('@gltf-transform/functions');
const codec=tool('draco3dgltf');
const ROOT=path.resolve(__dirname,'..');
(async()=>{
  const {MeshoptSimplifier}=await import(tool.resolve('meshoptimizer'));
  await MeshoptSimplifier.ready;
  const {portalFinishLayout}=await import('../src/engines/portalFinishLayout.ts');
  const {boxes,rocks}=portalFinishLayout();
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await codec.createDecoderModule()});
  const source=await io.read(path.join(ROOT,'src/assets/modelAssets/portal/portal-terrain.glb'));
  const doc=new Document();
  for(const extension of source.getRoot().listExtensionsUsed())if(extension.extensionName!=='KHR_draco_mesh_compression')doc.createExtension(extension.constructor);
  const stoneMeshes=source.getRoot().listMeshes().filter(mesh=>mesh.getName().startsWith('stone_small_'));
  const copied=copyToDocument(doc,source,stoneMeshes);
  const stones=stoneMeshes.map(mesh=>copied.get(mesh));
  for(const material of doc.getRoot().listMaterials())material.setBaseColorFactor([.62,.65,.6,1]);
  await doc.transform(simplify({simplifier:MeshoptSimplifier,ratio:.045,error:.015}),unpartition());
  const buffer=doc.getRoot().listBuffers()[0],scene=doc.createScene('Portal civil details');
  const extension=doc.createExtension(EXTMeshGPUInstancing).setRequired(true);
  let triangleBudget=0;
  function batch(name,mesh,items){
    const instance=extension.createInstancedMesh();
    for(const [semantic,key,type]of [['TRANSLATION','t','VEC3'],['ROTATION','r','VEC4'],['SCALE','s','VEC3']])instance.setAttribute(semantic,doc.createAccessor(`${name}-${semantic}`).setType(type).setArray(new Float32Array(items.flatMap(item=>item[key]))).setBuffer(buffer));
    scene.addChild(doc.createNode(name).setMesh(mesh).setExtension('EXT_mesh_gpu_instancing',instance));
    triangleBudget+=items.length*mesh.listPrimitives().reduce((n,p)=>n+p.getIndices().getCount()/3,0);
  }
  stones.forEach((mesh,index)=>batch(`Cliff and toe stone ${index}`,mesh,rocks.filter(rock=>rock.template===index).map(rock=>({t:[rock.position[0],rock.position[2],-rock.position[1]],s:[rock.scale[0],rock.scale[1],rock.scale[2]],r:[0,Math.sin(rock.angle/2),0,Math.cos(rock.angle/2)]}))));
  const colors={shoulder:[.29,.3,.25],channel:[.08,.10,.09],concrete:[.42,.44,.39],joint:[.12,.15,.13],metal:[.36,.4,.38]};
  const positions=[],normals=[],indices=[];
  for(const [normal,u,v]of [[[1,0,0],[0,1,0],[0,0,1]],[[-1,0,0],[0,0,1],[0,1,0]],[[0,1,0],[0,0,1],[1,0,0]],[[0,-1,0],[1,0,0],[0,0,1]],[[0,0,1],[1,0,0],[0,1,0]],[[0,0,-1],[0,1,0],[1,0,0]]]){
    const base=positions.length/3;
    for(const [a,b]of [[-1,-1],[1,-1],[1,1],[-1,1]]){positions.push(...normal.map((n,i)=>(n+a*u[i]+b*v[i])*.5));normals.push(...normal);}
    indices.push(base,base+1,base+2,base,base+2,base+3);
  }
  const attribute=(name,type,data)=>doc.createAccessor(name).setType(type).setArray(new Float32Array(data)).setBuffer(buffer);
  const position=attribute('Unit block positions','VEC3',positions),normal=attribute('Unit block normals','VEC3',normals);
  const index=doc.createAccessor('Unit block triangles').setType('SCALAR').setArray(new Uint16Array(indices)).setBuffer(buffer);
  for(const [name,color]of Object.entries(colors)){
    const material=doc.createMaterial(name).setBaseColorFactor([...color,1]).setRoughnessFactor(name==='metal'?.52:.94).setMetallicFactor(name==='metal'?.65:0);
    const primitive=doc.createPrimitive().setAttribute('POSITION',position).setAttribute('NORMAL',normal).setIndices(index).setMaterial(material);
    const mesh=doc.createMesh(name).addPrimitive(primitive);
    batch(name,mesh,boxes.filter(box=>box.material===name).map(box=>({t:[box.position[0],box.position[2],-box.position[1]],s:[box.size[0],box.size[2],box.size[1]],r:[0,0,0,1]})));
  }
  if(triangleBudget>40000)throw new Error(`Detail budget exceeded: ${triangleBudget}`);
  await doc.transform(prune());
  doc.getRoot().setExtras({trianglesPerPortal:triangleBudget,stones:rocks.length,blocks:boxes.length});
  const output=path.join(ROOT,'src/assets/modelAssets/portal/portal-finishes.glb');
  await io.write(output,doc);
  console.log(JSON.stringify({output,trianglesPerPortal:triangleBudget,stones:rocks.length,blocks:boxes.length}));
})().catch(error=>{console.error(error);process.exitCode=1});
