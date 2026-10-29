// node --experimental-strip-types scripts/sculpt-portal-cliff.cjs SOURCE.glb OUTPUT.glb
// Changes cliff relief only; openings, ground, textures and instance transforms stay intact.
const fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const cli=process.env.PATH.split(path.delimiter).map(dir=>path.join(dir,'gltf-transform')).find(p=>fs.existsSync(p));
if(!cli)throw new Error('Run with the glTF Transform CLI on PATH');
const tool=createRequire(fs.realpathSync(cli));
const {NodeIO}=tool('@gltf-transform/core');
const {ALL_EXTENSIONS,KHRDracoMeshCompression}=tool('@gltf-transform/extensions');
const codec=tool('draco3dgltf');
const [source,output]=process.argv.slice(2);
if(!source||!output||path.resolve(source)===path.resolve(output))throw new Error('Provide separate source and output paths');
(async()=>{
  const {cliffRelief}=await import('../src/engines/portalFinishLayout.ts');
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await codec.createDecoderModule(),'draco3d.encoder':await codec.createEncoderModule()});
  const doc=await io.read(source);
  const mesh=doc.getRoot().listMeshes().find(mesh=>mesh.getName()==='Sculpted mountain with two excavated bores');
  const primitive=mesh.listPrimitives().find(primitive=>primitive.getMaterial().getName().startsWith('Limestone'));
  const positions=primitive.getAttribute('POSITION').getArray(),oldNormals=primitive.getAttribute('NORMAL').getArray();
  let moved=0;
  for(let i=0;i<positions.length;i+=3){
    if(positions[i]>8||oldNormals[i]>-.15)continue;
    const displacement=cliffRelief(-positions[i+2],positions[i+1]);
    if(displacement>.001){positions[i]-=displacement;moved++;}
  }
  const indices=primitive.getIndices().getArray(),normals=new Float32Array(positions.length);
  for(let i=0;i<indices.length;i+=3){
    const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
    const u=[0,1,2].map(j=>positions[b+j]-positions[a+j]),v=[0,1,2].map(j=>positions[c+j]-positions[a+j]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    for(const vertex of [a,b,c])for(let j=0;j<3;j++)normals[vertex+j]+=n[j];
  }
  for(let i=0;i<normals.length;i+=3){const length=Math.hypot(normals[i],normals[i+1],normals[i+2]);for(let j=0;j<3;j++)normals[i+j]=length?normals[i+j]/length:oldNormals[i+j];}
  primitive.getAttribute('NORMAL').setArray(normals);
  doc.getRoot().listExtensionsUsed().find(extension=>extension.extensionName==='KHR_draco_mesh_compression').setEncoderOptions({method:KHRDracoMeshCompression.EncoderMethod.SEQUENTIAL,quantizationBits:{POSITION:16,NORMAL:10,COLOR:8}});
  await io.write(output,doc);console.log('Cliff vertices with relief:',moved);
})().catch(error=>{console.error(error);process.exitCode=1});
