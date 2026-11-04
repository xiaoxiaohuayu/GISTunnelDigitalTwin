import { Cartesian3, Math as CesiumMath, Matrix3, Matrix4, Transforms } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import { boreLength, type TunnelProject } from './projectConfig.ts'
import { PROFILE_HALF, profileLateral } from './sectionProfile.ts'

export function projectSurvey(project:TunnelProject):TunnelSurvey {
  const o=project.origin
  const frame=Matrix4.multiply(Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(o.longitude,o.latitude,o.elevation)),Matrix4.fromRotationTranslation(Matrix3.fromRotationZ(CesiumMath.toRadians(90-o.heading))),new Matrix4())
  const actualPointAt=(tube:number,s:number,y=0,z=0)=>Matrix4.multiplyByPoint(frame,new Cartesian3(s,-project.bores[tube]!.offset+y,s*o.grade/100+z),new Cartesian3())
  const profileY=(tube:number,y:number)=>{
    const bore=project.bores[tube]!
    const half=bore.lanes.length*bore.laneWidth/2
    return profileLateral(y,half,project.section?.templateHalf??PROFILE_HALF)
  }
  const length=Math.max(...project.bores.map(boreLength))
  return {project,heading:o.heading,length,grade:o.grade,minCover:0,boreNames:project.bores.map(b=>b.name),tubes:project.bores.map((b,i)=>[actualPointAt(i,0),actualPointAt(i,boreLength(b))]),center:actualPointAt(0,length/2),actualPointAt,profileY,
    pointAt:(tube,s,y,z)=>actualPointAt(tube,s,profileY(tube,y),z)}
}
export function boreIndices(survey:TunnelSurvey):number[]{return survey.tubeIndices??survey.tubes.map((_,i)=>i)}
export function lanePositions(survey:TunnelSurvey,tube:number):{id:string;lateral:number;direction:number}[]{
  const b=survey.project?.bores[tube]
  // Values are in the original profile coordinate; tunnelPoint applies the width.
  return b?b.lanes.map((l,i)=>({id:l.id,lateral:-(i-(b.lanes.length-1)/2)*(PROFILE_HALF*2)/b.lanes.length,direction:l.direction})):[-2.15,2.15].map((l,i)=>({id:String(i),lateral:l,direction:tube===0?1:-1}))
}
export function surveyFrame(survey:TunnelSurvey,point:Cartesian3):Matrix4 {
  return Matrix4.multiply(Transforms.eastNorthUpToFixedFrame(point),Matrix4.fromRotationTranslation(Matrix3.fromRotationZ(CesiumMath.toRadians(90-(survey.heading??90)))),new Matrix4())
}
