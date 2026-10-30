import { lanePositions,surveyFrame } from './projectSurvey'
import { boreLength } from './projectConfig'
// @env browser
import { modelAssetUrl } from './modelAssets'
import { Axis, Cartesian3, Matrix3, Matrix4, Model } from 'cesium'
import type { Viewer } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import { equipmentShader, setEquipmentLighting } from './tunnelSystems'
import { illuminationAt, trafficSpeedFactor, trafficStopStations } from './tunnelSystemsState'
import type { SystemsState } from './tunnelSystemsState'
import { vehicleInfo } from './scenePresentation'
import { tunnelPoint } from './tunnelDetails'

const CAR_TYPES = ['car-blue', 'car-white', 'car-orange']

export async function addTunnelTraffic(viewer: Viewer, survey: TunnelSurvey, getState: () => SystemsState, progress?: (completed:number,total:number,resource:string)=>void) {
  const span = survey.length + 380
  let completed=0
  const slots=survey.tubes.flatMap((_,tube)=>lanePositions(survey,tube).flatMap((l,lane)=>Array.from({length:6},()=>({tube,lane,direction:l.direction,lateral:l.lateral}))))
  const cars = await Promise.all(slots.map(async ({tube,lane,direction,lateral}, index) => {
    const shader=equipmentShader()
    const model = await Model.fromGltfAsync({
      url: modelAssetUrl(index % 12 === 0 ? 'car-audi' : [3,9].includes(index % 12) ? 'car-van' : CAR_TYPES[index % CAR_TYPES.length]!),
      upAxis: Axis.Y, forwardAxis: Axis.X,
      modelMatrix: Matrix4.IDENTITY, customShader:shader,
    })
    const info=vehicleInfo(index);model.id=info.id
    progress?.(++completed,24,`车辆 ${completed}/24`)
    return { info, station:0, position:new Cartesian3(), model, shader, tube, lane, direction,lateral, held: undefined as number | undefined, stop: undefined as number | undefined, progress: (index % 6) * span / 6 + lane * 92,
      speed: lane === 0 ? 15 : 18 }
  }))
  cars.forEach(car => viewer.scene.primitives.add(car.model))
  let previous = performance.now()
  const rotation = Matrix3.fromRotationY(-Math.atan(survey.grade / 100))
  function update(): void {
    const now = performance.now()
    // Clamp time after backgrounding so traffic does not jump across a camera.
    const delta = Math.min((now - previous) / 1000, 0.1)
    previous = now
    for (const car of cars) {
      const span=(survey.project?boreLength(survey.project.bores[car.tube]!):survey.length)+380
      const state=getState()
      const oldStation=-220+(car.direction===1?car.progress:span-car.progress)
      const nextProgress=(car.progress+delta*car.speed*(trafficSpeedFactor(car.tube,state)))%span
      let station=-220+(car.direction===1?nextProgress:span-nextProgress)
      const stops=trafficStopStations(car.tube,car.lane,survey.length,state)
      if(car.stop!==undefined&&!stops.includes(car.stop)){car.held=undefined;car.stop=undefined}
      if(car.held!==undefined)station=car.held
      else for(const stop of stops){
        const held=cars.filter(other=>other!==car&&other.tube===car.tube&&other.lane===car.lane&&other.held!==undefined&&Math.abs(other.held-stop)<100).map(other=>other.held!)
        const queue=held.length?(car.direction===1?Math.min(...held)-7:Math.max(...held)+7):stop
        if(car.direction*(oldStation-queue)<=0&&car.direction*(station-queue)>=0){car.held=queue;car.stop=stop;station=queue;break}
      }
      car.progress=car.direction===1?station+220:span-station-220
      setEquipmentLighting(car.model,illuminationAt(station,survey.length,state))
      const lateral = car.lateral
      const point = tunnelPoint(survey, car.tube, station, lateral, 0.25)
      car.station=station
      Cartesian3.clone(tunnelPoint(survey,car.tube,station,lateral,2.1),car.position)
      const bearing = Matrix3.multiply(rotation,
        Matrix3.fromRotationZ(car.direction === 1 ? 0 : Math.PI), new Matrix3())
      car.model.modelMatrix = Matrix4.multiply(surveyFrame(survey,point),
        Matrix4.fromRotationTranslation(bearing), new Matrix4())
      // Keep invisible traffic from consuming draw calls in distant overview views.
      car.model.show = Cartesian3.distance(viewer.camera.positionWC, point) < 650
    }
    viewer.scene.requestRender()
  }
  update()
  const removeTick = viewer.scene.preUpdate.addEventListener(update)
  return {cars,dispose() {
    removeTick()
    cars.forEach(car => viewer.scene.primitives.remove(car.model))
  }}
}
