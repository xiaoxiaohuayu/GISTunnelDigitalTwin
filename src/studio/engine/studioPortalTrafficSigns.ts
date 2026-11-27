// @env browser
/**
 * 洞口交通标志 3D 渲染模块（基于原版 src/engines/portalTrafficSigns.ts 独立复制并重构）
 *
 * 保留原版立柱/悬臂/门架与圆形标志盘着色器几何，
 * 扩展为支持任意数量的标志牌组（限速、禁变道、限高、开灯、禁鸣笛、自定义文字）。
 */
import {
  BoundingSphere,
  Cartesian3,
  Color,
  ComponentDatatype,
  Geometry,
  GeometryAttribute,
  GeometryAttributes,
  GeometryInstance,
  GeometryPipeline,
  Material,
  MaterialAppearance,
  Matrix3,
  Matrix4,
  Primitive,
  PrimitiveType,
  Quaternion,
} from 'cesium'
import type { Entity, Viewer } from 'cesium'
import type { TunnelSurvey } from '../../types/tunnel'
import { portalAlong, portalLateral } from '../../engines/portalGeometry'
import { surveyFrame } from '../../engines/projectSurvey'
import { PORTAL_EXTENSION, tunnelPoint } from '../../engines/tunnelDetails'
import type { PortalTrafficSignFacility, TunnelSceneDocument } from '../schema/tunnelSchema'
import { renderTrafficSignBadgeCanvas } from './signCanvasTextures'

export interface StudioPortalTrafficSignsHandle {
  dispose: () => void
}

