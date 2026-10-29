// @env browser
import portalLamps from '../config/portalLamps.json'
import { addPortalStreetlights, streetlightHead } from './portalStreetlights'
import { modelAssetUrl } from './modelAssets'
import {
  Axis, Cartesian2, Cartesian3, Cartographic, ClippingPolygon, Material, MaterialAppearance,
  CustomShader, UniformType, ComponentDatatype, Geometry, GeometryAttribute, GeometryAttributes, GeometryInstance, GeometryPipeline,
  Matrix3, Matrix4, Model, Primitive, PrimitiveType, TextureUniform,
  BoundingSphere, sampleTerrainMostDetailed, Transforms,
} from 'cesium'
import { portalImagery } from './portalImagery'
import type { Viewer } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import type { SceneDevice, SystemsState } from './tunnelSystemsState'
import { PORTAL_EXTENSION, tunnelPoint } from './tunnelDetails'

// These dimensions match scripts/build-portal-site.py, in metres.
function mountainHeight(x: number, y: number): number {
  if (x < 0) return -0.08
  const side = Math.max(0, 1 - (Math.abs(y) / 100) ** 2)
  return 1.8 + side * (15 + 30 * Math.sin(Math.PI * x / 440)
    + 3 * Math.sin(x * 0.065 + y * 0.08) + 1.8 * Math.sin(y * 0.22 + x * 0.12))
}

