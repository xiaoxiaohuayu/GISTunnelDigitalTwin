// @env browser
import {
  BoundingSphere, ComponentDatatype, Geometry, GeometryAttribute, GeometryAttributes,
  GeometryInstance, GeometryPipeline, Material, MaterialAppearance, Primitive, PrimitiveType,
} from 'cesium'
import type { Viewer } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import { tunnelPoint } from './tunnelDetails'
import { interiorStations, layByWidth } from './tunnelLayout'
import { crossPassages, initialSystems, illuminationAt } from './tunnelSystemsState'
import type { SystemsState } from './tunnelSystemsState'

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

// Metre-based UVs keep lining joints and asphalt grain consistent along both bores.
const concreteShader = `
float hashSurface(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;
  float grain = hashSurface(floor(st * 48.0)) * 0.035;
  float joint = 1.0 - smoothstep(0.018, 0.055, min(mod(st.s, 6.0), 6.0 - mod(st.s, 6.0)));
  float panel = 1.0 - step(2.42, st.t);
  float tileX = 1.0 - smoothstep(0.005,0.014,min(mod(st.s,1.2),1.2-mod(st.s,1.2)));
  float tileY = 1.0 - smoothstep(0.004,0.012,min(mod(st.t,0.6),0.6-mod(st.t,0.6)));
  vec3 roof = vec3(0.31,0.33,0.32) + grain;
  vec3 aggregate = texture(u_image,fract(st/4.2)).rgb;
  vec3 wall = aggregate + grain - max(tileX,tileY)*0.035;
  vec3 color = mix(roof,wall,panel) - joint*0.09;
  float pool = pow(max(0.0,cos((st.s+50.0)*0.785398)),8.0);
  color *= 0.83 + pool*0.17;
  material.diffuse = vec3(0.0);
  material.emission = color * tunnelLight(st.s);
  material.specular = panel * (1.0-texture(u_arm,fract(st/4.2)).g)*0.13;
  material.shininess = 14.0;
  material.alpha = 1.0;
  return material;
}`
const asphaltShader = `
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;
  float grain = fract(sin(dot(floor(st*160.0),vec2(12.9898,78.233)))*43758.5453);
  float pool = pow(max(0.0,cos((st.s+50.0)*0.785398)),6.0);
  vec3 color = texture(u_image,fract(st/4.0)).rgb + grain*0.012 + pool*0.025;
  material.diffuse = vec3(0.0);
  material.emission = color*tunnelLight(st.s);
  material.specular = (1.0-texture(u_arm,fract(st/4.0)).g)*0.12;
  material.shininess = 4.0;
  material.alpha = 1.0;
  return material;
}`

const curbShader = `
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  float stripe = step(0.5,fract(materialInput.st.s*1.35 + materialInput.st.t*2.1));
  vec3 color = mix(vec3(0.035,0.04,0.035),vec3(0.84,0.59,0.08),stripe);
  material.diffuse = vec3(0.0);
  material.emission = color*tunnelLight(materialInput.st.s);
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
  } : {}
  const material = new Material({ fabric: { type, source: lightingShader + shader,
    uniforms: { ...textureUniforms, u_deviceLight:neutralLightImage(),u_length: length, u_basic: 1, u_enhanced: 1, u_day: 1, u_street: 0 } }, translucent: false })
  const primitive = viewer.scene.primitives.add(new Primitive({ asynchronous: false, compressVertices: false,
    geometryInstances: new GeometryInstance({ geometry }),
    appearance: new MaterialAppearance({ material,
      materialSupport: MaterialAppearance.MaterialSupport.TEXTURED, faceForward: true, closed: false }),
  }))
  return { material, primitive,tube }
}

export function addTunnelInterior(viewer: Viewer, survey: TunnelSurvey): { setLighting: (state: SystemsState) => void; setWallsVisible: (visible: boolean) => void } {
  const materials: { material: Material; primitive: Primitive; tube:number }[] = []
  const walls: Primitive[] = []
  const passages = crossPassages(survey.length)
  for (let tube = 0; tube < 2; tube++) {
    const outer = tube === 0 ? -1 : 1
    const stations = interiorStations(survey.length, tube)
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
      const width = layByWidth(station, survey.length, tube)
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
      const width = layByWidth(station, survey.length, tube)
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
        const width = side === outer ? layByWidth(station, survey.length, tube) : 0
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
  function update(state: SystemsState): void {
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
  return { setLighting: update, setWallsVisible(visible) {
    for (const wall of walls) wall.show = visible
    viewer.scene.requestRender()
  } }
}
