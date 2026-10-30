import type { TunnelProject } from './projectConfig'

export function portalAlong(project:TunnelProject,end:number,y:number):number {
  if(end===0||project.bores.length===1)return 0
  const lengths=project.bores.map(b=>Math.abs(b.end-b.start)),longest=Math.max(...lengths)
  const t=Math.max(0,Math.min(1,(y+.5)))
  return (longest-lengths[1]!)*(1-t)+(longest-lengths[0]!)*t
}

/** Deform only baked civil geometry. Instanced lamps/vegetation retain their size. */
export function portalLateral(project:TunnelProject,end:number,y:number):number {
  const source=y<0?0:1,tube=project.bores.length===1?0:source^end,b=project.bores[tube]!
  const center=(source===0?-12:12),local=y-center,half=b.lanes.length*b.laneWidth/2
  const mapped=Math.abs(local)<=4.3?local*half/4.3:local+Math.sign(local)*(half-4.3)
  return (end===0?-b.offset:b.offset)+mapped
}
export async function portalGeometryUrl(url:string,project:TunnelProject|undefined,end:number):Promise<string>{
  if(!project||!url.includes('portal-structures')&&project.bores.length===2&&project.bores.every((b,i)=>b.offset===(i===0?12:-12)&&b.lanes.length*b.laneWidth===8.6)&&Math.abs(project.bores[0]!.end-project.bores[0]!.start)===Math.abs(project.bores[1]!.end-project.bores[1]!.start))return url
  const bytes=await (await fetch(url)).arrayBuffer(),view=new DataView(bytes),jsonLength=view.getUint32(12,true)
  const gltf=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,jsonLength))),binaryOffset=28+jsonLength
  const extra:Uint8Array[]=[]
  let binaryLength=bytes.byteLength-binaryOffset
  const changed=new Set<number>()
  for(const node of gltf.nodes){
    const instancing=node.extensions?.EXT_mesh_gpu_instancing
    if(instancing){const accessor=gltf.accessors[instancing.attributes.TRANSLATION];if(accessor){const buffer=gltf.bufferViews[accessor.bufferView],start=binaryOffset+(buffer.byteOffset??0)+(accessor.byteOffset??0),stride=buffer.byteStride??12;for(let i=0;i<accessor.count;i++){const offset=start+i*stride;const y=-view.getFloat32(offset+8,true);view.setFloat32(offset,view.getFloat32(offset,true)+portalAlong(project,end,y),true);view.setFloat32(offset+8,-portalLateral(project,end,y),true)}}continue}
    if(node.translation){node.translation[0]+=portalAlong(project,end,-node.translation[2]);node.translation[2]=-portalLateral(project,end,-node.translation[2]);continue}
    if(node.mesh===undefined)continue
    for(const primitive of gltf.meshes[node.mesh].primitives){
      const index=primitive.attributes.POSITION;if(changed.has(index))continue;changed.add(index)
      const accessor=gltf.accessors[index],buffer=gltf.bufferViews[accessor.bufferView]
      if(!buffer)continue
      if(accessor.componentType!==5126)throw new Error('洞口顶点格式不支持')
      const stride=buffer.byteStride??12,start=binaryOffset+(buffer.byteOffset??0)+(accessor.byteOffset??0)
      const single=project.bores.length===1,sourceYs=Array.from({length:accessor.count},(_,i)=>-view.getFloat32(start+i*stride+8,true))
      // Translate each disconnected constructed part as a rigid component along
      // the route. A shared material mesh can contain both portals and the pad.
      const alongByVertex=new Float64Array(accessor.count)
      if(end===1&&project.bores.length===2&&primitive.indices!==undefined){
        const indices=gltf.accessors[primitive.indices],ib=gltf.bufferViews[indices.bufferView]
        if(ib){
          const parent=Int32Array.from({length:accessor.count},(_,i)=>i),root=(v:number):number=>{while(parent[v]!==v){parent[v]=parent[parent[v]!]!;v=parent[v]!}return v}
          const offset=binaryOffset+(ib.byteOffset??0)+(indices.byteOffset??0),size=indices.componentType===5125?4:indices.componentType===5123?2:1
          const read=(i:number)=>size===4?view.getUint32(offset+i*size,true):size===2?view.getUint16(offset+i*size,true):view.getUint8(offset+i)
          for(let i=0;i<indices.count;i+=3){const a=root(read(i));parent[root(read(i+1))]=a;parent[root(read(i+2))]=a}
          const sums=new Map<number,{sum:number;count:number}>()
          sourceYs.forEach((y,i)=>{const key=root(i),value=sums.get(key)??{sum:0,count:0};value.sum+=y;value.count++;sums.set(key,value)})
          sourceYs.forEach((_,i)=>{const value=sums.get(root(i))!;alongByVertex[i]=portalAlong(project,end,value.sum/value.count)})
        }
      }
      // Remove the inner pair of guardrails and drain channels, not whole shared meshes.
      if(primitive.indices!==undefined){
        const indices={...gltf.accessors[primitive.indices]},ib=gltf.bufferViews[indices.bufferView]
        if(ib){const offset=binaryOffset+(ib.byteOffset??0)+(indices.byteOffset??0),size=indices.componentType===5125?4:2,read=(i:number)=>size===4?view.getUint32(offset+i*size,true):view.getUint16(offset+i*size,true),kept:number[]=[]
          for(let i=0;i<indices.count;i+=3){const face=[read(i),read(i+1),read(i+2)];const removed=face.every(v=>{const at=start+v*stride,x=view.getFloat32(at,true),h=view.getFloat32(at+4,true),y=sourceYs[v]!;return x>=-58.51&&x<=-41.49&&Math.abs(y)<=4.51&&h>=-.041&&h<=.141})||face.every(v=>{const at=start+v*stride,x=view.getFloat32(at,true),h=view.getFloat32(at+4,true),y=Math.abs(sourceYs[v]!);return x< -2&&x> -175&&h>=.914&&h<=1.066&&(Math.abs(y-7.08)<.025||Math.abs(y-16.92)<.025)});if(removed)continue;if(single&&(node.name?.includes('Lettering')?face.every(v=>sourceYs[v]!>0):face.every(v=>Math.abs(sourceYs[v]!)<11.99)&&face.every(v=>{const x=view.getFloat32(start+v*stride,true);return x>-120&&x<160})))continue;kept.push(...face)}
          if(kept.length!==indices.count){if(!kept.length)kept.push(0,0,0);gltf.accessors.push(indices);primitive.indices=gltf.accessors.length-1;const data=new Uint32Array(kept);gltf.bufferViews.push({buffer:0,byteOffset:binaryLength,byteLength:data.byteLength});indices.bufferView=gltf.bufferViews.length-1;indices.byteOffset=0;indices.componentType=5125;indices.count=kept.length;indices.min=[kept.reduce((min,i)=>Math.min(min,i),Infinity)];indices.max=[accessor.count-1];extra.push(new Uint8Array(data.buffer));binaryLength+=data.byteLength}
        }
      }
      const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity]
      for(let i=0;i<accessor.count;i++){
        const offset=start+i*stride,y=sourceYs[i]!
        // A single bore joins the two outside half profiles at their centreline.
        let along=alongByVertex[i]!
        let z=node.name?.includes("Lettering")?-(y+portalLateral(project,end,y<0?-12:12)-(y<0?-12:12)):project.bores.length===1&&Math.abs(y)<12?-(end===0?-project.bores[0].offset:project.bores[0].offset): -portalLateral(project,end,y)
        // Leave the terrain perimeter fixed so it still meets the satellite skirt.
        if(node.name==='Sculpted mountain with two excavated bores'||node.name==='terrain / Poliigon_GrassPatchyGround_4585'){
          const x=view.getFloat32(offset,true),weight=Math.max(0,Math.min(1,(100-Math.abs(y))/50,(220-x)/60,(180+x)/60))
          z=-y+(z+y)*weight;along=portalAlong(project,end,y)*weight
        }
        view.setFloat32(offset,view.getFloat32(offset,true)+along,true)
        view.setFloat32(offset+8,z,true)
        for(let c=0;c<3;c++){const n=view.getFloat32(offset+c*4,true);min[c]=Math.min(min[c]!,n);max[c]=Math.max(max[c]!,n)}
      }
      accessor.min=min;accessor.max=max
    }
  }
  gltf.buffers[0].byteLength=binaryLength
  const encoded=new TextEncoder().encode(JSON.stringify(gltf)),padded=Math.ceil(encoded.length/4)*4,bin=new Uint8Array(binaryLength),result=new ArrayBuffer(28+padded+bin.length),out=new DataView(result)
  bin.set(new Uint8Array(bytes,binaryOffset));let cursor=bytes.byteLength-binaryOffset;for(const chunk of extra){bin.set(chunk,cursor);cursor+=chunk.length}
  out.setUint32(0,0x46546c67,true);out.setUint32(4,2,true);out.setUint32(8,result.byteLength,true);out.setUint32(12,padded,true);out.setUint32(16,0x4e4f534a,true)
  new Uint8Array(result,20,padded).fill(32);new Uint8Array(result,20,encoded.length).set(encoded);out.setUint32(20+padded,bin.length,true);out.setUint32(24+padded,0x004e4942,true);new Uint8Array(result,28+padded).set(bin)
  return URL.createObjectURL(new Blob([result],{type:'model/gltf-binary'}))
}