export async function addPortalSite(viewer: Viewer, survey: TunnelSurvey, end: 0 | 1 = 0, progress?: (resource:string)=>void) {
  const origin = tunnelPoint(survey, 0, end === 0 ? -PORTAL_EXTENSION : survey.length + PORTAL_EXTENSION, 12)
  const rotation = Matrix3.multiply(Matrix3.fromRotationY(-Math.atan(survey.grade / 100)),
    Matrix3.fromRotationZ(end * Math.PI), new Matrix3())
  const frame = Matrix4.multiply(
    Transforms.eastNorthUpToFixedFrame(origin),
    Matrix4.fromRotationTranslation(rotation),
    new Matrix4(),
  )
  const inverse = Matrix4.inverse(frame, new Matrix4())
  const world = (p: Cartesian3) => Matrix4.multiplyByPoint(frame, p, new Cartesian3())
  progress?.(`${end===0?'西':'东'}洞口影像`)
  const imagery=await portalImagery(viewer.imageryLayers.get(0).imageryProvider,frame)
  const corners = [[-180, -100], [220, -100], [220, 100], [-180, 100]]
  const outerCorners = [[-240, -180], [320, -180], [320, 180], [-240, 180]]
  const points: {x:number;y:number;innerHeight:number;t:number}[]=[]
  const segments=32,rings=12,perimeter=segments*4
  for(let ring=0;ring<=rings;ring++) for(let edge=0;edge<4;edge++) for(let part=0;part<segments;part++) {
    const t=ring/rings,q=part/segments,a=corners[edge]!,b=corners[(edge+1)%4]!,c=outerCorners[edge]!,d=outerCorners[(edge+1)%4]!
    const x=a[0]!+(b[0]!-a[0]!)*q,y=a[1]!+(b[1]!-a[1]!)*q
    points.push({x:x*(1-t)+(c[0]!+(d[0]!-c[0]!)*q)*t,y:y*(1-t)+(c[1]!+(d[1]!-c[1]!)*q)*t,innerHeight:mountainHeight(x,y),t})
  }
  const samples=points.map(p=>Cartographic.fromCartesian(world(new Cartesian3(p.x,p.y,0))))
  await sampleTerrainMostDetailed(viewer.terrainProvider,samples,true)
  if(samples.some(p=>!Number.isFinite(p.height)))throw new Error('洞口周边地形采样不完整，请重试')
  const vertices:number[]=[],indices:number[]=[],uv:number[]=[]
  points.forEach((p,i)=>{
    const sample=samples[i]!,terrain=Matrix4.multiplyByPoint(inverse,Cartesian3.fromRadians(sample.longitude,sample.latitude,sample.height),new Cartesian3())
    const t=Math.min(1,p.t/.8),blend=t*t*(3-2*t)
    vertices.push(p.x,p.y,p.innerHeight*(1-blend)+(terrain.z+.35)*blend)
    uv.push(...imagery.uv(sample))
    if(i>=perimeter){const a=i-perimeter,b=Math.floor(i/perimeter)*perimeter+(i+1)%perimeter;indices.push(a,i,b,a,b,b-perimeter)}
  })
  const attributes: GeometryAttributes & {blend?: GeometryAttribute} = new GeometryAttributes()
  attributes.position = new GeometryAttribute({ componentDatatype: ComponentDatatype.DOUBLE,
    componentsPerAttribute: 3, values: new Float64Array(vertices) })
  attributes.st = new GeometryAttribute({ componentDatatype: ComponentDatatype.FLOAT, componentsPerAttribute: 2, values: new Float32Array(uv) })
  attributes.blend = new GeometryAttribute({componentDatatype:ComponentDatatype.FLOAT,componentsPerAttribute:1,
    values:new Float32Array(points.map(p=>p.t))})
  const geometry = GeometryPipeline.computeNormal(new Geometry({
    attributes,
    indices: new Uint16Array(indices), primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.fromVertices(vertices),
  }))
  const groundMaterial = new Material({fabric:{type:'PortalSatellite',uniforms:{image:imagery.image},
    source:`in float v_blend;
    czm_material czm_getMaterial(czm_materialInput inputValue) {
      czm_material m=czm_getDefaultMaterial(inputValue);
      float coverage=1.0-smoothstep(0.82,1.0,v_blend);
      float noise=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
      if(coverage<noise)discard;
      m.diffuse=vec3(0.0);m.emission=czm_srgbToLinear(texture(image,inputValue.st).rgb);
      m.alpha=1.0;return m;
    }`},translucent:false})
  const transition = new Primitive({
    geometryInstances: new GeometryInstance({ geometry, modelMatrix: frame }),
    appearance: new MaterialAppearance({ material: groundMaterial, materialSupport: MaterialAppearance.MaterialSupport.TEXTURED,
      vertexShaderSource:MaterialAppearance.MaterialSupport.TEXTURED.vertexShaderSource
        .replace('in vec2 st;', 'in vec2 st;\nin float blend;\nout float v_blend;')
        .replace('v_st = st;', 'v_st = st; v_blend=blend;'),
      translucent: false, closed: false, faceForward: true }),
    asynchronous: false, compressVertices: false,
  })
  progress?.('洞口地形采样与过渡网格')
  const models = await Promise.all(['terrain', 'structures', 'substation-new', 'finishes'].map(part => Model.fromGltfAsync({
    url: modelAssetUrl(part==='substation-new'?part:`portal-${part}`),
    modelMatrix: part==='substation-new'?Matrix4.multiplyByTranslation(frame,new Cartesian3(-50,0,.14),new Matrix4()):frame,
    // Blender exports Y-up with X along the alignment. Skip Cesium's Z-forward rotation.
    upAxis: Axis.Y, forwardAxis: Axis.X,
    id:part==='structures'?`portal-structures:${end}`:part==='substation-new'?`substation-${end+1}`:undefined,
    enableVerticalExaggeration: false,
    allowPicking:part!=='finishes',
  }).then(model=>{progress?.(`portal-${part}.glb 已加载`);return model})))
  const mountain = models[0]!, structures = models[1]!
  // Keep daylight fill independent of the clock-driven atmosphere's brightness.
  mountain.imageBasedLighting.sphericalHarmonicCoefficients = Array.from({length:9},(_,index) =>
    index===0 ? new Cartesian3(0.8,0.84,0.9) : new Cartesian3())
  const structureFill=models.slice(1).map(model=>({model,daylight:model.imageBasedLighting.sphericalHarmonicCoefficients}))
  mountain.customShader=new CustomShader({uniforms:{
    u_map:{type:UniformType.SAMPLER_2D,value:new TextureUniform({url:imagery.image})},
    u_inverse:{type:UniformType.MAT4,value:inverse},u_mapU:{type:UniformType.VEC3,value:imagery.u},u_mapV:{type:UniformType.VEC3,value:imagery.v},
  },fragmentShaderText:`void fragmentMain(FragmentInput fsInput,inout czm_modelMaterial material) {
    vec3 local=(u_inverse*vec4(fsInput.attributes.positionWC,1.0)).xyz;
    vec2 uv=vec2(dot(u_mapU,vec3(local.xy,1.0)),dot(u_mapV,vec3(local.xy,1.0)));
    float edge=max(smoothstep(50.0,99.0,abs(local.y)),max(smoothstep(150.0,219.0,local.x),smoothstep(110.0,179.0,-local.x)));
    material.diffuse*=vec3(0.98,1.0,0.97);
    material.diffuse*=1.0-edge;material.emissive+=czm_srgbToLinear(texture(u_map,uv).rgb)*edge;
  }`})
  const devices=portalLamps.map((lamp,index):SceneDevice=>{
    const tube=(lamp.y<0?0:1)^end
    return {id:`street-${end*portalLamps.length+index+1}`,kind:'street',tube,station:end===0?-PORTAL_EXTENSION+lamp.x:survey.length+PORTAL_EXTENSION-lamp.x,lateral:0,height:8,portalEnd:end,
      position:world(streetlightHead(lamp)),pickId:`portal-structures:${end}/${lamp.node}`}
  })
  const lampUniforms=Object.fromEntries(portalLamps.map((_,index)=>[`u_lamp${index}`,{type:UniformType.FLOAT,value:0}]))
  const lighting = new CustomShader({ uniforms: {...lampUniforms,u_inverseSite:{type:UniformType.MAT4,value:inverse},u_street:{type:UniformType.FLOAT,value:0},u_day:{type:UniformType.FLOAT,value:1}},
    fragmentShaderText: `void fragmentMain(FragmentInput fsInput,inout czm_modelMaterial material) {
      material.diffuse *= mix(0.6,1.0,u_day);
      vec3 local=(u_inverseSite*vec4(fsInput.attributes.positionWC,1.0)).xyz;
      float power=u_street;
      ${portalLamps.map((lamp,index)=>`if(abs(local.x-(${lamp.x.toFixed(2)}))<3.0&&abs(local.y-(${lamp.y.toFixed(2)}))<5.0)power=u_lamp${index};`).join('\n')}
      if (length(material.emissive)>0.05 && material.emissive.g>material.emissive.r*0.7) {
        material.diffuse=mix(vec3(0.055,0.065,0.075),vec3(1.0,0.94,0.78),power);
        material.roughness=0.28;
        material.emissive=vec3(1.0,0.86,0.58)*power*6.0;
      }
    }` })
  structures.customShader=lighting
  models[2]!.customShader=lighting
  models[3]!.customShader=lighting
  viewer.scene.primitives.add(transition)
  viewer.scene.primitives.add(mountain)
  viewer.scene.primitives.add(structures)
  viewer.scene.primitives.add(models[2]!)
  viewer.scene.primitives.add(models[3]!)
  const streetlights=addPortalStreetlights(viewer,frame,portalLamps,devices,(index,power)=>lighting.setUniform(`u_lamp${index}`,power))
  const excavation = new ClippingPolygon({
    // Leave an overlap with the globe outside the cut, so the edge can feather out.
    positions: outerCorners.map(([x,y],i)=>world(new Cartesian3(corners[i]![0]!*.2+x!*.8,corners[i]![1]!*.2+y!*.8,0))),
  })
  return {
    excavation,frame,structures,substation:models[2]!,dispose:streetlights.dispose,
    devices,
    isReady:()=>Cartesian3.distance(viewer.camera.positionWC,origin)>500||models.every(model=>model.ready),
    setLighting(state: SystemsState) {
      // Night is an inspection view: retain sky fill so terrain and foliage remain readable.
      const skyLight=state.environment==='night' ? 0.65 : state.environment==='fog' ? 0.7 : 1
      mountain.imageBasedLighting.imageBasedLightingFactor=new Cartesian2(skyLight,skyLight)
      for(const {model,daylight} of structureFill){
        model.imageBasedLighting.sphericalHarmonicCoefficients=state.environment==='day'?daylight:mountain.imageBasedLighting.sphericalHarmonicCoefficients
        model.imageBasedLighting.imageBasedLightingFactor=new Cartesian2(skyLight,skyLight)
      }
      streetlights.setLighting(state)
      lighting.setUniform('u_street',Number(state.street))
      lighting.setUniform('u_day',Number(state.environment==='day'))
    },
    setUnderground(enabled: boolean) {
      streetlights.setVisible(!enabled)
      mountain.show = !enabled
      transition.show = !enabled
      models[3]!.show = !enabled
    },
  }
}
