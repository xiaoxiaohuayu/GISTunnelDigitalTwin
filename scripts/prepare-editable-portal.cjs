// Preserve the archived source. Decode only the civil meshes; vegetation remains instanced.
const fs=require('node:fs'),path=require('node:path');
const draco=require(require.resolve('draco3d',{paths:[path.dirname(require.resolve('@cesium/engine',{paths:[path.dirname(require.resolve('cesium'))]}))]}));
async function main(){
 const root=path.join(__dirname,'../src/assets/modelAssets');
 const find=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?find(path.join(dir,e.name)):[path.join(dir,e.name)]);
 const source=find(root).find(p=>p.endsWith('/portal-terrain.glb')),raw=fs.readFileSync(source),n=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+n)),chunks=[raw.subarray(n+28)];let size=chunks[0].length;
 const module=await draco.createDecoderModule({}),decoder=new module.Decoder();
 function append(data,accessor){const padding=(4-size%4)%4;if(padding){chunks.push(Buffer.alloc(padding));size+=padding}const bytes=Buffer.from(data.buffer,data.byteOffset,data.byteLength),view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:size,byteLength:bytes.length});chunks.push(bytes);size+=bytes.length;Object.assign(accessor,{bufferView:view,byteOffset:0});}
 for(const node of doc.nodes.filter(n=>n.name==='Sculpted mountain with two excavated bores'||n.name==='terrain / Poliigon_GrassPatchyGround_4585'))for(const primitive of doc.meshes[node.mesh].primitives){
  const extension=primitive.extensions?.KHR_draco_mesh_compression;if(!extension)continue;
  const view=doc.bufferViews[extension.bufferView],buffer=new module.DecoderBuffer(),mesh=new module.Mesh();buffer.Init(new Int8Array(chunks[0].subarray(view.byteOffset,view.byteOffset+view.byteLength)),view.byteLength);
  const status=decoder.DecodeBufferToMesh(buffer,mesh);if(!status.ok())throw Error(status.error_msg());
  for(const [semantic,id] of Object.entries(extension.attributes)){const accessor=doc.accessors[primitive.attributes[semantic]],attr=decoder.GetAttributeByUniqueId(mesh,id),values=new module.DracoFloat32Array();decoder.GetAttributeFloatForAllPoints(mesh,attr,values);const data=Float32Array.from({length:values.size()},(_,i)=>values.GetValue(i));accessor.componentType=5126;append(data,accessor);module.destroy(values);}
  const values=new module.DracoInt32Array(),indices=new Uint32Array(mesh.num_faces()*3);for(let f=0;f<mesh.num_faces();f++){decoder.GetFaceFromMesh(mesh,f,values);for(let i=0;i<3;i++)indices[f*3+i]=values.GetValue(i)}const accessor=doc.accessors[primitive.indices];accessor.componentType=5125;append(indices,accessor);delete primitive.extensions.KHR_draco_mesh_compression;module.destroy(values);module.destroy(mesh);module.destroy(buffer);
 }
 module.destroy(decoder);doc.buffers[0].byteLength=size;const json=Buffer.from(JSON.stringify(doc)),padded=Math.ceil(json.length/4)*4,bin=Buffer.concat(chunks),result=Buffer.alloc(28+padded+bin.length,32);result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);result.writeUInt32LE(padded,12);result.writeUInt32LE(0x4e4f534a,16);json.copy(result,20);result.writeUInt32LE(bin.length,20+padded);result.writeUInt32LE(0x004e4942,24+padded);bin.copy(result,28+padded);const output=path.join(path.dirname(source),'portal-terrain-editable.glb');fs.writeFileSync(output,result);console.log(output,result.length);
}
main().catch(e=>{console.error(e);process.exitCode=1});
