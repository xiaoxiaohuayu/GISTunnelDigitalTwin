// @env browser
/**
 * 新路由隧道洞内细部、横洞拱体、联络通道与多停车带标线渲染模块
 * （基于原版 src/engines/tunnelDetails.ts 独立复制并扩展）
 *
 * 相比原版的扩展：
 * - 支持同洞筒内【任意多个】紧急停车带各自生成入口虚线、停车带边线、加宽检修道及可点击标识牌；
 * - 支持人行横洞、车行横洞与联络通道（洞口外/洞内）均响应 X/Y/Z 三轴自由拖拽移动；
 * - 横洞地面使用与主隧道一致的 PBR 沥青材质（asphalt-diff / asphalt-arm）并与主路面齐平衔接。
 */
import {
  BoundingSphere,
  BoxGeometry,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  ColorMaterialProperty,
  ComponentDatatype,
  CornerType,
  DistanceDisplayCondition,
  Geometry,
  GeometryAttribute,
  GeometryAttributes,
  GeometryInstance,
  GeometryPipeline,
  Material,
  MaterialAppearance,
  Matrix3,
  Matrix4,
  PerInstanceColorAppearance,
  Primitive,
  PrimitiveType,
} from 'cesium'
import type { Entity, Viewer } from 'cesium'
import type { TunnelSurvey } from '../../types/tunnel'
import portalAccessDefaults from '../../config/portalAccess.json'
import { boreIndices, lanePositions, surveyFrame } from '../../engines/projectSurvey'
import { isRoadMarking, roadArrow, roadPaint } from '../../engines/roadMarkings'
import { PORTAL_EXTENSION, tunnelPoint } from '../../engines/tunnelDetails'
import { illuminationAt, initialSystems, type SystemsState } from '../../engines/tunnelSystemsState'
import type { TunnelSceneDocument } from '../schema/tunnelSchema'
import {
  studioBoreInnerSide,
  studioLayByWidthAt,
  studioLayoutLayBys,
  studioLayoutPassages,
  studioProjectStations,
} from './studioFacilityLayout'

function subtractIntervals(start: number, end: number, cutouts: Array<[number, number]>): Array<[number, number]> {
  let segments: Array<[number, number]> = [[start, end]]
  for (const [cutA, cutB] of cutouts) {
    const next: Array<[number, number]> = []
    for (const [s, e] of segments) {
      if (cutB <= s || cutA >= e) {
        next.push([s, e])
      } else {
        if (cutA > s) next.push([s, cutA])
        if (cutB < e) next.push([cutB, e])
      }
    }
    segments = next
  }
  return segments
}

