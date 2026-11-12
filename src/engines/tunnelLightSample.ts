import { deviceLevel } from './tunnelSystemsState.ts'
import { Cartesian4, Matrix4 } from 'cesium'
import type { SceneDevice, SystemsState } from './tunnelSystemsState.ts'

export const SAMPLE_LENGTH = 100
export const SAMPLE_LIGHT_RADIUS = 14
export const SAMPLE_LIGHT_LIMIT = 40

export function sampleUniforms() {
  return {u_sampleEnabled:0,u_sampleLength:SAMPLE_LENGTH,u_sampleStart:0,
    // Fabric merges cached templates as objects, so repeated materials need an explicit matrix type.
    u_eyeToSample:Object.assign(Matrix4.clone(Matrix4.IDENTITY),{type:'mat4'}),
    ...Object.fromEntries(Array.from({length:SAMPLE_LIGHT_LIMIT},(_,i)=>[`u_sampleLamp${i}`,new Cartesian4()]))}
}

export function lightSampleRange(length:number):{start:number;length:number} {
  return {start:Math.max(0,length*.25-35),length:Math.min(SAMPLE_LENGTH,length)}
}

export interface SampleLight {id:string;x:number;y:number;z:number;power:number}

// Positions are supplied from the live scene, including unsaved position previews.
export function sampleLights(devices:SceneDevice[],state:SystemsState,tube:number,length:number,position:(device:SceneDevice)=>{x:number;y:number;z:number},spacing=8):SampleLight[] {
  return devices.filter(d=>d.tube===tube&&(d.kind==='basic'||d.kind==='enhanced')).flatMap(device=>{
    const power=deviceLevel(device,state,spacing)
    if(power===0)return []
    const p=position(device)
    if(p.x < -SAMPLE_LIGHT_RADIUS || p.x > length+SAMPLE_LIGHT_RADIUS)return []
    return [{id:device.id,...p,power:power*(device.kind==='enhanced'?1.25:1)}]
  }).sort((a,b)=>Math.abs(a.x-length/2)-Math.abs(b.x-length/2)||a.id.localeCompare(b.id)).slice(0,SAMPLE_LIGHT_LIMIT)
}

export const sampleLightingShader = `
float lightSampleWeight(vec3 position) {
  return u_sampleEnabled*smoothstep(0.0,8.0,position.x)*(1.0-smoothstep(u_sampleLength-8.0,u_sampleLength,position.x));
}
vec3 sampleLamp(vec4 lamp, vec3 position, vec3 normal, vec3 eye, czm_material material) {
  if(lamp.w<=0.0)return vec3(0.0);
  vec3 offset = lamp.xyz-position;
  float distanceSquared = dot(offset,offset);
  if(distanceSquared>=${SAMPLE_LIGHT_RADIUS * SAMPLE_LIGHT_RADIUS}.0)return vec3(0.0);
  vec3 direction = offset*inversesqrt(max(distanceSquared,0.01));
  float falloff = max(1.0-distanceSquared/${SAMPLE_LIGHT_RADIUS * SAMPLE_LIGHT_RADIUS}.0,0.0);
  float energy = lamp.w*18.0*falloff*falloff/(4.0+distanceSquared);
  float diffuse = max(dot(normal,direction),0.0);
  vec3 halfVector = normalize(direction+eye);
  float highlight = pow(max(dot(normal,halfVector),0.0),material.shininess)*diffuse;
  return (material.diffuse*(0.16+0.84*diffuse)+material.specular*highlight)*energy*vec3(1.0,0.98,0.94);
}
vec3 shadeLightSample(czm_materialInput inputValue,czm_material material,vec3 fallback) {
  if(u_sampleEnabled<0.5)return fallback;
  vec3 position = (u_eyeToSample*vec4(-inputValue.positionToEyeEC,1.0)).xyz;
  float blend = lightSampleWeight(position);
  if(blend<=0.0)return fallback;
  vec3 normal = normalize(mat3(u_eyeToSample)*material.normal);
  vec3 eye = normalize(mat3(u_eyeToSample)*inputValue.positionToEyeEC);
  // Preserve daylight entering short bores, without periodic artificial light pools.
  float station = u_sampleStart+position.x;
  float spill = exp(-max(0.0,min(station+60.0,u_length+60.0-station))/19.0)*mix(0.06,0.7,u_day);
  vec3 color = material.diffuse*(0.012+spill);
  ${Array.from({length:SAMPLE_LIGHT_LIMIT},(_,i)=>`color += sampleLamp(u_sampleLamp${i},position,normal,eye,material);`).join('\n  ')}
  return mix(fallback,color,blend);
}
`
