// @env browser
/**
 * 隧道防雨棚 3D 渲染模块（基于原版 src/engines/tunnelModel.ts 的防雨棚几何独立复制并重构）
 *
 * 与旧路由完全隔离：后续针对防雨棚的样式、尺寸、拱肋数量、材质透明度的所有迭代均只在此文件修改。
 */
import { Cartesian2, Color, CornerType } from 'cesium'
import type { Entity, Viewer } from 'cesium'
import type { TunnelSurvey } from '../../types/tunnel'
import { PROFILE_HALF } from '../../engines/sectionProfile'
import { tunnelPoint, PORTAL_EXTENSION } from '../../engines/tunnelDetails'
import type { RainCanopyFacility, TunnelSceneDocument } from '../schema/tunnelSchema'

const BASE_CANOPY_RADIUS = 5.53
const BASE_SPRING_HEIGHT = 2.5
const ARCH_SEGMENTS = 40

/**
 * 在 Cesium 视口中构建单个防雨棚（弧形半透明遮雨顶棚 + 多道钢结构拱肋）
 */
function createSingleCanopyEntities(
  viewer: Viewer,
  survey: TunnelSurvey,
  facility: RainCanopyFacility,
  tubeIndex: number,
): Entity[] {
  const created: Entity[] = []
  const bore = survey.project?.bores[tubeIndex]
  const carriagewayHalfWidth = bore ? (bore.lanes.length * bore.laneWidth) / 2 : PROFILE_HALF
  const radius = BASE_CANOPY_RADIUS + (carriagewayHalfWidth - PROFILE_HALF)

  const isStart = facility.portalEnd === 'start'
  const portalEdge = isStart ? -PORTAL_EXTENSION : survey.length + PORTAL_EXTENSION
  const outward = isStart ? -1 : 1

  const startStation = portalEdge + outward * facility.offsetFromPortal
  const endStation = startStation + outward * facility.length

  // 1. 构建弧形顶棚截面（沿用原版 0.1π ~ 0.9π 弧度与 0.08m 壳厚）
  const roofShape: Cartesian2[] = []
  for (const [r, reverse] of [
    [BASE_CANOPY_RADIUS, false],
    [BASE_CANOPY_RADIUS - 0.08, true],
  ] as const) {
    for (let i = 0; i <= ARCH_SEGMENTS; i++) {
      const ratio = reverse ? 1 - i / ARCH_SEGMENTS : i / ARCH_SEGMENTS
      const angle = Math.PI * (0.1 + 0.8 * ratio)
      roofShape.push(
        new Cartesian2(
          (r * Math.cos(angle) * radius) / BASE_CANOPY_RADIUS,
          BASE_SPRING_HEIGHT + r * Math.sin(angle),
        ),
      )
    }
  }

  // PolylineVolume 会把 shape.y 的最小值归零，这里显式加上 roofBase 保持高程准确
  const roofBaseElevation = Math.min(...roofShape.map(pt => pt.y))
  const lateralOffset = facility.lateralOffset ?? 0
  const heightOffset = facility.heightOffset ?? 0
  const roofMaterial = Color.fromCssColorString(facility.roofColor || '#b8cedb').withAlpha(
    Math.max(0.15, Math.min(0.95, facility.roofOpacity)),
  )

  created.push(
    viewer.entities.add({
      id: `studio-facility:${facility.id}:roof`,
      name: facility.name,
      polylineVolume: {
        positions: [startStation, endStation].map(s =>
          tunnelPoint(survey, tubeIndex, s, lateralOffset, roofBaseElevation + heightOffset),
        ),
        shape: roofShape,
        cornerType: CornerType.MITERED,
        material: roofMaterial,
      },
    }),
  )

  // 2. 构建钢结构拱肋截面（沿用原版 0.12m 钢梁截面厚度）
  const ribShape: Cartesian2[] = [
    new Cartesian2(radius, 0),
    new Cartesian2(radius, BASE_SPRING_HEIGHT),
  ]
  for (let i = 0; i <= ARCH_SEGMENTS; i++) {
    const angle = (i * Math.PI) / ARCH_SEGMENTS
    ribShape.push(
      new Cartesian2(radius * Math.cos(angle), BASE_SPRING_HEIGHT + BASE_CANOPY_RADIUS * Math.sin(angle)),
    )
  }
  ribShape.push(
    new Cartesian2(-radius, 0),
    new Cartesian2(-(radius - 0.12), 0),
    new Cartesian2(-(radius - 0.12), BASE_SPRING_HEIGHT),
  )
  for (let i = 0; i <= ARCH_SEGMENTS; i++) {
    const angle = Math.PI - (i * Math.PI) / ARCH_SEGMENTS
    ribShape.push(
      new Cartesian2(
        (radius - 0.12) * Math.cos(angle),
        BASE_SPRING_HEIGHT + (BASE_CANOPY_RADIUS - 0.12) * Math.sin(angle),
      ),
    )
  }
  ribShape.push(new Cartesian2(radius - 0.12, 0))

  const frameColor = Color.fromCssColorString(facility.frameColor || '#7c929f')
  const spacing = Math.max(2, facility.ribSpacing)
  const ribCount = Math.max(2, Math.floor(facility.length / spacing) + 1)

  for (let idx = 0; idx < ribCount; idx++) {
    const dist = Math.min(facility.length, idx * spacing)
    const station = startStation + outward * dist
    created.push(
      viewer.entities.add({
        id: `studio-facility:${facility.id}:rib:${idx}`,
        name: facility.name,
        polylineVolume: {
          positions: [station - 0.06, station + 0.06].map(s =>
            tunnelPoint(survey, tubeIndex, s, lateralOffset, heightOffset),
          ),
          shape: ribShape,
          cornerType: CornerType.MITERED,
          material: frameColor,
        },
      }),
    )
  }

  return created
}

/**
 * 渲染场景文档中全部已启用的防雨棚设施，并返回统一销毁句柄
 */
export function addStudioCanopies(
  viewer: Viewer,
  survey: TunnelSurvey,
  doc: TunnelSceneDocument,
): { entities: Entity[]; dispose: () => void } {
  const entities: Entity[] = []
  const canopyFacilities = doc.facilities.filter(
    (item): item is RainCanopyFacility => item.visible && item.type === 'rain_canopy',
  )

  for (const canopy of canopyFacilities) {
    const matchedIndex = survey.project?.bores.findIndex(b => b.id === canopy.boreId) ?? -1
    const tubeIndex = matchedIndex >= 0 ? matchedIndex : 0
    if (!survey.tubes[tubeIndex]) continue
    entities.push(...createSingleCanopyEntities(viewer, survey, canopy, tubeIndex))
  }

  return {
    entities,
    dispose() {
      for (const entity of entities) {
        if (!viewer.isDestroyed()) {
          viewer.entities.remove(entity)
        }
      }
    },
  }
}
