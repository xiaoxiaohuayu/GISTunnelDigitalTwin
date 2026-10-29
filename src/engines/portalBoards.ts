import { Cartesian3, Color, Matrix4, Matrix3, Quaternion, Transforms, BoundingSphere, ComponentDatatype, Geometry, GeometryAttribute, GeometryAttributes, GeometryInstance, GeometryPipeline, Material, MaterialAppearance, Primitive, PrimitiveType } from 'cesium'
import type { Viewer } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import type { PortalSignConfig } from '../types/scene'
import { tunnelPoint, PORTAL_EXTENSION } from './tunnelDetails'
import { defaultPortalSign, portalSignImage, readPortalSign } from './portalSignConfig'

export async function addPortalBoards(viewer:Viewer,survey:TunnelSurvey) {
  let config=defaultPortalSign(),storageWarning=''
  try{config=await readPortalSign()}catch(error){storageWarning=String(error)}
  let image:HTMLCanvasElement
  try{image=await portalSignImage(config,survey.length)}catch{config=defaultPortalSign();image=await portalSignImage(config,survey.length);storageWarning='已恢复默认标牌，原图片无法读取'}
  const materials:Material[]=[]
  for(const tube of [0,1]) {
    const direction=tube===0?1:-1,station=tube===0?-PORTAL_EXTENSION-35:survey.length+PORTAL_EXTENSION+35
    const center=tunnelPoint(survey,tube,station,tube===0?-4.8:4.8,0)
    const frame=Transforms.eastNorthUpToFixedFrame(center)
    const world=(x:number,y:number,z:number)=>Matrix4.multiplyByPoint(frame,new Cartesian3(x,y,z),new Cartesian3())
    const outer=-direction,poleY=outer*2.25
    viewer.entities.add({id:`portal-sign:${tube}:post`,position:world(.18*direction,poleY,4.65),cylinder:{length:9.3,topRadius:.105,bottomRadius:.14,material:Color.SILVER}})
    const armEnd=-outer*1.25,armOrientation=Quaternion.fromRotationMatrix(Matrix3.multiply(Matrix4.getMatrix3(frame,new Matrix3()),Matrix3.fromRotationX(Math.PI/2),new Matrix3()))
    for(const z of [6.65,8.35])viewer.entities.add({id:`portal-sign:${tube}:arm:${z}`,position:world(.18*direction,(poleY+armEnd)/2,z),orientation:armOrientation,cylinder:{length:Math.abs(poleY-armEnd),topRadius:.065,bottomRadius:.065,material:Color.SILVER}})
    viewer.entities.add({id:`portal-sign:${tube}:back`,position:world(0,0,7.475),box:{dimensions:new Cartesian3(.14,3.8,2.85),material:Color.fromCssColorString('#77847c')}})
    const material=new Material({fabric:{type:'PortalBoard',uniforms:{image: image.toDataURL()},source:`czm_material czm_getMaterial(czm_materialInput materialInput) {czm_material m=czm_getDefaultMaterial(materialInput);m.diffuse=texture(image,materialInput.st).rgb*.35;m.emission=texture(image,materialInput.st).rgb*.65;return m;}`},translucent:false});materials.push(material)
    const corners=direction===1?[[1.9,6.05],[-1.9,6.05],[-1.9,8.9],[1.9,8.9]]:[[-1.9,6.05],[1.9,6.05],[1.9,8.9],[-1.9,8.9]]
    const positions=corners.flatMap(([y,z])=>{const p=world(-direction*.081,y!,z!);return [p.x,p.y,p.z]})
    const attributes=new GeometryAttributes()
    attributes.position=new GeometryAttribute({componentDatatype:ComponentDatatype.DOUBLE,componentsPerAttribute:3,values:new Float64Array(positions)})
    attributes.st=new GeometryAttribute({componentDatatype:ComponentDatatype.FLOAT,componentsPerAttribute:2,values:new Float32Array([0,0,1,0,1,1,0,1])})
    const geometry=GeometryPipeline.computeNormal(new Geometry({attributes,indices:new Uint16Array([0,1,2,0,2,3]),primitiveType:PrimitiveType.TRIANGLES,boundingSphere:BoundingSphere.fromVertices(positions)}))
    viewer.scene.primitives.add(new Primitive({asynchronous:false,compressVertices:false,geometryInstances:new GeometryInstance({id:`portal-sign:${tube}`,geometry}),appearance:new MaterialAppearance({material,materialSupport:MaterialAppearance.MaterialSupport.TEXTURED,closed:false,faceForward:true})}))
  }
  return {config,storageWarning,async update(next:PortalSignConfig){const canvas=await portalSignImage(next,survey.length);for(const material of materials)material.uniforms.image=canvas.toDataURL();viewer.scene.requestRender()}}
}
