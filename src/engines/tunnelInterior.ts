import { layoutPassages,projectLayByWidth,projectStations } from './facilityLayout'
import { boreIndices, surveyFrame } from './projectSurvey'
import { basicSpacing } from './sectionProfile'
import { lightSampleRange, sampleLights, sampleLightingShader, sampleUniforms, SAMPLE_LIGHT_LIMIT } from './tunnelLightSample'
import { addTunnelContactOcclusion } from './tunnelContactOcclusion'
// @env browser
import {
  BoundingSphere, Cartesian3, Cartesian4, Matrix4, ComponentDatatype, Geometry, GeometryAttribute, GeometryAttributes,
  GeometryInstance, GeometryPipeline, Material, MaterialAppearance, Primitive, PrimitiveType,
} from 'cesium'
import type { Viewer } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import { tunnelPoint } from './tunnelDetails'
import {  initialSystems, illuminationAt } from './tunnelSystemsState'
import type { SceneDevice, SystemsState } from './tunnelSystemsState'

const lightingShader = `
float tunnelLight(float s) {
  float inside = step(-60.0,s) * step(s,u_length+60.0);
  float period = mix(16.0,8.0,step(1.5,u_basic));
  float distanceToLamp = abs(mod(s+50.0+period*0.5,period)-period*0.5);
  float pool = exp(-distanceToLamp*distanceToLamp/32.0);
  float basic = step(0.5,u_basic) * (0.30+0.36*pool);
  float zone = max(step(-60.0,s)*step(s,-10.0),step(u_length+10.0,s)*step(s,u_length+60.0));
  float enhanced = u_enhanced*zone*0.36;
  float depth = max(0.0,min(s+60.0,u_length+60.0-s));
  float spill = exp(-depth/19.0)*mix(0.06,0.7,u_day);
  float exterior = mix(0.025,0.82,u_day) + u_street*0.3;
  float adjustment=(texture(u_deviceLight,vec2(clamp((s+240.0)/(u_length+480.0),0.0,1.0),0.5)).r-128.0/255.0)*255.0/127.0;
  return clamp(mix(exterior,min(1.0,0.012+basic+enhanced+spill),inside)+adjustment,0.012,1.0);
}
`

// Reconstruct the UV frame from geometry derivatives; this also supports mirrored walls.
// Local lamp shading deliberately uses the existing illumination field, not the globe sun.
const surfaceLightingShader = `
mat3 tunnelFrame(czm_materialInput inputValue) {
  vec3 n = normalize(inputValue.normalEC);
  vec3 px = dFdx(-inputValue.positionToEyeEC), py = dFdy(-inputValue.positionToEyeEC);
  vec2 tx = dFdx(inputValue.st), ty = dFdy(inputValue.st);
  vec3 t = cross(py,n)*tx.x + cross(n,px)*ty.x;
  vec3 b = cross(py,n)*tx.y + cross(n,px)*ty.y;
  t *= inversesqrt(max(dot(t,t),0.00000001));
  b *= inversesqrt(max(dot(b,b),0.00000001));
  return mat3(t,b,n);
}
vec3 shadeTunnel(czm_materialInput inputValue, czm_material material) {
  vec2 st = inputValue.st;
  float period = mix(16.0,8.0,step(1.5,u_basic));
  float along = period*0.5-mod(st.s+50.0+period*0.5,period);
#ifdef TUNNEL_WALL
  vec3 localLight = vec3(along,4.65-st.t,1.2);
#else
  vec3 localLight = vec3(along,sign(st.t)*4.2-st.t,4.45);
#endif
  mat3 frame = tunnelFrame(inputValue);
  vec3 light = normalize(frame*normalize(localLight));
  float inside = step(-60.0,st.s)*step(st.s,u_length+60.0);
  light = normalize(mix(czm_lightDirectionEC,light,inside));
  vec3 n = normalize(material.normal);
  float diffuse = max(dot(n,light),0.0);
  vec3 eye = normalize(inputValue.positionToEyeEC);
  vec3 halfVector = normalize(light+eye);
  float highlight = pow(max(dot(n,halfVector),0.0),material.shininess)*diffuse;
  float illumination = tunnelLight(st.s);
  return (material.diffuse*(0.52+0.58*diffuse) + material.specular*highlight)*illumination;
}
`

const surfaceFragmentShader = `
in vec3 v_positionEC;
in vec3 v_normalEC;
in vec2 v_st;
void main() {
  czm_materialInput inputValue;
  inputValue.normalEC = normalize(v_normalEC);
#ifdef FACE_FORWARD
  inputValue.normalEC = faceforward(inputValue.normalEC,normalize(v_positionEC),inputValue.normalEC);
#endif
  inputValue.positionToEyeEC = -v_positionEC;
  inputValue.st = v_st;
  czm_material material = czm_getMaterial(inputValue);
  out_FragColor = vec4(shadeLightSample(inputValue,material,shadeTunnel(inputValue,material)),material.alpha);
}
`

