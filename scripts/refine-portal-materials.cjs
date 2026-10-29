// Use the cached glTF Transform CLI SDK, as in assemble-fab-landscape.cjs.
// node scripts/refine-portal-materials.cjs SOURCE.glb OUTPUT.glb
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

const variation=(x,y)=>.5+.24*Math.sin(x*.14+y*.09)+.16*Math.sin(x*.043-y*.17)+.1*Math.sin(x*.31+y*.27);
const hill=(x,y)=>1.8+Math.max(0,1-(Math.abs(y)/100)**2)*(15+30*Math.sin(Math.PI*x/440)+3*Math.sin(x*.065+y*.08)+1.8*Math.sin(y*.22+x*.12));
const clamp=x=>Math.max(0,Math.min(1,x));
function color(x,y,z,rock) {
  const noise=variation(x,y);
  if(!rock){const shade=.74+.26*noise;return [shade*.96,shade,shade*.9,1];}
  const strata=.82+.1*Math.sin(z*1.9+y*.08)+.08*Math.sin(z*.63-y*.045);
  const damp=1-.2*Math.exp(-Math.max(0,z)/1.8);
  const moss=clamp(1-(hill(Math.max(0,x),y)-z)/2.8)*.35;
  const shade=(.78+.22*noise)*strata*damp;
  return [shade*(1-moss*.28),shade*(.98+moss*.05),shade*(.9-moss*.14),1];
}

(async()=>{
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder':await codec.createDecoderModule(),
    'draco3d.encoder':await codec.createEncoderModule(),
  });
  const doc=await io.read(source),buffer=doc.getRoot().listBuffers()[0];
  const accessor=(name,type,data)=>doc.createAccessor(name).setType(type).setArray(new Float32Array(data)).setBuffer(buffer);
  for(const mesh of doc.getRoot().listMeshes()) {
    if(!['Sculpted mountain with two excavated bores','立方体'].includes(mesh.getName()))continue;
    for(const primitive of mesh.listPrimitives()) {
      const rock=primitive.getMaterial().getName().startsWith('Limestone');
      let positions=Array.from(primitive.getAttribute('POSITION').getArray());
      if(mesh.getName()==='立方体') {
        // Give the broad approach enough vertices for metre-scale colour changes.
        const normals=Array.from(primitive.getAttribute('NORMAL').getArray());
        const uvs=Array.from(primitive.getAttribute('TEXCOORD_0').getArray());
        const indices=Array.from(primitive.getIndices().getArray());
        const top=Math.max(...positions.filter((_,i)=>i%3===1)),kept=[];
        for(let i=0;i<indices.length;i+=3){const face=indices.slice(i,i+3);if(!face.every(v=>Math.abs(positions[v*3+1]-top)<.001))kept.push(...face);}
        const start=positions.length/3,nx=45,nz=50;
        for(let i=0;i<=nx;i++)for(let j=0;j<=nz;j++){
          const x=-90+i*4,z=-100+j*4;
          positions.push(x,top,z);normals.push(0,1,0);uvs.push((x-90)/4,z/4);
          if(i<nx&&j<nz){const a=start+i*(nz+1)+j,b=a+nz+1;kept.push(a,b+1,b,a,a+1,b+1);}
        }
        primitive.setAttribute('POSITION',accessor('Approach positions','VEC3',positions));
        primitive.setAttribute('NORMAL',accessor('Approach normals','VEC3',normals));
        primitive.setAttribute('TEXCOORD_0',accessor('Approach UV metres','VEC2',uvs));
        primitive.setIndices(doc.createAccessor('Approach triangles').setType('SCALAR').setArray(new Uint16Array(kept)).setBuffer(buffer));
      }
      const colors=[];
      for(let i=0;i<positions.length;i+=3){
        const x=positions[i]-(mesh.getName()==='立方体'?90:0),y=-positions[i+2],z=positions[i+1];
        colors.push(...color(x,y,z,rock));
      }
      primitive.setAttribute('COLOR_0',accessor('Portal weathering','VEC4',colors));
    }
  }
  // Keep tree/grass placements and textures; only the two terrain meshes change.
  doc.getRoot().listExtensionsUsed().find(extension=>extension.extensionName==='KHR_draco_mesh_compression')
    .setEncoderOptions({method:KHRDracoMeshCompression.EncoderMethod.SEQUENTIAL,quantizationBits:{POSITION:16,NORMAL:10,COLOR:8}});
  await io.write(output,doc);
  console.log('Refined terrain materials:',output);
})().catch(error=>{console.error(error);process.exitCode=1});
