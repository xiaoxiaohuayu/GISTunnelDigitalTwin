import { Cartesian3, Cartographic, Math as CesiumMath } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import { defaultProject } from './projectConfig.ts'
import type { TunnelProject } from './projectConfig.ts'
import { DEMO_HEADING } from './sceneFrame.ts'

// The sampled centerline follows the ellipsoid. One tangent frame stays within
// about half a metre over 2 km, so the ledger uses that frame and the first
// render keeps the sampled points already checked against the terrain.
export function centerlineProject(survey: TunnelSurvey, name: string): TunnelProject {
  if (survey.tubes.length < 1 || survey.tubes.length > 2 || survey.tubes.some(tube => tube.length < 2)) {
    throw new Error('演示线路需要 1 或 2 条已采样的洞轴线')
  }
  const project = defaultProject()
  project.name = name.trim() || project.name
  const start = survey.tubes.length === 2
    ? Cartesian3.midpoint(survey.tubes[0]![0]!, survey.tubes[1]![0]!, new Cartesian3())
    : Cartesian3.clone(survey.tubes[0]![0]!)
  const geo = Cartographic.fromCartesian(start)
  project.origin = {
    longitude: CesiumMath.toDegrees(geo.longitude),
    latitude: CesiumMath.toDegrees(geo.latitude),
    elevation: geo.height,
    heading: survey.heading ?? DEMO_HEADING,
    grade: survey.grade,
  }
  project.bores = project.bores.slice(0, survey.tubes.length)
  project.bores.forEach((bore, index) => {
    bore.end = bore.start + survey.length
    bore.laneWidth = 4.3
    bore.offset = survey.tubes.length === 2 ? (index === 0 ? 12 : -12) : 0
  })
  return project
}