export function addStudioPortalTrafficSigns(
  viewer: Viewer,
  survey: TunnelSurvey,
  doc: TunnelSceneDocument,
): StudioPortalTrafficSignsHandle {
  const entities: Entity[] = []
  const primitives: Primitive[] = []

  const trafficFacilities = doc.facilities.filter(
    (item): item is PortalTrafficSignFacility => item.visible && item.type === 'portal_traffic_sign',
  )

  for (const facility of trafficFacilities) {
    if (facility.signs.length === 0) continue

    const end: 0 | 1 = facility.portalEnd === 'start' ? 0 : 1
    const origin = survey.actualPointAt
      ? survey.actualPointAt(
          0,
          end === 0 ? -PORTAL_EXTENSION : survey.length + PORTAL_EXTENSION,
          survey.project!.bores[0]!.offset,
          0,
        )
      : tunnelPoint(survey, 0, end === 0 ? -PORTAL_EXTENSION : survey.length + PORTAL_EXTENSION, 12)

    const rotation = Matrix3.multiply(
      Matrix3.fromRotationY(-Math.atan(survey.grade / 100)),
      Matrix3.fromRotationZ(end * Math.PI),
      new Matrix3(),
    )
    const frame = Matrix4.multiply(
      surveyFrame(survey, origin),
      Matrix4.fromRotationTranslation(rotation),
      new Matrix4(),
    )

    const matchedTube = survey.project?.bores.findIndex(b => b.id === facility.boreId) ?? 0
    const baseSourceY = matchedTube === 1 ? 12 : -12
    const alongShift = survey.project ? portalAlong(survey.project, end, baseSourceY) : 0
    const lateralShift = survey.project ? portalLateral(survey.project, end, baseSourceY) - baseSourceY : 0

    const lateralOffset = facility.lateralOffset ?? 0
    const heightOffset = facility.heightOffset ?? 0
    const world = (x: number, y: number, z: number) =>
      Matrix4.multiplyByPoint(
        frame,
        new Cartesian3(
          x + alongShift,
          y + lateralShift + (end === 0 ? lateralOffset : -lateralOffset),
          z + heightOffset,
        ),
        new Cartesian3(),
      )

    const orientation = (axis: Cartesian3, angle: number) =>
      Quaternion.fromRotationMatrix(
        Matrix3.multiply(
          Matrix4.getMatrix3(frame, new Matrix3()),
          Matrix3.fromQuaternion(Quaternion.fromAxisAngle(axis, angle)),
          new Matrix3(),
        ),
      )

    const stationX = -facility.offsetFromPortal
    const centerY = baseSourceY
    const beamSpan = Math.max(8.9, facility.signs.length * 1.85 + 2.4)
    const leftPoleY = centerY - beamSpan / 2 - 0.6
    const rightPoleY = centerY + beamSpan / 2 + 0.6

    // 立柱（门架模式绘制双立柱，悬臂模式绘制外侧单立柱）
    entities.push(
      viewer.entities.add({
        id: `studio-facility:${facility.id}:post`,
        name: facility.name,
        position: world(stationX, leftPoleY, 3.8),
        orientation: orientation(Cartesian3.UNIT_Z, 0),
        cylinder: { length: 7.4, topRadius: 0.095, bottomRadius: 0.095, material: Color.SILVER },
      }),
    )
    if (facility.mountType === 'gantry') {
      entities.push(
        viewer.entities.add({
          id: `studio-facility:${facility.id}:post2`,
          name: facility.name,
          position: world(stationX, rightPoleY, 3.8),
          orientation: orientation(Cartesian3.UNIT_Z, 0),
          cylinder: { length: 7.4, topRadius: 0.095, bottomRadius: 0.095, material: Color.SILVER },
        }),
      )
    }

    // 横梁
    entities.push(
      viewer.entities.add({
        id: `studio-facility:${facility.id}:beam`,
        name: facility.name,
        position: world(stationX, centerY, 6.95),
        orientation: orientation(Cartesian3.UNIT_X, Math.PI / 2),
        cylinder: {
          length: beamSpan + 1.2,
          topRadius: 0.075,
          bottomRadius: 0.075,
          material: Color.SILVER,
        },
      }),
    )

    // 圆形交通标志盘阵列（支持任意数量标志）
    const count = facility.signs.length
    const spacing = 1.65
    facility.signs.forEach((badge, idx) => {
      const y = centerY + (idx - (count - 1) / 2) * spacing
      const badgeId = `studio-facility:${facility.id}:badge:${badge.id}`

      // 金属圆形背板
      entities.push(
        viewer.entities.add({
          id: `${badgeId}:back`,
          name: `${facility.name}-${badge.label}`,
          position: world(stationX - 0.15, y, 6.95),
          orientation: orientation(Cartesian3.UNIT_Y, Math.PI / 2),
          cylinder: { length: 0.08, topRadius: 0.65, bottomRadius: 0.65, material: Color.SILVER },
        }),
      )

      const textureUrl =
        badge.preset === 'custom_image' && badge.imageDataUrl
          ? badge.imageDataUrl
          : renderTrafficSignBadgeCanvas(badge)
      const material = new Material({
        fabric: {
          type: 'StudioTrafficSignDisc',
          uniforms: { image: textureUrl, level: 1 },
          source: `czm_material czm_getMaterial(czm_materialInput materialInput) {
            if (distance(materialInput.st, vec2(0.5)) > 0.5) discard;
            czm_material m = czm_getDefaultMaterial(materialInput);
            vec4 tex = texture(image, materialInput.st);
            vec3 c = mix(vec3(1.0), tex.rgb, tex.a);
            m.diffuse = c * 0.65 * level;
            m.emission = c * 0.35 * level;
            return m;
          }`,
        },
        translucent: false,
      })

      const positions = [
        [y + 0.65, 6.3],
        [y - 0.65, 6.3],
        [y - 0.65, 7.6],
        [y + 0.65, 7.6],
      ].flatMap(([lateral, z]) => {
        const p = world(stationX - 0.205, lateral!, z!)
        return [p.x, p.y, p.z]
      })

      const attributes = new GeometryAttributes()
      attributes.position = new GeometryAttribute({
        componentDatatype: ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: new Float64Array(positions),
      })
      attributes.st = new GeometryAttribute({
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 2,
        values: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      })

      const geometry = GeometryPipeline.computeNormal(
        new Geometry({
          attributes,
          indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
          primitiveType: PrimitiveType.TRIANGLES,
          boundingSphere: BoundingSphere.fromVertices(positions),
        }),
      )

      const primitive = viewer.scene.primitives.add(
        new Primitive({
          asynchronous: false,
          compressVertices: false,
          geometryInstances: new GeometryInstance({ id: badgeId, geometry }),
          appearance: new MaterialAppearance({
            material,
            materialSupport: MaterialAppearance.MaterialSupport.TEXTURED,
            faceForward: true,
            closed: false,
          }),
        }),
      )
      primitives.push(primitive)
    })
  }

  return {
    dispose() {
      if (viewer.isDestroyed()) return
      for (const entity of entities) viewer.entities.remove(entity)
      for (const primitive of primitives) viewer.scene.primitives.remove(primitive)
    },
  }
}