export function addStudioTunnelDetails(viewer: Viewer, survey: TunnelSurvey, doc: TunnelSceneDocument) {
  const boxes: GeometryInstance[] = []
  const surfaces: { id: string; station: number; tube: number; color: Color }[] = []
  const trays: Entity[] = []
  const crossWalls: { entity: Entity; station: number }[] = []
  const crossFloors: { material: Material; station: number }[] = []
  const passages = studioLayoutPassages(doc, survey)

  /** 创建与主隧道地面完全一致的 PBR 沥青路面贴片（4m UV 重复，齐平衔接，支持点击选中） */
  function addAsphaltPatch(
    id: string,
    center: Cartesian3,
    alongAxis: Cartesian3,
    acrossAxis: Cartesian3,
    alongLength: number,
    acrossLength: number,
    station: number,
  ): void {
    const halfAlong = Cartesian3.multiplyByScalar(alongAxis, alongLength / 2, new Cartesian3())
    const halfAcross = Cartesian3.multiplyByScalar(acrossAxis, acrossLength / 2, new Cartesian3())
    const edgeA = Cartesian3.subtract(center, halfAcross, new Cartesian3())
    const edgeB = Cartesian3.add(center, halfAcross, new Cartesian3())
    const p0 = Cartesian3.subtract(edgeA, halfAlong, new Cartesian3())
    const p1 = Cartesian3.add(edgeA, halfAlong, new Cartesian3())
    const p2 = Cartesian3.add(edgeB, halfAlong, new Cartesian3())
    const p3 = Cartesian3.subtract(edgeB, halfAlong, new Cartesian3())

    const positions = [p0, p1, p2, p3].flatMap(p => [p.x, p.y, p.z])
    const attrs = new GeometryAttributes()
    attrs.position = new GeometryAttribute({
      componentDatatype: ComponentDatatype.DOUBLE,
      componentsPerAttribute: 3,
      values: new Float64Array(positions),
    })
    attrs.st = new GeometryAttribute({
      componentDatatype: ComponentDatatype.FLOAT,
      componentsPerAttribute: 2,
      values: new Float32Array([0, 0, alongLength / 4, 0, alongLength / 4, acrossLength / 4, 0, acrossLength / 4]),
    })
    const geometry = GeometryPipeline.computeNormal(
      new Geometry({
        attributes: attrs,
        indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
        primitiveType: PrimitiveType.TRIANGLES,
        boundingSphere: BoundingSphere.fromVertices(positions),
      }),
    )
    const material = new Material({
      fabric: {
        type: 'StudioCrossPassageAsphalt',
        uniforms: {
          u_image: `${import.meta.env.BASE_URL}textures/asphalt-diff.jpg`,
          u_arm: `${import.meta.env.BASE_URL}textures/asphalt-arm.jpg`,
          u_light: 0.8,
        },
        source: `czm_material czm_getMaterial(czm_materialInput materialInput) {
          czm_material m = czm_getDefaultMaterial(materialInput);
          vec2 uv = fract(materialInput.st);
          vec3 diff = texture(u_image, uv).rgb;
          vec3 arm = texture(u_arm, uv).rgb;
          m.diffuse = diff * mix(0.82, 1.0, arm.r) * u_light;
          m.specular = (1.0 - arm.g) * 0.09 * u_light;
          m.shininess = mix(8.0, 32.0, 1.0 - arm.g);
          m.alpha = 1.0;
          return m;
        }`,
      },
      translucent: false,
    })
    viewer.scene.primitives.add(
      new Primitive({
        asynchronous: false,
        compressVertices: false,
        geometryInstances: new GeometryInstance({ id, geometry }),
        appearance: new MaterialAppearance({
          material,
          materialSupport: MaterialAppearance.MaterialSupport.TEXTURED,
          faceForward: true,
          closed: false,
        }),
      }),
    )
    crossFloors.push({ material, station })
  }

  function addBox(
    id: string,
    tube: number,
    station: number,
    y: number,
    z: number,
    xSize: number,
    ySize: number,
    zSize: number,
    color: string,
  ): void {
    surfaces.push({ id, station, tube, color: Color.fromCssColorString(color) })
    boxes.push(
      new GeometryInstance({
        id,
        geometry: BoxGeometry.fromDimensions({
          dimensions: new Cartesian3(xSize, ySize, zSize),
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        modelMatrix: Matrix4.multiply(
          surveyFrame(survey, tunnelPoint(survey, tube, station, y, z)),
          Matrix4.fromRotationTranslation(Matrix3.fromRotationY(-Math.atan(survey.grade / 100))),
          new Matrix4(),
        ),
        attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString(color)) },
      }),
    )
  }

  function addStrip(
    id: string,
    tube: number,
    side: -1 | 1,
    start: number,
    end: number,
    y: number,
    z: number,
    width: number,
    height: number,
    color: string,
  ): void {
    const geometry = BoxGeometry.createGeometry(
      BoxGeometry.fromDimensions({
        dimensions: new Cartesian3(end - start, width, height),
        vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
    )!
    const positions = geometry.attributes.position!.values
    for (let i = 0; i < positions.length; i += 3) {
      const station = positions[i]! < 0 ? start : end
      const widening = studioLayByWidthAt(station, doc, survey, tube, side)
      const point = tunnelPoint(survey, tube, station, side * (y + widening) + positions[i + 1]!, z + positions[i + 2]!)
      positions[i] = point.x
      positions[i + 1] = point.y
      positions[i + 2] = point.z
    }
    geometry.boundingSphere = BoundingSphere.fromVertices(positions)
    GeometryPipeline.computeNormal(geometry)
    surfaces.push({ id, station: (start + end) / 2, tube, color: Color.fromCssColorString(color) })
    boxes.push(
      new GeometryInstance({
        id,
        geometry,
        attributes: { color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString(color)) },
      }),
    )
  }

  for (const tube of boreIndices(survey)) {
    const innerSide: -1 | 1 = studioBoreInnerSide(survey, tube)
    const outerSide: -1 | 1 = innerSide === 1 ? -1 : 1
    const bays = studioLayoutLayBys(doc, survey, tube)

    // 1. 车道方向箭头
    for (let station = -205; station < survey.length + 230; station += 80) {
      for (const laneInfo of lanePositions(survey, tube)) {
        const lane = laneInfo.lateral
        const id = `direction-arrow-${tube}-${lane}-${station}`
        const positions = roadArrow(laneInfo.direction === 1 ? 0 : 1).flatMap(([along, lateral]) => {
          const point = tunnelPoint(survey, tube, station + along!, lane + lateral!, 0.26)
          return [point.x, point.y, point.z]
        })
        const attributes = new GeometryAttributes()
        attributes.position = new GeometryAttribute({
          componentDatatype: ComponentDatatype.DOUBLE,
          componentsPerAttribute: 3,
          values: new Float64Array(positions),
        })
        const geometry = GeometryPipeline.computeNormal(
          new Geometry({
            attributes,
            indices: new Uint16Array([0, 1, 2, 0, 2, 3, 4, 5, 6]),
            primitiveType: PrimitiveType.TRIANGLES,
            boundingSphere: BoundingSphere.fromVertices(positions),
          }),
        )
        const color = Color.fromCssColorString(roadPaint)
        surfaces.push({ id, station, tube, color })
        boxes.push(
          new GeometryInstance({
            id,
            geometry,
            attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
          }),
        )
      }
    }

    // 2. 车道分界虚线
    const laneCount = survey.project?.bores[tube]?.lanes.length ?? 2
    for (let station = -240; station < survey.length + 240; station += 12) {
      for (let i = 1; i < laneCount; i++) {
        addBox(`lane-${tube}-${station}-${i}`, tube, station + 2, -4.3 + (i * 8.6) / laneCount, 0.235, 4, 0.15, 0.025, roadPaint)
      }
    }

    // 3. 两侧边缘实线、多停车带虚线/外边线、检修道与电缆托架
    for (const side of [-1, 1] as const) {
      const sideBays = bays.filter(bay => (bay.sideSign === 1 ? outerSide : innerSide) === side)
      const access = survey.project?.portalAccess
      const accessEnabled = access ? access.enabled : false
      const accessStart = access?.start ?? portalAccessDefaults.start
      const accessEnd = access?.end ?? portalAccessDefaults.end

      const baseIntervals: Array<[number, number]> =
        side === innerSide && accessEnabled
          ? [
              [-240, -PORTAL_EXTENSION + accessStart],
              [-PORTAL_EXTENSION + accessEnd, survey.length + PORTAL_EXTENSION - accessEnd],
              [survey.length + PORTAL_EXTENSION - accessStart, survey.length + 240],
            ]
          : [[-240, survey.length + 240]]

      const cutouts: Array<[number, number]> = sideBays.map(b => [b.start, b.end])
      for (const [baseA, baseB] of baseIntervals) {
        for (const [a, b] of subtractIntervals(baseA, baseB, cutouts)) {
          for (let s = a; s < b; s += 12) {
            const extent = Math.min(12, b - s)
            addBox(`edge-${tube}-${side}-${s}`, tube, s + extent / 2, side * 4.35, 0.25, extent, 0.14, 0.025, roadPaint)
          }
        }
      }

      for (const bay of sideBays) {
        for (let s = bay.start; s < bay.end; s += 6) {
          addBox(`bay-dash-${bay.id}-${s}`, tube, s + 1.5, side * 4.35, 0.245, 3, 0.14, 0.025, roadPaint)
        }
        const outerLineY = 4.35 + bay.width - 0.1
        for (let s = bay.flatStart + 2; s < bay.flatEnd; s += 4) {
          addBox(`bay-edge-${bay.id}-${s}`, tube, s, side * outerLineY, 0.245, 3.8, 0.14, 0.025, roadPaint)
        }
        viewer.entities.add({
          id: `studio-facility:${bay.id}:label`,
          name: bay.name,
          position: tunnelPoint(survey, tube, bay.center, side * (4.8 + bay.width * 0.65), 2.3),
          label: {
            text: `P ${bay.name}`,
            font: '13px sans-serif',
            fillColor: Color.WHITE,
            showBackground: true,
            backgroundColor: Color.fromCssColorString('#0d63c4'),
            backgroundPadding: new Cartesian2(8, 5),
            distanceDisplayCondition: new DistanceDisplayCondition(0, 140),
          },
        })
      }

      const stations = studioProjectStations(doc, survey, tube)
      for (let i = 1; i < stations.length; i++) {
        const start = stations[i - 1]!
        const end = stations[i]!
        const mid = (start + end) / 2
        const opening = side === innerSide && passages.some(p => Math.abs(mid - p.station) < p.halfWidth)
        if (!opening) {
          addStrip(`walkway-${tube}-${side}-${start}`, tube, side, start, end, 5, 0.36, 0.9, 0.32, '#a7aaa0')
          addStrip(`curb-cap-${tube}-${side}-${start}`, tube, side, start, end, 4.57, 0.5, 0.16, 0.055, '#d0d0bc')
        }
      }

      for (const [y, z, w, h] of [
        [4.9, 3.88, 0.045, 0.13],
        [5.15, 3.88, 0.045, 0.13],
        [5.03, 3.82, 0.3, 0.045],
      ]) {
        const path = stations.map(station => {
          const width = studioLayByWidthAt(station, doc, survey, tube, side)
          const vehicle = passages.find(p => p.vehicle && Math.abs(station - p.station) < p.halfWidth + 3)
          const lift =
            side === innerSide && vehicle
              ? Math.max(0, Math.min(1, (vehicle.halfWidth + 3 - Math.abs(station - vehicle.station)) / 3))
              : 0
          return tunnelPoint(survey, tube, station, side * (y! + width - lift * 0.6), z! + lift * 1.5)
        })
        trays.push(
          viewer.entities.add({
            polylineVolume: {
              positions: path,
              cornerType: CornerType.MITERED,
              shape: [
                new Cartesian2(-w! / 2, -h! / 2),
                new Cartesian2(w! / 2, -h! / 2),
                new Cartesian2(w! / 2, h! / 2),
                new Cartesian2(-w! / 2, h! / 2),
              ],
              material: Color.fromCssColorString('#63736b'),
            },
          }),
        )
      }
    }
  }

  // 4. 洞内横向贯通通道（人行横洞、车行横洞、洞内联络通道统一管线：主墙开孔 + 拱形壳体 + PBR 沥青地面）
  if (boreIndices(survey).includes(0) && survey.tubes.length >= 2) {
    passages.forEach(passage => {
      const { id, station, length, halfWidth: w, height: h, archRise, kind, name, lateralOffset, heightOffset } = passage
      const c0 = tunnelPoint(survey, 0, station, lateralOffset, 0.2 + heightOffset)
      const c1 = tunnelPoint(survey, 1, station, lateralOffset, 0.2 + heightOffset)
      const boreDistance = Cartesian3.distance(c0, c1)
      const defaultClearSpan = Math.max(2, boreDistance - 11.2)
      const actualLength = Math.max(1, length ?? defaultClearSpan)
      const mid = Cartesian3.midpoint(c0, c1, new Cartesian3())
      const axis = Cartesian3.normalize(Cartesian3.subtract(c1, c0, new Cartesian3()), new Cartesian3())
      const halfVec = Cartesian3.multiplyByScalar(axis, actualLength / 2, new Cartesian3())
      const a = Cartesian3.subtract(mid, halfVec, new Cartesian3())
      const b = Cartesian3.add(mid, halfVec, new Cartesian3())

      const shape = [new Cartesian2(-w - 0.3, 0.2), new Cartesian2(-w - 0.3, h)]
      for (let i = 0; i <= 40; i++) {
        const angle = Math.PI - (i * Math.PI) / 40
        shape.push(new Cartesian2((w + 0.3) * Math.cos(angle), h + (archRise + 0.3) * Math.sin(angle)))
      }
      shape.push(new Cartesian2(w + 0.3, 0.2), new Cartesian2(w, 0.2), new Cartesian2(w, h))
      for (let i = 0; i <= 40; i++) {
        const angle = (i * Math.PI) / 40
        shape.push(new Cartesian2(w * Math.cos(angle), h + archRise * Math.sin(angle)))
      }
      shape.push(new Cartesian2(-w, 0.2))

      const entity = viewer.entities.add({
        id: `studio-facility:${id}:body`,
        name,
        polylineVolume: {
          positions: [a, b],
          cornerType: CornerType.MITERED,
          shape,
          material: Color.fromCssColorString('#647180'),
        },
      })
      crossWalls.push({ entity, station })

      // 通道沥青地面：与主隧道地面（z = 0.2）齐平（0.21 防闪烁），使用同一套 asphalt PBR 贴图与 4m UV
      const along = Cartesian3.normalize(
        Cartesian3.subtract(
          tunnelPoint(survey, 0, station + 1, lateralOffset, 0.21 + heightOffset),
          tunnelPoint(survey, 0, station, lateralOffset, 0.21 + heightOffset),
          new Cartesian3(),
        ),
        new Cartesian3(),
      )
      const floorMid = Cartesian3.midpoint(
        tunnelPoint(survey, 0, station, lateralOffset, 0.21 + heightOffset),
        tunnelPoint(survey, 1, station, lateralOffset, 0.21 + heightOffset),
        new Cartesian3(),
      )
      addAsphaltPatch(`studio-facility:${id}:floor`, floorMid, along, axis, 2 * w, actualLength, station)

      const labelText = kind === 'connecting' ? name : `${name} · ${kind === 'vehicle' ? '车行' : '人行'}`
      const labelColor = kind === 'connecting' ? '#1f5f9e' : kind === 'vehicle' ? '#b86d10' : '#08764f'

      for (const tube of boreIndices(survey)) {
        const signSide = studioBoreInnerSide(survey, tube)
        viewer.entities.add({
          id: `studio-facility:${id}:sign:${tube}`,
          name,
          position: tunnelPoint(survey, tube, station, signSide * 5.1 + lateralOffset, 2.15 + heightOffset),
          label: {
            text: labelText,
            font: '13px sans-serif',
            fillColor: Color.WHITE,
            showBackground: true,
            backgroundColor: Color.fromCssColorString(labelColor),
            backgroundPadding: new Cartesian2(8, 5),
            distanceDisplayCondition: new DistanceDisplayCondition(0, 120),
          },
        })
      }
    })

    // 5. 洞口外联络通道（露天 PBR 沥青路面 + 导流标线；洞内联络通道已由上方统一贯通通道管线渲染）
    for (const cp of doc.facilities) {
      if (!cp.visible || cp.type !== 'connecting_passage' || cp.placement !== 'portal_outside') continue
      const isStart = cp.portalEnd === 'start'
      const station = isStart
        ? -PORTAL_EXTENSION - cp.station
        : survey.length + PORTAL_EXTENSION + cp.station

      const latOffset = cp.lateralOffset ?? 0
      const hOffset = cp.heightOffset ?? 0
      const pt0 = tunnelPoint(survey, 0, station, latOffset, 0.21 + hOffset)
      const pt1 = tunnelPoint(survey, 1, station, latOffset, 0.21 + hOffset)
      const midPoint = Cartesian3.midpoint(pt0, pt1, new Cartesian3())
      const acrossAxis = Cartesian3.normalize(Cartesian3.subtract(pt1, pt0, new Cartesian3()), new Cartesian3())
      const alongAxis = Cartesian3.normalize(
        Cartesian3.subtract(
          tunnelPoint(survey, 0, station + 1, latOffset, 0.21 + hOffset),
          pt0,
          new Cartesian3(),
        ),
        new Cartesian3(),
      )

      addAsphaltPatch(`studio-facility:${cp.id}:road`, midPoint, alongAxis, acrossAxis, cp.length, cp.width, station)
      if (cp.showMarkings) {
        for (const side of [-1, 1] as const) {
          const lineStation = station + side * (cp.length / 2 - 0.5)
          const lp0 = tunnelPoint(survey, 0, lineStation, latOffset + 4.2, 0.32 + hOffset)
          const lp1 = tunnelPoint(survey, 1, lineStation, latOffset - 4.2, 0.32 + hOffset)
          viewer.entities.add({
            id: `studio-facility:${cp.id}:line:${side}`,
            polyline: {
              positions: [lp0, lp1],
              width: 3,
              material: Color.fromCssColorString('#ffd147'),
            },
          })
        }
      }

      viewer.entities.add({
        id: `studio-facility:${cp.id}:label`,
        name: cp.name,
        position: Cartesian3.midpoint(
          tunnelPoint(survey, 0, station, latOffset, 2.2 + hOffset),
          tunnelPoint(survey, 1, station, latOffset, 2.2 + hOffset),
          new Cartesian3(),
        ),
        label: {
          text: cp.name,
          font: '13px sans-serif',
          fillColor: Color.WHITE,
          showBackground: true,
          backgroundColor: Color.fromCssColorString('#1f5f9e'),
          backgroundPadding: new Cartesian2(8, 5),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 180),
        },
      })
    }
  }

  const primitive = viewer.scene.primitives.add(
    new Primitive({
      geometryInstances: boxes,
      appearance: new PerInstanceColorAppearance({ flat: true, translucent: false, closed: true }),
      asynchronous: false,
    }),
  )

  let state = initialSystems
  function update(next: SystemsState): void {
    state = next
    if (!primitive.ready) return
    for (const surface of surfaces) {
      const { id, station, tube, color } = surface
      if (isRoadMarking(id)) {
        primitive.getGeometryInstanceAttributes(id).color = ColorGeometryInstanceAttribute.toValue(Color.WHITE)
        continue
      }
      let brightness = illuminationAt(station, survey.length, state, tube)
      if (station < -60 || station > survey.length + 60) {
        brightness = state.environment === 'day' ? 1 : state.street ? 0.48 : 0.025
      }
      primitive.getGeometryInstanceAttributes(id).color = ColorGeometryInstanceAttribute.toValue(
        new Color(color.red * brightness, color.green * brightness, color.blue * brightness, 1),
      )
    }
    for (const { entity, station } of crossWalls) {
      const light = Math.max(0.04, illuminationAt(station, survey.length, state))
      if (entity.polylineVolume) {
        entity.polylineVolume.material = new ColorMaterialProperty(new Color(0.39 * light, 0.44 * light, 0.5 * light, 1))
      }
    }
    for (const { material, station } of crossFloors) {
      const isExterior = station < -60 || station > survey.length + 60
      material.uniforms.u_light = isExterior
        ? state.environment === 'day'
          ? 0.92
          : 0.35
        : Math.max(0.08, illuminationAt(station, survey.length, state))
    }
    const level = illuminationAt(survey.length / 2, survey.length, state)
    for (const tray of trays) {
      if (tray.polylineVolume) {
        tray.polylineVolume.material = new ColorMaterialProperty(new Color(0.39 * level, 0.45 * level, 0.42 * level, 1))
      }
    }
    viewer.scene.requestRender()
  }

  const remove = viewer.scene.postRender.addEventListener(() => {
    if (primitive.ready) {
      update(state)
      remove()
    }
  })

  return {
    dispose: remove,
    setLighting: update,
    // 关闭隧道主墙体时保留横洞墙体独立可见，横洞显隐由自身设施开关独立控制
    setWallsVisible(_visible: boolean) {
      viewer.scene.requestRender()
    },
  }
}