// Explicit gradients keep mip selection continuous across the repeated texture seams.
const textureShader = `
vec3 surfaceTexture(sampler2D image, vec2 uv) {
  return textureGrad(image,fract(uv),dFdx(uv),dFdy(uv)).rgb;
}
float surfaceJoint(float coordinate, float period, float width) {
  float distanceToJoint = abs(mod(coordinate+period*0.5,period)-period*0.5);
  float aa = max(fwidth(coordinate),0.001);
  return 1.0-smoothstep(width,width+aa,distanceToJoint);
}
`
const concreteShader = `
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  float sampleWeight = lightSampleWeight((u_eyeToSample*vec4(-materialInput.positionToEyeEC,1.0)).xyz);
  vec2 st = materialInput.st, uv = st/mix(4.2,3.2,sampleWeight);
  float joint = surfaceJoint(st.s,6.0,0.018);
  float panel = 1.0-smoothstep(2.40,2.44,st.t);
  float tiles = max(surfaceJoint(st.s,1.2,0.005),surfaceJoint(st.t,0.6,0.004));
  vec3 aggregate = surfaceTexture(u_image,uv);
  aggregate = mix(aggregate,mix(vec3(0.48,0.50,0.49),aggregate,0.28),sampleWeight);
  vec3 arm = surfaceTexture(u_arm,uv);
  vec3 normal = surfaceTexture(u_normal,uv)*2.0-1.0;
  normal.xy *= mix(mix(0.35,0.18,panel),mix(0.16,0.10,panel),sampleWeight);
  material.normal = normalize(tunnelFrame(materialInput)*normalize(normal));
  vec3 roof = mix(vec3(0.31,0.33,0.32),aggregate,mix(0.22,0.10,sampleWeight));
  vec3 color = mix(roof,aggregate-tiles*0.035,panel)-joint*0.065;
  float contact = mix(0.72,1.0,smoothstep(0.2,0.9,st.t));
  material.diffuse = color*mix(0.8,1.0,arm.r)*contact;
  material.specular = mix(0.025,0.12,panel)*(1.0-arm.g);
  material.shininess = mix(12.0,48.0,1.0-arm.g);
  material.alpha = 1.0;
  return material;
}`
const asphaltShader = `
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st, uv = st/4.0;
  vec3 arm = surfaceTexture(u_arm,uv);
  vec3 normal = surfaceTexture(u_normal,uv)*2.0-1.0;
  normal.xy *= 0.38;
  material.normal = normalize(tunnelFrame(materialInput)*normalize(normal));
  material.diffuse = surfaceTexture(u_image,uv)*mix(0.82,1.0,arm.r);
  material.specular = (1.0-arm.g)*0.09;
  material.shininess = mix(8.0,32.0,1.0-arm.g);
  material.alpha = 1.0;
  return material;
}`

const curbShader = `
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  float stripe = step(0.5,fract(materialInput.st.s*1.35 + materialInput.st.t*2.1));
  vec3 color = mix(vec3(0.035,0.04,0.035),vec3(0.84,0.59,0.08),stripe);
  material.diffuse = color;
  material.alpha = 1.0;
  return material;
}`

function neutralLightImage():string {
  const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='rgb(128 128 128)';ctx.fillRect(0,0,1,1);return canvas.toDataURL()
}

function surface(viewer: Viewer, positions: number[], uv: number[], indices: number[], shader: string, type: string, length: number, tube:number): { material: Material; primitive: Primitive; tube:number } {
  const attributes = new GeometryAttributes()
  attributes.position = new GeometryAttribute({ componentDatatype: ComponentDatatype.DOUBLE,
    componentsPerAttribute: 3, values: new Float64Array(positions) })
  attributes.st = new GeometryAttribute({ componentDatatype: ComponentDatatype.FLOAT,
    componentsPerAttribute: 2, values: new Float32Array(uv) })
  const geometry = GeometryPipeline.computeNormal(new Geometry({ attributes,
    indices: new Uint32Array(indices), primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.fromVertices(positions),
  }))
  const textureName = type === 'TunnelConcreteLining' ? 'wall' : type === 'TunnelAsphalt' ? 'asphalt' : null
  const textureUniforms = textureName ? {
    u_image: `${import.meta.env.BASE_URL}textures/${textureName}-diff.jpg`,
    u_arm: `${import.meta.env.BASE_URL}textures/${textureName}-arm.jpg`,
    u_normal: `${import.meta.env.BASE_URL}textures/${textureName}-normal.jpg`,
  } : {}
  const shading = (textureName !== 'asphalt' ? '#define TUNNEL_WALL\n' : '') + surfaceLightingShader + sampleLightingShader + (textureName ? textureShader : '')
  const material = new Material({ fabric: { type, source: lightingShader + shading + shader,
    uniforms: { ...textureUniforms, ...sampleUniforms(), u_deviceLight:neutralLightImage(),u_length: length, u_basic: 1, u_enhanced: 1, u_day: 1, u_street: 0 } }, translucent: false })
  const primitive = viewer.scene.primitives.add(new Primitive({ asynchronous: false, compressVertices: false,
    geometryInstances: new GeometryInstance({ geometry }),
    appearance: new MaterialAppearance({ material,
      fragmentShaderSource: surfaceFragmentShader,
      materialSupport: MaterialAppearance.MaterialSupport.TEXTURED, faceForward: true, closed: false }),
  }))
  return { material, primitive,tube }
}

