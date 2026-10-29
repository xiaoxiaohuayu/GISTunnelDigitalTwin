import { BoundingSphere, Cartesian2, Cartesian3, ComponentDatatype, Geometry, GeometryAttribute, GeometryAttributes, GeometryInstance, Material, MaterialAppearance, Matrix4, Primitive, PrimitiveType } from 'cesium'
import type { Viewer } from 'cesium'
import { vmsWidth, vmsHeight } from './vmsDisplay'

export function ledPlane(viewer: Viewer, matrix: Matrix4, x: number, z: number, width: number, height: number, image: string, back = false, id?: string, vms = false) {
  const positions: number[] = []
  const center=Matrix4.multiplyByTranslation(matrix,new Cartesian3(x,0,z),new Matrix4())
  const inverseCenter=Matrix4.inverse(center,new Matrix4())
  const normal=Matrix4.multiplyByPointAsVector(matrix,new Cartesian3(back?1:-1,0,0),new Cartesian3())
  for (const [y,h] of [[width/2,-height/2],[-width/2,-height/2],[-width/2,height/2],[width/2,height/2]]) {
    const p=Matrix4.multiplyByPoint(matrix,new Cartesian3(x,y!,z+h!),new Cartesian3()); positions.push(p.x,p.y,p.z)
  }
  const material = new Material({ fabric: { type: vms?'TunnelVMS':'TunnelLED', uniforms: vms?{image,contentSize:new Cartesian2(vmsWidth,vmsHeight),offset:new Cartesian2(),screenSize:new Cartesian2(vmsWidth,vmsHeight),dots:0}:{image}, source: vms?`
    czm_material czm_getMaterial(czm_materialInput materialInput) {
      czm_material m=czm_getDefaultMaterial(materialInput);
      vec2 pixel=vec2(materialInput.st.s,1.0-materialInput.st.t)*screenSize;
      vec2 cell=floor(pixel/4.0)*4.0+2.0;
      vec2 point=mix(pixel,cell,dots);
      vec2 uv=(point-offset)/contentSize;
      vec3 ink=vec3(0.0);
      if(uv.x>=0.0 && uv.x<=1.0 && uv.y>=0.0 && uv.y<=1.0)ink=texture(image,vec2(uv.x,1.0-uv.y)).rgb;
      float lamp=1.0-smoothstep(1.25,1.7,length(pixel-cell));
      m.diffuse=vec3(0.0); m.emission=ink*mix(1.0,lamp,dots); m.alpha=1.0; return m;
    }`: `
    czm_material czm_getMaterial(czm_materialInput materialInput) {
      czm_material m=czm_getDefaultMaterial(materialInput);
      m.diffuse=vec3(0.0); m.emission=texture(image,materialInput.st).rgb*1.3; m.alpha=1.0; return m;
    }` }, translucent: false })
  const attributes=new GeometryAttributes()
  attributes.position=new GeometryAttribute({componentDatatype:ComponentDatatype.DOUBLE,componentsPerAttribute:3,values:new Float64Array(positions)})
  attributes.st=new GeometryAttribute({componentDatatype:ComponentDatatype.FLOAT,componentsPerAttribute:2,values:new Float32Array([0,0,1,0,1,1,0,1])})
  attributes.normal=new GeometryAttribute({componentDatatype:ComponentDatatype.FLOAT,componentsPerAttribute:3,values:new Float32Array(Array(4).fill([normal.x,normal.y,normal.z]).flat())})
  const primitive=viewer.scene.primitives.add(new Primitive({ asynchronous: false, compressVertices: false,
    geometryInstances: new GeometryInstance({ id, geometry: new Geometry({ attributes,
      indices: new Uint16Array(back?[0,2,1,0,3,2]:[0,1,2,0,2,3]),primitiveType:PrimitiveType.TRIANGLES,boundingSphere:BoundingSphere.fromVertices(positions),
    }) }), appearance:new MaterialAppearance({ material, materialSupport:MaterialAppearance.MaterialSupport.TEXTURED,faceForward:false,closed:true }),
  }))
  return {material,resize(nextWidth:number,nextHeight:number) {
    primitive.modelMatrix=Matrix4.multiply(Matrix4.multiplyByScale(center,new Cartesian3(1,nextWidth/width,nextHeight/height),new Matrix4()),inverseCenter,new Matrix4())
  }}
}

