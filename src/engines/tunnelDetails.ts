// @env browser
import {
  BoundingSphere, BoxGeometry, Cartesian2, Cartesian3, Color, ColorGeometryInstanceAttribute,
  ColorMaterialProperty, ComponentDatatype, CornerType, CylinderGeometry, DistanceDisplayCondition, Geometry, GeometryAttribute, GeometryAttributes, GeometryPipeline, GeometryInstance, Matrix3, Matrix4,
  PerInstanceColorAppearance, Primitive, PrimitiveType, Transforms,
} from 'cesium'
import type { Entity, Viewer } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import portalAccess from '../config/portalAccess.json'
import { interiorStations, layBy, layByWidth } from './tunnelLayout'
import { roadArrow } from './roadMarkings'
import { deviceEnabled, lightDeviceId, crossPassages, illuminationAt, initialSystems } from './tunnelSystemsState'
import type { SystemsState } from './tunnelSystemsState'

export const PORTAL_EXTENSION = 60

// Distance follows the surveyed centreline; lateral offset is north, height is above the floor.
export function tunnelPoint(survey: TunnelSurvey, tube: number, distance: number, lateral = 0, height = 0): Cartesian3 {
  if(survey.pointAt)return survey.pointAt(tube,distance,lateral,height)
  const positions = survey.tubes[tube]!
  const step = survey.length / (positions.length - 1)
  const index = Math.max(0, Math.min(positions.length - 2, Math.floor(distance / step)))
  const point = Cartesian3.lerp(positions[index]!, positions[index + 1]!, distance / step - index, new Cartesian3())
  return Matrix4.multiplyByPoint(Transforms.eastNorthUpToFixedFrame(point), new Cartesian3(0, lateral, height), new Cartesian3())
}