export function addTunnelInterior(viewer: Viewer, survey: TunnelSurvey) {
  const materials: { material: Material; primitive: Primitive; tube:number }[] = []
  const walls: Primitive[] = []
  for (const tube of boreIndices(survey)) {
    const passages=layoutPassages(survey,tube)
    const outer = tube === 0 ? -1 : 1
    const stations = projectStations(survey,tube)
    const positions: number[] = [], uv: number[] = [], indices: number[] = []
    const cutPositions: number[] = [], cutUv: number[] = []
    // Traverse from right springer, across the crown, down to the left curb.
    const section = [[5.5, 0], [5.5, 2.5]]
    for (let i = 1; i <= 40; i++) {
      const a = i / 40 * Math.PI
      section.push([5.5 * Math.cos(a), 2.5 + 5.5 * Math.sin(a)])
    }
    section.push([-5.5, 0])
    const baseCount = stations.length * section.length
    stations.forEach((station, row) => {
      const width = projectLayByWidth(station,survey,tube)
      section.forEach(([y, z], column) => {
        const lateral = y! + outer * width * (1 + outer * y! / 5.5) / 2
        const point = tunnelPoint(survey, tube, station, lateral, z!)
        positions.push(point.x, point.y, point.z)
        uv.push(station, z!)
        if (row === 0 || column === 0) return
        const mid = (station + stations[row - 1]!) / 2
        const vertical = column === 1 || column === section.length - 1
        const side = column === 1 ? 1 : -1
        const inner = side === -outer
        const innerArch = (section[column]![0]! + section[column-1]![0]!) * -outer > 7
        const a = (row - 1) * section.length + column - 1, b = row * section.length + column - 1
        const passage = ((vertical && inner) || innerArch)
          ? passages.find(p => Math.abs(mid-p.station) < p.halfWidth) : undefined
        if (!passage) {
          indices.push(a, b, a + 1, a + 1, b, b + 1)
          return
        }
        // Clip the lining to the arched opening rather than removing rectangular panels.
        const archHeight = (s: number) => passage.height + passage.archRise * Math.sqrt(Math.max(0,1-((s-passage.station)/passage.halfWidth)**2))
        const polygon = [a,b,b+1,a+1].map(index => ({ index, distance: uv[index*2+1]! - archHeight(uv[index*2]!) }))
        const clipped: number[] = []
        for (let i=0;i<polygon.length;i++) {
          const current=polygon[i]!, next=polygon[(i+1)%polygon.length]!
          if(current.distance>=0)clipped.push(current.index)
          if((current.distance>=0)!==(next.distance>=0)) {
            const t=current.distance/(current.distance-next.distance)
            const index=baseCount+cutPositions.length/3
            for(let axis=0;axis<3;axis++)cutPositions.push(positions[current.index*3+axis]!*(1-t)+positions[next.index*3+axis]!*t)
            for(let axis=0;axis<2;axis++)cutUv.push(uv[current.index*2+axis]!*(1-t)+uv[next.index*2+axis]!*t)
            clipped.push(index)
          }
        }
        for(let i=1;i+1<clipped.length;i++)indices.push(clipped[0]!,clipped[i]!,clipped[i+1]!)
      })
    })
    positions.push(...cutPositions)
    uv.push(...cutUv)
    const lining = surface(viewer, positions, uv, indices, concreteShader, 'TunnelConcreteLining', survey.length,tube)
    materials.push(lining)
    walls.push(lining.primitive)

    const roadPositions: number[] = [], roadUv: number[] = [], roadIndices: number[] = []
    const roadStations = [-240, ...stations, survey.length + 240]
    roadStations.forEach((station, row) => {
      const width = projectLayByWidth(station,survey,tube)
      for (const side of [-1, 1]) {
        const lateral = side * (5.5 + (side === outer ? width : 0))
        const point = tunnelPoint(survey, tube, station, lateral, 0.2)
        roadPositions.push(point.x, point.y, point.z); roadUv.push(station, lateral)
      }
      if (row) {
        const a = (row - 1) * 2
        roadIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    })
    materials.push(surface(viewer, roadPositions, roadUv, roadIndices, asphaltShader, 'TunnelAsphalt', survey.length,tube))
    for (const side of [-1, 1]) {
      const curbPositions: number[] = [], curbUv: number[] = [], curbIndices: number[] = []
      stations.forEach((station, row) => {
        const width = side === outer ? projectLayByWidth(station,survey,tube) : 0
        for (const z of [0.22, 0.49]) {
          const point = tunnelPoint(survey, tube, station, side * (4.5 + width), z)
          curbPositions.push(point.x, point.y, point.z); curbUv.push(station, z)
        }
        if (!row) return
        const mid = (station + stations[row - 1]!) / 2
        if (side === -outer && passages.some(p => Math.abs(mid-p.station) < p.halfWidth+.1)) return
        const a = (row - 1) * 2
        curbIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      })
      materials.push(surface(viewer, curbPositions, curbUv, curbIndices, curbShader, 'TunnelHazardCurb', survey.length,tube))
    }

  }
  const sample=lightSampleRange(survey.length)
  const sampleInverse=Matrix4.inverse(surveyFrame(survey,tunnelPoint(survey,0,sample.start)),new Matrix4())
  const eyeToSample=new Matrix4()
  const ownsOcclusion=materials.some(item=>item.tube===0)
  const occlusion=ownsOcclusion?addTunnelContactOcclusion(viewer):undefined
  const removeSampleFrame=viewer.scene.preRender.addEventListener(()=>{
    Matrix4.multiply(sampleInverse,viewer.camera.inverseViewMatrix,eyeToSample)
    for(const {material,tube} of materials)if(tube===0)material.uniforms.u_eyeToSample=eyeToSample
    if(occlusion){
      const camera=Matrix4.getTranslation(eyeToSample,new Cartesian3())
      const edge=Math.max(0,Math.min(1,camera.x/8,(sample.length-camera.x)/8))
      const height=camera.z-camera.x*survey.grade/100
      occlusion.enabled=edge>0&&Math.abs(camera.y)<12&&height>0&&height<12&&walls.some(wall=>wall.show)
      occlusion.uniforms.intensity=1.2*edge*edge*(3-2*edge)
    }
  })
  let sampleDevices:SceneDevice[]=[]
  function setLightSample(state:SystemsState,devices:SceneDevice[]):void {
    sampleDevices=devices
    const lights=sampleLights(devices,state,0,sample.length,device=>
      Matrix4.multiplyByPoint(sampleInverse,device.position??tunnelPoint(survey,device.tube,device.station,device.lateral,device.height),new Cartesian3()),basicSpacing(survey.project?.section))
    for(const {material,tube} of materials)if(tube===0){
      material.uniforms.u_sampleEnabled=Number(devices.length>0)
      material.uniforms.u_sampleLength=sample.length
      material.uniforms.u_sampleStart=sample.start
      for(let i=0;i<SAMPLE_LIGHT_LIMIT;i++){
        const light=lights[i]
        material.uniforms[`u_sampleLamp${i}`]=light?new Cartesian4(light.x,light.y,light.z,light.power):new Cartesian4()
      }
    }
  }
  function update(state: SystemsState,devices=sampleDevices): void {
    setLightSample(state,devices)
    const baseline={...state,devices:{}}
    const adjustments=[0,1].map(tube=>{
      const canvas=document.createElement('canvas');canvas.width=Math.ceil((survey.length+480)/2);canvas.height=1
      const ctx=canvas.getContext('2d')!,pixels=ctx.createImageData(canvas.width,1)
      for(let x=0;x<canvas.width;x++) {
        const s=x/canvas.width*(survey.length+480)-240
        const delta=illuminationAt(s,survey.length,state,tube)-illuminationAt(s,survey.length,baseline,tube)
        const value=Math.round(128+127*delta)
        pixels.data.set([value,value,value,255],x*4)
      }
      ctx.putImageData(pixels,0,0);return canvas.toDataURL()
    })
    for (const { material,tube } of materials) {
      material.uniforms.u_deviceLight=adjustments[tube]
      Object.assign(material.uniforms, { u_basic: state.basic === 'off' ? 0 : state.basic === 'all' ? 2 : 1,
        u_enhanced: Number(state.enhanced), u_day: Number(state.environment === 'day'), u_street: Number(state.street) })
    }
    viewer.scene.requestRender()
  }
  update(initialSystems)
  return { setLighting: update, setLightSample, dispose(){
    removeSampleFrame()
    if(occlusion)viewer.scene.postProcessStages.remove(occlusion)
  }, setWallsVisible(visible:boolean) {
    for (const wall of walls) wall.show = visible
    viewer.scene.requestRender()
  } }
}
