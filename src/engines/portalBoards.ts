import { portalPosition } from './portalPosition'
import { boreLength } from './projectConfig'
import { boreIndices, surveyFrame } from './projectSurvey'
import { Cartesian3, Color, Matrix4, Matrix3, Quaternion, BoundingSphere, ComponentDatatype, Geometry, GeometryAttribute, GeometryAttributes, GeometryInstance, GeometryPipeline, Material, MaterialAppearance, Primitive, PrimitiveType } from 'cesium'
import type { Viewer } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import type { PortalSignConfig } from '../types/scene'
import { tunnelPoint, PORTAL_EXTENSION } from './tunnelDetails'
import { defaultPortalSign, portalSignImage, readPortalSign } from './portalSignConfig'

export async function addPortalBoards(viewer:Viewer,survey:TunnelSurvey) {
  let config=defaultPortalSign(),storageWarning=''
  try{config=await readPortalSign()}catch(error){storageWarning=String(error)}
  if(survey.project)config={...config,name:survey.project.name}
  try{await portalSignImage(config,survey.length)}catch{config=defaultPortalSign();storageWarning='已恢复默认标牌，原图片无法读取'}
  const materials:{material:Material;length:number}[]=[]
  const entrances=survey.project?survey.project.bores.flatMap((b,tube)=>[...new Set(b.lanes.map(l=>l.direction))].map(direction=>({tube,direction}))):boreIndices(survey).map(tube=>({tube,direction:tube===0?1:-1}))
  for(const {tube,direction} of entrances) {
    const beforeEntities=new Set(viewer.entities.values),beforePrimitives=new Set(Array.from({length:viewer.scene.primitives.length},(_,i)=>viewer.scene.primitives.get(i)))
    const id=`${tube}:${direction}`,length=survey.project?boreLength(survey.project.bores[tube]!):survey.length,station=direction===1?-PORTAL_EXTENSION-35:length+PORTAL_EXTENSION+35
    const center=tunnelPoint(survey,tube,station,direction===1?-4.8:4.8,0)
    const frame=surveyFrame(survey,center)
    const world=(x:number,y:number,z:number)=>Matrix4.multiplyByPoint(frame,new Cartesian3(x,y,z),new Cartesian3())
    const outer=-direction,poleY=outer*2.25
    viewer.entities.add({id:`portal-sign:${id}:post`,position:world(.18*direction,poleY,4.65),cylinder:{length:9.3,topRadius:.105,bottomRadius:.14,material:Color.SILVER}})
    const armEnd=-outer*1.25,armOrientation=Quaternion.fromRotationMatrix(Matrix3.multiply(Matrix4.getMatrix3(frame,new Matrix3()),Matrix3.fromRotationX(Math.PI/2),new Matrix3()))
    for(const z of [6.65,8.35])viewer.entities.add({id:`portal-sign:${id}:arm:${z}`,position:world(.18*direction,(poleY+armEnd)/2,z),orientation:armOrientation,cylinder:{length:Math.abs(poleY-armEnd),topRadius:.065,bottomRadius:.065,material:Color.SILVER}})
    viewer.entities.add({id:`portal-sign:${id}:back`,position:world(0,0,7.475),box:{dimensions:new Cartesian3(.14,3.8,2.85),material:Color.fromCssColorString('#77847c')}})
    const boardImage=await portalSignImage(config,length)
    const material=new Material({fabric:{type:'PortalBoard',uniforms:{image: boardImage.toDataURL()},source:`czm_material czm_getMaterial(czm_materialInput materialInput) {czm_material m=czm_getDefaultMaterial(materialInput);m.diffuse=texture(image,materialInput.st).rgb*.35;m.emission=texture(image,materialInput.st).rgb*.65;return m;}`},translucent:false});materials.push({material,length})
    const corners=direction===1?[[1.9,6.05],[-1.9,6.05],[-1.9,8.9],[1.9,8.9]]:[[-1.9,6.05],[1.9,6.05],[1.9,8.9],[-1.9,8.9]]
    const positions=corners.flatMap(([y,z])=>{const p=world(-direction*.081,y!,z!);return [p.x,p.y,p.z]})
    const attributes=new GeometryAttributes()
    attributes.position=new GeometryAttribute({componentDatatype:ComponentDatatype.DOUBLE,componentsPerAttribute:3,values:new Float64Array(positions)})
    attributes.st=new GeometryAttribute({componentDatatype:ComponentDatatype.FLOAT,componentsPerAttribute:2,values:new Float32Array([0,0,1,0,1,1,0,1])})
    const geometry=GeometryPipeline.computeNormal(new Geometry({attributes,indices:new Uint16Array([0,1,2,0,2,3]),primitiveType:PrimitiveType.TRIANGLES,boundingSphere:BoundingSphere.fromVertices(positions)}))
    viewer.scene.primitives.add(new Primitive({asynchronous:false,compressVertices:false,geometryInstances:new GeometryInstance({id:`portal-sign:${id}`,geometry}),appearance:new MaterialAppearance({material,materialSupport:MaterialAppearance.MaterialSupport.TEXTURED,closed:false,faceForward:true})}))
    await portalPosition(viewer,`board:${direction===1?0:1}`,frame,viewer.entities.values.filter(e=>!beforeEntities.has(e)),Array.from({length:viewer.scene.primitives.length},(_,i)=>viewer.scene.primitives.get(i)).filter(p=>!beforePrimitives.has(p)))
  }
  return {get config(){return config},storageWarning,async update(next:PortalSignConfig){config=next;for(const {material,length} of materials){const canvas=await portalSignImage(next,length);material.uniforms.image=canvas.toDataURL()};viewer.scene.requestRender()}}
}