export function addTunnelDetails(viewer: Viewer, survey: TunnelSurvey): { setLighting: (state: SystemsState) => void; setWallsVisible: (visible: boolean) => void } {
  const boxes: GeometryInstance[] = []
  const surfaces: { id: string; station: number; tube:number; lateral:number; color: Color }[] = []
  const passages = crossPassages(survey.length)
  const trays: Entity[] = []
  const crossWalls: {entity:Entity;station:number}[]=[]
  function box(id: string, tube: number, station: number, y: number, z: number, xSize: number, ySize: number, zSize: number, color: string): void {
    surfaces.push({ id, station, tube,lateral:y,color: Color.fromCssColorString(color) })
    boxes.push(new GeometryInstance({
      id,
      geometry: BoxGeometry.fromDimensions({ dimensions: new Cartesian3(xSize, ySize, zSize), vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT }),
      modelMatrix: Matrix4.multiply(Transforms.eastNorthUpToFixedFrame(tunnelPoint(survey, tube, station, y, z)),
        Matrix4.fromRotationTranslation(Matrix3.fromRotationY(-Math.atan(survey.grade / 100))), new Matrix4()),
      attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString(color)) },
    }))
  }
  // Both ends follow the same wall profile, so adjacent sections share their edges.
  function strip(id: string, tube: number, side: number, outer: boolean, start: number, end: number,
    y: number, z: number, width: number, height: number, color: string): void {
    const geometry = BoxGeometry.createGeometry(BoxGeometry.fromDimensions({
      dimensions: new Cartesian3(end-start, width, height), vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
    }))!
    const positions = geometry.attributes.position!.values
    for (let i = 0; i < positions.length; i += 3) {
      const station = positions[i]! < 0 ? start : end
      const widening = outer ? layByWidth(station, survey.length, tube) : 0
      const point = tunnelPoint(survey, tube, station, side*(y+widening)+positions[i+1]!, z+positions[i+2]!)
      positions[i] = point.x
      positions[i+1] = point.y
      positions[i+2] = point.z
    }
    geometry.boundingSphere = BoundingSphere.fromVertices(positions)
    GeometryPipeline.computeNormal(geometry)
    surfaces.push({ id, station: (start+end)/2, tube,lateral:y,color: Color.fromCssColorString(color) })
    boxes.push(new GeometryInstance({ id, geometry,
      attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString(color)) } }))
  }
  function sign(id: string, tube: number, station: number, y: number, text: string): void {
    viewer.entities.add({
      id, position: tunnelPoint(survey, tube, station, y, 2.15),
      label: { text, font: '13px sans-serif', fillColor: Color.WHITE, showBackground: true,
        backgroundColor: Color.fromCssColorString('#08764f'), backgroundPadding: new Cartesian2(8, 5),
        distanceDisplayCondition: new DistanceDisplayCondition(0, 90) },
    })
  }
  for (let tube = 0; tube < 2; tube++) {
    const innerSide = tube === 0 ? 1 : -1
    for(let station=-205;station<survey.length+230;station+=80)for(const lane of [-2.15,2.15]) {
      const id=`direction-arrow-${tube}-${lane}-${station}`
      const positions=roadArrow(tube).flatMap(([along,lateral])=>{
        const point=tunnelPoint(survey,tube,station+along!,lane+lateral!,.26)
        return [point.x,point.y,point.z]
      })
      const attributes=new GeometryAttributes()
      attributes.position=new GeometryAttribute({componentDatatype:ComponentDatatype.DOUBLE,componentsPerAttribute:3,values:new Float64Array(positions)})
      const geometry=GeometryPipeline.computeNormal(new Geometry({attributes,
        indices:new Uint16Array([0,1,2,0,2,3,4,5,6]),primitiveType:PrimitiveType.TRIANGLES,boundingSphere:BoundingSphere.fromVertices(positions)}))
      const color=Color.fromCssColorString('#f3eee0')
      surfaces.push({id,station,tube,lateral:lane,color})
      boxes.push(new GeometryInstance({id,geometry,attributes:{color:ColorGeometryInstanceAttribute.fromColor(color)}}))
    }
    for (let station = -240; station < survey.length + 240; station += 12) {
      box(`lane-${tube}-${station}`, tube, station + 2, 0, 0.235, 4, 0.15, 0.025, '#f3eee0')
    }
    for (const side of [-1, 1]) {
      const outer = side === -innerSide
      const bay = layBy(survey.length, tube)
      const lineIntervals = outer ? [[-240, bay.start], [bay.end, survey.length + 240]] : [[-240,-PORTAL_EXTENSION+portalAccess.start],[-PORTAL_EXTENSION+portalAccess.end,survey.length+PORTAL_EXTENSION-portalAccess.end],[survey.length+PORTAL_EXTENSION-portalAccess.start,survey.length+240]]
      for (const [a, b] of lineIntervals) {
        for (let s = a!; s < b!; s += 12) {
          const extent = Math.min(12,b!-s)
          box(`edge-${tube}-${side}-${s}`,tube,s+extent/2,side*4.35,.25,extent,.14,.025,'#f3eee0')
        }
      }
      if (outer) {
        for (let station = bay.start; station < bay.end; station += 6) {
          box(`bay-dash-${tube}-${station}`, tube, station + 1.5, side*4.35, .245, 3, .14, .025, '#ececdd')
        }
        for (let station = bay.flatStart+2; station < bay.flatEnd; station += 4) {
          box(`bay-edge-${tube}-${station}`,tube,station,side*7.25,.245,3.8,.14,.025,'#ececdd')
        }
      }
      const stations = interiorStations(survey.length, tube)
      for (let i = 1; i < stations.length; i++) {
        const start = stations[i-1]!
        const end = stations[i]!
        const mid = (start+end)/2
        const opening = side === innerSide && passages.some(p => Math.abs(mid-p.station) < p.halfWidth)
        if (!opening) {
          strip(`walkway-${tube}-${side}-${start}`,tube,side,outer,start,end,5,.36,.9,.32,'#a7aaa0')
          strip(`curb-cap-${tube}-${side}-${start}`,tube,side,outer,start,end,4.57,.50,.16,.055,'#d0d0bc')
        }
      }
      for (let station = -50; station < survey.length + 60; station += 8) {
        const width = outer ? layByWidth(station,survey.length,tube) : 0
        const y = side*(4.55+width)
        box(`light-housing-${tube}-${side}-${station}`,tube,station,y,4.75,1.7,.42,.16,'#394449')
        box(`light-diffuser-${tube}-${side}-${station}`,tube,station,y-side*.05,4.65,1.5,.32,.045,'#e6f3df')
        box(`light-bracket-${tube}-${side}-${station}`,tube,station,y+side*.18,4.97,.10,.12,.45,'#7d8987')
        const overVehicle=!outer && passages.some(p=>p.vehicle&&Math.abs(station-p.station)<p.halfWidth+2)
        box(`cable-support-${tube}-${side}-${station}`,tube,station,side*(overVehicle?4.52:5.12+width),overVehicle?5.12:3.65,.1,.6,.07,'#84908a')
      }
      for (const from of [-58, survey.length+12]) {
        for (let station = from; station <= from+46; station += 4) {
          box(`boost-housing-${tube}-${side}-${station}`,tube,station,side*3.85,5.6,1.8,.48,.18,'#394449')
          box(`boost-diffuser-${tube}-${side}-${station}`,tube,station,side*3.85,5.49,1.65,.40,.05,'#fff2d2')
        }
      }
      for (const [y, z, w, h] of [[4.9,3.88,.045,.13],[5.15,3.88,.045,.13],[5.03,3.82,.3,.045]]) {
        const path = interiorStations(survey.length,tube).map(station => {
          const width=outer?layByWidth(station,survey.length,tube):0
          const vehicle=passages.find(p=>p.vehicle)
          const lift=!outer&&vehicle?Math.max(0,Math.min(1,(vehicle.halfWidth+3-Math.abs(station-vehicle.station))/3)):0
          return tunnelPoint(survey,tube,station,side*(y!+width-lift*.6),z!+lift*1.5)
        })
        trays.push(viewer.entities.add({polylineVolume:{positions:path,cornerType:CornerType.MITERED,
          shape:[new Cartesian2(-w!/2,-h!/2),new Cartesian2(w!/2,-h!/2),new Cartesian2(w!/2,h!/2),new Cartesian2(-w!/2,h!/2)],
          material:Color.fromCssColorString('#63736b')}}))
      }

    }
    // Passive FBG temperature probes are coupled to the continuous optical fibre.
    for(let station=10;station<survey.length;station+=20){
      const id=`fbg-probe-${tube}-${station}`
      surfaces.push({id,station,tube,lateral:-innerSide*4.2,color:Color.fromCssColorString('#9aa8b5')})
      boxes.push(new GeometryInstance({id,
        geometry:new CylinderGeometry({length:.30,topRadius:.025,bottomRadius:.025,slices:8,vertexFormat:PerInstanceColorAppearance.VERTEX_FORMAT}),
        modelMatrix:Matrix4.multiply(Transforms.eastNorthUpToFixedFrame(tunnelPoint(survey,tube,station,-innerSide*4.2,5.2)),
          Matrix4.fromRotationTranslation(Matrix3.fromRotationY(Math.PI/2-Math.atan(survey.grade/100))),new Matrix4()),
        attributes:{color:ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString('#9aa8b5'))}}))
    }

  }
  passages.forEach((passage, index) => {
    const { station, halfWidth: w, height: h, archRise, vehicle } = passage
    const a = tunnelPoint(survey, 0, station, 4.2)
    const b = tunnelPoint(survey, 1, station, -4.2)
    const shape = [new Cartesian2(-w-.3,.2), new Cartesian2(-w-.3,h)]
    for (let i=0;i<=40;i++) {
      const angle=Math.PI-i*Math.PI/40
      shape.push(new Cartesian2((w+.3)*Math.cos(angle),h+(archRise+.3)*Math.sin(angle)))
    }
    shape.push(new Cartesian2(w+.3,.2),new Cartesian2(w,.2),new Cartesian2(w,h))
    for (let i=0;i<=40;i++) {
      const angle=i*Math.PI/40
      shape.push(new Cartesian2(w*Math.cos(angle),h+archRise*Math.sin(angle)))
    }
    shape.push(new Cartesian2(-w,.2))
    const entity=viewer.entities.add({ id: `cross-passage-${index}`, name: `${vehicle ? '车行' : '人行'}横洞 ${index + 1}`,
      polylineVolume: { positions: [a,b], cornerType: CornerType.MITERED,
        shape,
        material: Color.fromCssColorString('#647180') } })
    crossWalls.push({entity,station})
    box(`cross-floor-${index}`,0,station,12,.2,w*2,14.4,.15,'#7c8e87')
    box(`cross-light-${index}`,0,station,12,h+archRise-.12,.3,10,.04,'#e5fff2')
    for (let tube = 0; tube < 2; tube++) sign(`cross-sign-${index}-${tube}`, tube, station, tube === 0 ? 5.1 : -5.1, `${vehicle ? '车行' : '人行'}横洞 ${index + 1} · 安全出口`)
  })
  const primitive = viewer.scene.primitives.add(new Primitive({ geometryInstances: boxes,
    appearance: new PerInstanceColorAppearance({ flat: true, translucent: false, closed: true }), asynchronous: false }))
  let state = initialSystems
  function update(next: SystemsState): void {
    state = next
    if (!primitive.ready) return
    for (const surface of surfaces) {
      const {id,station,tube,lateral,color} = surface
      const basic = id.startsWith('light-diffuser')
      const enhanced = id.startsWith('boost-diffuser')
      const safety = id.startsWith('cross-light')
      let brightness = illuminationAt(station,survey.length,state,tube)
      if (basic||enhanced) {
        const kind=basic?'basic':'enhanced'
        brightness=deviceEnabled({id:lightDeviceId(kind,tube,station,lateral,survey.length),kind,tube,station,lateral,height:0},state)?1:.025
      }
      if (safety) brightness = .8
      if (station < -60 || station > survey.length+60) brightness = state.environment === 'day' ? 1 : state.street ? .48 : .025
      primitive.getGeometryInstanceAttributes(id).color = ColorGeometryInstanceAttribute.toValue(
        new Color(color.red*brightness,color.green*brightness,color.blue*brightness,1))
    }
    for(const {entity,station} of crossWalls){
      const light=Math.max(.04,illuminationAt(station,survey.length,state))
      if(entity.polylineVolume)entity.polylineVolume.material=new ColorMaterialProperty(new Color(.39*light,.44*light,.5*light,1))
    }
    const level=illuminationAt(survey.length/2,survey.length,state)
    for(const tray of trays) if(tray.polylineVolume)tray.polylineVolume.material=new ColorMaterialProperty(new Color(.39*level,.45*level,.42*level,1))
    viewer.scene.requestRender()
  }
  const remove = viewer.scene.postRender.addEventListener(() => {
    if (primitive.ready) { update(state); remove() }
  })
  return { setLighting: update, setWallsVisible(visible) {
    for (const { entity } of crossWalls) entity.show = visible
    viewer.scene.requestRender()
  } }
}
