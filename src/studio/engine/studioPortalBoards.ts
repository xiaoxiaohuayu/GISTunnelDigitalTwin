// @env browser
/**
 * 隧道入口标牌 3D 渲染模块（基于原版 src/engines/portalBoards.ts 独立复制并重构）
 *
 * 保留原版悬臂立柱、双横臂、金属背板与高清牌面几何结构，
 * 改为直接由场景编辑器中的 `portal_sign` 设施列表驱动，支持增删、实时改字、换色与改距。
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
import { boreLength } from '../../engines/projectConfig'
import { surveyFrame } from '../../engines/projectSurvey'
import { PORTAL_EXTENSION, tunnelPoint } from '../../engines/tunnelDetails'
import type { PortalSignFacility, TunnelSceneDocument } from '../schema/tunnelSchema'
import { renderPortalSignBoardCanvas } from './signCanvasTextures'

export interface StudioPortalBoardsHandle {
  dispose: () => void
}

export function addStudioPortalBoards(
  viewer: Viewer,
  survey: TunnelSurvey,
  doc: TunnelSceneDocument,
): StudioPortalBoardsHandle {
  const entities: Entity[] = []
  const primitives: Primitive[] = []

  const signFacilities = doc.facilities.filter(
    (item): item is PortalSignFacility => item.visible && item.type === 'portal_sign',
  )

  for (const facility of signFacilities) {
    const matchedTube = survey.project?.bores.findIndex(b => b.id === facility.boreId) ?? -1
    const tube = matchedTube >= 0 ? matchedTube : 0
    if (!survey.tubes[tube]) continue

    const isStart = facility.portalEnd === 'start'
    const direction = isStart ? 1 : -1
    const length = survey.project ? boreLength(survey.project.bores[tube]!) : survey.length
    const station = isStart
      ? -PORTAL_EXTENSION - facility.offsetFromPortal
      : length + PORTAL_EXTENSION + facility.offsetFromPortal

    const lateralOffset = facility.lateralOffset ?? 0
    const heightOffset = facility.heightOffset ?? 0
    const center = tunnelPoint(survey, tube, station, (direction === 1 ? -4.8 : 4.8) + lateralOffset, heightOffset)
    const frame = surveyFrame(survey, center)
    const world = (x: number, y: number, z: number) =>
      Matrix4.multiplyByPoint(frame, new Cartesian3(x, y, z), new Cartesian3())

    const outer = -direction
    const poleY = outer * 2.25
    const armEnd = facility.mountType === 'gantry' ? -outer * 2.25 : -outer * 1.25
    const armOrientation = Quaternion.fromRotationMatrix(
      Matrix3.multiply(
        Matrix4.getMatrix3(frame, new Matrix3()),
        Matrix3.fromRotationX(Math.PI / 2),
        new Matrix3(),
      ),
    )

    // 主立柱（门架模式自动补齐对侧立柱）
    entities.push(
      viewer.entities.add({
        id: `studio-facility:${facility.id}:post`,
        name: facility.name,
        position: world(0.18 * direction, poleY, 4.65),
        cylinder: { length: 9.3, topRadius: 0.105, bottomRadius: 0.14, material: Color.SILVER },
      }),
    )
    if (facility.mountType === 'gantry') {
      entities.push(
        viewer.entities.add({
          id: `studio-facility:${facility.id}:post2`,
          name: facility.name,
          position: world(0.18 * direction, -poleY, 4.65),
          cylinder: { length: 9.3, topRadius: 0.105, bottomRadius: 0.14, material: Color.SILVER },
        }),
      )
    }

    // 双横臂
    for (const z of [6.65, 8.35]) {
      entities.push(
        viewer.entities.add({
          id: `studio-facility:${facility.id}:arm:${z}`,
          name: facility.name,
          position: world(0.18 * direction, (poleY + armEnd) / 2, z),
          orientation: armOrientation,
          cylinder: {
            length: Math.abs(poleY - armEnd),
            topRadius: 0.065,
            bottomRadius: 0.065,
            material: Color.SILVER,
          },
        }),
      )
    }

    // 标牌背板（显式绑定 frame 朝向，避免非 90° 方位角隧道中背板斜穿牌面）
    const boardOrientation = Quaternion.fromRotationMatrix(Matrix4.getMatrix3(frame, new Matrix3()))
    entities.push(
      viewer.entities.add({
        id: `studio-facility:${facility.id}:back`,
        name: facility.name,
        position: world(0, 0, 7.475),
        orientation: boardOrientation,
        box: {
          dimensions: new Cartesian3(0.14, 3.8, 2.85),
          material: Color.fromCssColorString('#77847c'),
        },
      }),
    )

    // 高清 Canvas 牌面（沿用原版 MaterialAppearance 与自发光混合着色）
    const imageUrl = renderPortalSignBoardCanvas(facility, doc.tunnel.name, length)
    const material = new Material({
      fabric: {
        type: 'StudioPortalBoard',
        uniforms: { image: imageUrl },
        source: `czm_material czm_getMaterial(czm_materialInput materialInput) {
          czm_material m = czm_getDefaultMaterial(materialInput);
          vec3 tex = texture(image, materialInput.st).rgb;
          m.diffuse = tex * 0.35;
          m.emission = tex * 0.65;
          return m;
        }`,
      },
      translucent: false,
    })

    const corners =
      direction === 1
        ? [
            [1.9, 6.05],
            [-1.9, 6.05],
            [-1.9, 8.9],
            [1.9, 8.9],
          ]
        : [
            [-1.9, 6.05],
            [1.9, 6.05],
            [1.9, 8.9],
            [-1.9, 8.9],
          ]
    const positions = corners.flatMap(([y, z]) => {
      const p = world(-direction * 0.081, y!, z!)
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
        geometryInstances: new GeometryInstance({
          id: `studio-facility:${facility.id}:face`,
          geometry,
        }),
        appearance: new MaterialAppearance({
          material,
          materialSupport: MaterialAppearance.MaterialSupport.TEXTURED,
          closed: false,
          faceForward: true,
        }),
      }),
    )
    primitives.push(primitive)
  }

  return {
    dispose() {
      if (viewer.isDestroyed()) return
      for (const entity of entities) viewer.entities.remove(entity)
      for (const primitive of primitives) viewer.scene.primitives.remove(primitive)
    },
  }
}
