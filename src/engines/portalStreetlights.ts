import {
  BillboardCollection, BlendOption, BoundingSphere, Cartesian3, Color, ComponentDatatype,
  DistanceDisplayCondition, Geometry, GeometryAttribute, GeometryAttributes, GeometryInstance, GeometryPipeline,
  Material, MaterialAppearance, Matrix4, NearFarScalar, Primitive, PrimitiveType,
} from 'cesium'
import type { Viewer } from 'cesium'
import { deviceEnabled } from './tunnelSystemsState.ts'
import type { SceneDevice, SystemsState } from './tunnelSystemsState.ts'

// Centre of the supplied streetlight's emissive mesh, converted from glTF Y-up.
export function streetlightHead(lamp:{x:number;y:number}):Cartesian3 {
  const road=lamp.y<0?-12:12
  return new Cartesian3(lamp.x,lamp.y+Math.sign(road-lamp.y)*1.137836,7.812475)
}
export function advanceLampPower(current:number,target:number,elapsedMs:number):number {
  const step=Math.max(0,elapsedMs)/420
  return current<target?Math.min(target,current+step):Math.max(target,current-step)
}

export function addPortalStreetlights(viewer:Viewer,frame:Matrix4,lamps:{x:number;y:number}[],devices:SceneDevice[],applyPower:(index:number,power:number)=>void) {
  const image=document.createElement('canvas');image.width=64;image.height=64
  const ctx=image.getContext('2d')!,gradient=ctx.createRadialGradient(32,32,0,32,32,32)
  gradient.addColorStop(0,'rgba(255,250,230,1)');gradient.addColorStop(.12,'rgba(255,239,196,.8)');gradient.addColorStop(.4,'rgba(255,215,150,.2)');gradient.addColorStop(1,'rgba(255,215,150,0)')
  ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64)
  const halos=viewer.scene.primitives.add(new BillboardCollection({blendOption:BlendOption.TRANSLUCENT})) as BillboardCollection
  const powers=lamps.map(()=>0),targets=lamps.map(()=>0)
  const bulbs=lamps.map((lamp,index)=>halos.add({id:devices[index]!.id,
    position:Matrix4.multiplyByPoint(frame,streetlightHead(lamp),new Cartesian3()),image,width:1.35,height:1.35,sizeInMeters:true,
    color:new Color(1,.92,.74,0),show:false,scaleByDistance:new NearFarScalar(12,1,230,.55),distanceDisplayCondition:new DistanceDisplayCondition(0,260)}))
  const vertices:number[]=[],uv:number[]=[],lampIds:number[]=[],indices:number[]=[]
  lamps.forEach((lamp,index)=>{
    const head=streetlightHead(lamp),road=lamp.y<0?-12:12,center=head.y+Math.sign(road-head.y)*2.2
    const low=Math.max(road-5.45,center-4.2),high=Math.min(road+5.45,center+4.2),base=vertices.length/3
    for(const [x,y]of [[lamp.x-8,low],[lamp.x+8,low],[lamp.x+8,high],[lamp.x-8,high]]){
      const point=Matrix4.multiplyByPoint(frame,new Cartesian3(x,y,.225),new Cartesian3())
      vertices.push(point.x,point.y,point.z);uv.push((x!-lamp.x)/8,(y!-center)/4.2);lampIds.push(index)
    }
    indices.push(base,base+1,base+2,base,base+2,base+3)
  })
  const attributes:GeometryAttributes & {lampIndex?:GeometryAttribute}=new GeometryAttributes()
  attributes.position=new GeometryAttribute({componentDatatype:ComponentDatatype.DOUBLE,componentsPerAttribute:3,values:new Float64Array(vertices)})
  attributes.st=new GeometryAttribute({componentDatatype:ComponentDatatype.FLOAT,componentsPerAttribute:2,values:new Float32Array(uv)})
  attributes.lampIndex=new GeometryAttribute({componentDatatype:ComponentDatatype.FLOAT,componentsPerAttribute:1,values:new Float32Array(lampIds)})
  const geometry=GeometryPipeline.computeNormal(new Geometry({attributes,indices:new Uint16Array(indices),primitiveType:PrimitiveType.TRIANGLES,boundingSphere:BoundingSphere.fromVertices(vertices)}))
  const material=new Material({fabric:{type:'PortalStreetlightPools',uniforms:{u_night:0,...Object.fromEntries(lamps.map((_,i)=>[`u_power${i}`,0]))},source:`
    in float v_lampIndex;
    czm_material czm_getMaterial(czm_materialInput inputValue) {
      czm_material m=czm_getDefaultMaterial(inputValue);
      float power=0.0;
      ${lamps.map((_,i)=>`${i?'else ':''}if(v_lampIndex<${i+.5})power=u_power${i};`).join('\n')}
      float radius=dot(inputValue.st,inputValue.st);
      float falloff=pow(max(0.0,1.0-radius),2.0);
      m.diffuse=vec3(0.0);m.emission=vec3(1.0,0.86,0.62);
      m.alpha=falloff*power*u_night*0.32;
      if(m.alpha<0.002)discard;
      return m;
    }`},translucent:true})
  const pools=viewer.scene.primitives.add(new Primitive({geometryInstances:new GeometryInstance({geometry}),
    appearance:new MaterialAppearance({material,materialSupport:MaterialAppearance.MaterialSupport.TEXTURED,
      vertexShaderSource:MaterialAppearance.MaterialSupport.TEXTURED.vertexShaderSource
        .replace('in vec2 st;','in vec2 st;\nin float lampIndex;\nout float v_lampIndex;')
        .replace('v_st = st;','v_st = st; v_lampIndex=lampIndex;'),
      translucent:true,closed:false,faceForward:true}),asynchronous:false,compressVertices:false,allowPicking:false})) as Primitive
  let night=0,visible=true,previous=performance.now()
  function render(index:number):void {
    const power=powers[index]!
    applyPower(index,power);material.uniforms[`u_power${index}`]=power
    bulbs[index]!.color=new Color(1,.92,.74,power*(night>.5?.8:.55));bulbs[index]!.show=visible&&power>.001
  }
  const removeTick=viewer.scene.preUpdate.addEventListener(()=>{
    const now=performance.now(),elapsed=Math.min(100,now-previous);previous=now
    let moving=false
    powers.forEach((power,index)=>{
      if(power===targets[index])return
      powers[index]=advanceLampPower(power,targets[index]!,elapsed);render(index);moving=true
    })
    if(moving)viewer.scene.requestRender()
  })
  return {
    setLighting(state:SystemsState){
      night=state.environment==='night'?1:state.environment==='fog'?.45:0
      material.uniforms.u_night=night
      const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
      devices.forEach((device,index)=>{targets[index]=Number(deviceEnabled(device,state));if(reduced)powers[index]=targets[index]!;render(index)})
      pools.show=visible&&night>0;previous=performance.now();viewer.scene.requestRender()
    },
    setVisible(enabled:boolean){visible=enabled;halos.show=enabled;pools.show=enabled&&night>0;bulbs.forEach((bulb,index)=>{bulb.show=enabled&&powers[index]!>.001})},
    dispose:removeTick,
  }
}
