// @env browser
import { BoxEmitter, Cartesian2, Cartesian3, Color, ConeEmitter, Matrix4, ParticleSystem, Transforms } from 'cesium'
import type { Particle, Viewer } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import type { SystemsState } from './tunnelSystemsState'
import { incidentStation } from './tunnelSystemsState'
import { tunnelPoint } from './tunnelDetails'

// Soft, irregular sprites keep the plume from looking like a stack of circles.
function sprite(flame=false):HTMLCanvasElement {
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128
  const ctx=canvas.getContext('2d')!,image=ctx.createImageData(128,128)
  for(let y=0;y<128;y++)for(let x=0;x<128;x++) {
    const u=x/127*2-1,v=y/127
    const noise=.7+.18*Math.sin(x*.19+y*.12)+.12*Math.sin(x*.43-y*.27)
    const radius=flame?Math.abs(u)/(.12+.65*v):Math.hypot(u,(v-.5)*2)
    const alpha=Math.max(0,1-radius)**(flame?1.2:1.7)*noise*(flame?Math.sin(v*Math.PI)**.6:1)
    const index=(y*128+x)*4
    image.data[index]=255;image.data[index+1]=flame?165+v*90:255;image.data[index+2]=flame?30+v*190:255;image.data[index+3]=alpha*255
  }
  ctx.putImageData(image,0,0);return canvas
}

export function addIncidentEffects(viewer:Viewer,survey:TunnelSurvey) {
  const smokeImage=sprite(),flameImage=sprite(true),systems:ParticleSystem[]=[]
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let key='',current:SystemsState,started=0
  let dust:ParticleSystem|undefined
  const removeSystems=()=>{systems.splice(0).forEach(system=>viewer.scene.primitives.remove(system));dust=undefined}
  function update(state:SystemsState):void {
    current=state
    const next=`${state.incident}:${state.incidentTube}`
    if(next===key)return
    key=next;removeSystems();started=performance.now()
    if(!['fire','smoke','rock'].includes(state.incident))return
    const station=incidentStation(survey.length,state),direction=state.incidentTube===0?1:-1
    const fire=state.incident==='fire',rock=state.incident==='rock'
    const frame=Transforms.eastNorthUpToFixedFrame(tunnelPoint(survey,state.incidentTube,station+(fire?direction*1.5:0),-2.15,rock?.35:1.6))
    const inverse=Matrix4.inverse(frame,new Matrix4()),up=Matrix4.multiplyByPointAsVector(frame,Cartesian3.UNIT_Z,new Cartesian3())
    const along=Matrix4.multiplyByPointAsVector(frame,new Cartesian3(direction,0,0),new Cartesian3())
    const local=new Cartesian3()
    const plume=(particle:Particle,dt:number)=>{
      if(reduced)return
      const drift=(current.fans?1.1:.22)*dt
      Cartesian3.add(particle.velocity,Cartesian3.multiplyByScalar(along,drift,new Cartesian3()),particle.velocity)
      Cartesian3.add(particle.velocity,Cartesian3.multiplyByScalar(up,.18*dt,new Cartesian3()),particle.velocity)
      Matrix4.multiplyByPoint(inverse,particle.position,local)
      if(!rock&&local.z>5.1) {
        local.z=5.1;Matrix4.multiplyByPoint(frame,local,particle.position)
        const rise=Cartesian3.dot(particle.velocity,up)
        if(rise>0)Cartesian3.subtract(particle.velocity,Cartesian3.multiplyByScalar(up,rise,new Cartesian3()),particle.velocity)
      }
    }
    const smoke=viewer.scene.primitives.add(new ParticleSystem({modelMatrix:frame,image:smokeImage,
      emitter:rock?new BoxEmitter(new Cartesian3(2.5,.8,.15)):new ConeEmitter(.3),emissionRate:rock?0:reduced?10:fire?32:45,
      minimumParticleLife:rock?1:3,maximumParticleLife:rock?2.4:6,
      minimumSpeed:reduced?.05:rock?.2:.7,maximumSpeed:reduced?.12:rock?.6:1.3,
      startScale:rock?.6:.65,endScale:rock?2.3:3,
      minimumImageSize:new Cartesian2(.65,.65),maximumImageSize:new Cartesian2(1.25,1.25),sizeInMeters:true,
      startColor:rock?new Color(.58,.5,.4,.42):fire?new Color(.18,.19,.21,.55):new Color(.45,.47,.5,.55),
      endColor:new Color(.34,.35,.37,0),updateCallback:plume,
    }))
    systems.push(smoke)
    if(rock){dust=smoke;smoke.show=!reduced;return}
    if(!fire)return
    for(const offset of [-.35,0,.35])systems.push(viewer.scene.primitives.add(new ParticleSystem({modelMatrix:frame,image:flameImage,
      emitterModelMatrix:Matrix4.fromTranslation(new Cartesian3(offset,offset*.6,-.3)),
      emitter:new ConeEmitter(.18),emissionRate:reduced?7:35,
      minimumParticleLife:.35,maximumParticleLife:.85,minimumSpeed:reduced?.1:1,maximumSpeed:reduced?.2:2.4,
      startScale:1,endScale:.18,minimumImageSize:new Cartesian2(.32,.75),maximumImageSize:new Cartesian2(.7,1.6),sizeInMeters:true,
      startColor:new Color(1,.9,.55,.95),endColor:new Color(1,.12,.015,0),
    })))
    if(!reduced)systems.push(viewer.scene.primitives.add(new ParticleSystem({modelMatrix:frame,image:flameImage,
      emitter:new ConeEmitter(.5),emissionRate:12,minimumParticleLife:.5,maximumParticleLife:1.4,
      minimumSpeed:1.5,maximumSpeed:3,imageSize:new Cartesian2(.045,.12),sizeInMeters:true,startScale:1,endScale:.2,
      startColor:new Color(1,.65,.08,1),endColor:new Color(1,.13,.01,0),
    })))
  }
  const removeTick=viewer.scene.preUpdate.addEventListener(()=>{
    if(!dust)return
    const elapsed=(performance.now()-started)/1000
    dust.emissionRate=!reduced&&elapsed>.8&&elapsed<1.9?55:0
    dust.show=!reduced&&elapsed<4.5
  })
  return {update,dispose(){removeTick();removeSystems()}}
}
