import { portalPosition } from './portalPosition'
import { portalLateral, portalAlong } from './portalGeometry'
import { surveyFrame } from './projectSurvey'
import { BoundingSphere, Cartesian3, Color, ComponentDatatype, Geometry, GeometryAttribute, GeometryAttributes, GeometryInstance, GeometryPipeline, Material, MaterialAppearance, Matrix3, Matrix4, Primitive, PrimitiveType, Quaternion } from 'cesium'
import type { Viewer } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import type { TrafficSignsConfig } from '../types/scene'
import { PORTAL_EXTENSION, tunnelPoint } from './tunnelDetails'
import { defaultTrafficSigns, readTrafficSigns, trafficSignImage } from './trafficSignConfig'

export async function addPortalTrafficSigns(viewer:Viewer,survey:TunnelSurvey) {
  let config=defaultTrafficSigns(),warning=''
  try{config=await readTrafficSigns()}catch(error){warning=String(error)}
  let images:string[]
  try{images=await Promise.all(config.images.map((image,index)=>trafficSignImage(index,image)))}catch{config=defaultTrafficSigns();images=await Promise.all(config.images.map((image,index)=>trafficSignImage(index,image)));warning='原交通标志图片无法读取，已显示默认图片'}
  const materials:{material:Material;index:number}[]=[]
  for(const end of [0,1]) {
    const beforeEntities=new Set(viewer.entities.values),beforePrimitives=new Set(Array.from({length:viewer.scene.primitives.length},(_,i)=>viewer.scene.primitives.get(i)))
    const origin=survey.actualPointAt?survey.actualPointAt(0,end===0?-PORTAL_EXTENSION:survey.length+PORTAL_EXTENSION,survey.project!.bores[0]!.offset,0):tunnelPoint(survey,0,end===0?-PORTAL_EXTENSION:survey.length+PORTAL_EXTENSION,12)
    const rotation=Matrix3.multiply(Matrix3.fromRotationY(-Math.atan(survey.grade/100)),Matrix3.fromRotationZ(end*Math.PI),new Matrix3())
    const frame=Matrix4.multiply(surveyFrame(survey,origin),Matrix4.fromRotationTranslation(rotation),new Matrix4())
    const world=(x:number,y:number,z:number)=>Matrix4.multiplyByPoint(frame,new Cartesian3(x+(survey.project?portalAlong(survey.project,end,-12):0),y+(survey.project?portalLateral(survey.project,end,-12)+12:0),z),new Cartesian3())
    const orientation=(axis:Cartesian3,angle:number)=>Quaternion.fromRotationMatrix(Matrix3.multiply(Matrix4.getMatrix3(frame,new Matrix3()),Matrix3.fromQuaternion(Quaternion.fromAxisAngle(axis,angle)),new Matrix3()))
    viewer.entities.add({position:world(-35.82,-18.3,3.8),orientation:orientation(Cartesian3.UNIT_Z,0),cylinder:{length:7.4,topRadius:.095,bottomRadius:.095,material:Color.SILVER}})
    viewer.entities.add({position:world(-35.82,-13.85,6.95),orientation:orientation(Cartesian3.UNIT_X,Math.PI/2),cylinder:{length:8.9,topRadius:.075,bottomRadius:.075,material:Color.SILVER}})
    for(const [index,y] of [-10.4,-12,-13.6].entries()) {
      const id=`portal-traffic:${index}:${end}`
      viewer.entities.add({id:`${id}:back`,position:world(-35.97,y,6.95),orientation:orientation(Cartesian3.UNIT_Y,Math.PI/2),cylinder:{length:.08,topRadius:.65,bottomRadius:.65,material:Color.SILVER}})
      const material=new Material({fabric:{type:'EditableTrafficSign',uniforms:{image:images[index]!,level:1},source:`czm_material czm_getMaterial(czm_materialInput materialInput) {if(distance(materialInput.st,vec2(.5))>.5)discard;czm_material m=czm_getDefaultMaterial(materialInput);vec3 c=texture(image,materialInput.st).rgb;m.diffuse=c*.65*level;m.emission=c*.35*level;return m;}`},translucent:false});materials.push({material,index})
      const positions=[[y+.65,6.3],[y-.65,6.3],[y-.65,7.6],[y+.65,7.6]].flatMap(([lateral,z])=>{const p=world(-36.025,lateral!,z!);return [p.x,p.y,p.z]})
      const attributes=new GeometryAttributes();attributes.position=new GeometryAttribute({componentDatatype:ComponentDatatype.DOUBLE,componentsPerAttribute:3,values:new Float64Array(positions)});attributes.st=new GeometryAttribute({componentDatatype:ComponentDatatype.FLOAT,componentsPerAttribute:2,values:new Float32Array([0,0,1,0,1,1,0,1])})
      const geometry=GeometryPipeline.computeNormal(new Geometry({attributes,indices:new Uint16Array([0,1,2,0,2,3]),primitiveType:PrimitiveType.TRIANGLES,boundingSphere:BoundingSphere.fromVertices(positions)}))
      viewer.scene.primitives.add(new Primitive({asynchronous:false,compressVertices:false,geometryInstances:new GeometryInstance({id,geometry}),appearance:new MaterialAppearance({material,materialSupport:MaterialAppearance.MaterialSupport.TEXTURED,faceForward:true,closed:false})}))
    }
    await portalPosition(viewer,`traffic:${end}`,frame,viewer.entities.values.filter(e=>!beforeEntities.has(e)),Array.from({length:viewer.scene.primitives.length},(_,i)=>viewer.scene.primitives.get(i)).filter(p=>!beforePrimitives.has(p)))
  }
  return {config,warning,async update(next:TrafficSignsConfig){const images=await Promise.all(next.images.map((image,index)=>trafficSignImage(index,image)));for(const {material,index} of materials)material.uniforms.image=images[index];viewer.scene.requestRender()},setLighting(day:boolean){for(const {material} of materials)material.uniforms.level=day?1:.35}}
}
