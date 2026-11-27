/**
 * 新路由隧道内部设施布局引擎（基于原版 src/engines/facilityLayout.ts 独立复制并扩展）
 *
 * 相比原版的扩展：
 * - 支持同一洞筒内配置【任意多个】紧急停车带（原版仅取第一条 layby）；
 * - 每个紧急停车带均严格遵循各自的中心位置 station、有效长度 length、渐变段 taperLength、
 *   加宽宽度 extraWidth 与布设侧 side，不再固定写死尺寸或互相覆盖；
 * - 人行横洞、车行横洞与洞内联络通道均按实配参数生成开孔与断面加密采样点。
 */
import type { TunnelSurvey } from '../../types/tunnel'
import type {
  ConnectingPassageFacility,
  ParkingBayFacility,
  TunnelSceneDocument,
} from '../schema/tunnelSchema'

export interface StudioPassageLayout {
  id: string
  station: number
  /** 横洞长度（米，未指定时由渲染层按双洞内壁净距自动计算） */
  length?: number
  halfWidth: number
  height: number
  archRise: number
  vehicle: boolean
  kind: 'pedestrian' | 'vehicle' | 'connecting'
  name: string
  lateralOffset: number
  heightOffset: number
}

export interface StudioLayByLayout {
  id: string
  name: string
  center: number
  start: number
  flatStart: number
  flatEnd: number
  end: number
  width: number
  taper: number
  /** +1 表示洞筒外侧（默认），-1 表示洞筒内侧 */
  sideSign: 1 | -1
}

/**
 * 计算指定洞筒指向对向洞筒的内侧方向（在局部坐标 Y 中，洞筒中心位于 -bore.offset）：
 * - 若当前洞筒 offset <= 对向洞筒 offset，则当前洞筒在 +Y 侧，内侧指向 -1；
 * - 反之当前洞筒在 -Y 侧，内侧指向 +1。
 */
export function studioBoreInnerSide(survey: TunnelSurvey, tubeIndex: number): -1 | 1 {
  const bores = survey.project?.bores
  if (!bores || bores.length < 2) return tubeIndex === 0 ? -1 : 1
  const myOffset = bores[tubeIndex]?.offset ?? (tubeIndex === 0 ? -12 : 12)
  const otherOffset = bores[tubeIndex === 0 ? 1 : 0]?.offset ?? (tubeIndex === 0 ? 12 : -12)
  return myOffset <= otherOffset ? -1 : 1
}

/**
 * 获取全部洞内横向贯通通道（人行横洞、车行横洞、洞内联络通道）统一布局
 */
export function studioLayoutPassages(doc: TunnelSceneDocument, survey: TunnelSurvey): StudioPassageLayout[] {
  if (survey.tubes.length < 2) return []

  const results: StudioPassageLayout[] = []

  for (const f of doc.facilities) {
    if (!f.visible) continue
    if (f.type === 'pedestrian_passage' || f.type === 'vehicle_passage') {
      const isVehicle = f.type === 'vehicle_passage'
      const halfWidth = Math.max(0.8, f.width / 2)
      const archRise = isVehicle ? Math.min(1.6, halfWidth * 0.65) : Math.min(0.8, halfWidth * 0.55)
      const straightHeight = Math.max(1.8, f.height - archRise)
      results.push({
        id: f.id,
        station: Math.max(10, Math.min(survey.length - 10, f.station)),
        length: f.length,
        halfWidth,
        height: straightHeight,
        archRise,
        vehicle: isVehicle,
        kind: isVehicle ? 'vehicle' : 'pedestrian',
        name: f.name,
        lateralOffset: f.lateralOffset ?? 0,
        heightOffset: f.heightOffset ?? 0,
      })
    } else if (f.type === 'connecting_passage' && f.placement === 'interior') {
      const cp = f as ConnectingPassageFacility
      const halfWidth = Math.max(0.8, cp.length / 2)
      const archRise = Math.min(1.2, Math.max(0.4, cp.height * 0.25))
      const straightHeight = Math.max(1.8, cp.height - archRise)
      results.push({
        id: cp.id,
        station: Math.max(10, Math.min(survey.length - 10, cp.station)),
        length: cp.width,
        halfWidth,
        height: straightHeight,
        archRise,
        vehicle: false,
        kind: 'connecting',
        name: cp.name,
        lateralOffset: cp.lateralOffset ?? 0,
        heightOffset: cp.heightOffset ?? 0,
      })
    }
  }

  return results
}

/**
 * 获取指定洞筒上的全部紧急停车带布局（支持同洞筒多个停车带）
 */
export function studioLayoutLayBys(
  doc: TunnelSceneDocument,
  survey: TunnelSurvey,
  tubeIndex: number,
): StudioLayByLayout[] {
  const bore = survey.project?.bores[tubeIndex]
  if (!bore) return []
  const outer: -1 | 1 = studioBoreInnerSide(survey, tubeIndex) === 1 ? -1 : 1
  const studioBore = doc.tunnel.bores.find(b => b.id === bore.id)
  const travelSign = studioBore?.direction === 'downbound' ? -1 : 1

  return doc.facilities
    .filter(
      (f): f is ParkingBayFacility =>
        f.visible && f.type === 'parking_bay' && f.boreId === bore.id,
    )
    .map(bay => {
      const taper = Math.max(4, bay.taperLength)
      const halfFlat = Math.max(5, bay.length / 2)
      const center = Math.max(halfFlat + taper + 2, Math.min(survey.length - halfFlat - taper - 2, bay.station))
      // 默认按行车右侧加宽，若选择左侧则映射到另一侧
      const desiredLateralSign = (bay.side === 'right' ? 1 : -1) * travelSign
      const sideSign: 1 | -1 = desiredLateralSign === outer ? 1 : -1
      return {
        id: bay.id,
        name: bay.name,
        center,
        start: center - halfFlat - taper,
        flatStart: center - halfFlat,
        flatEnd: center + halfFlat,
        end: center + halfFlat + taper,
        width: Math.max(1.5, bay.extraWidth),
        taper,
        sideSign,
      }
    })
}

/**
 * 计算某一桩号处、某一侧（side = -1 或 +1）的停车带平滑加宽量（米）
 * 支持同洞筒内多个停车带叠加取最大值
 */
export function studioLayByWidthAt(
  station: number,
  doc: TunnelSceneDocument,
  survey: TunnelSurvey,
  tubeIndex: number,
  side: -1 | 1,
): number {
  const outer: -1 | 1 = studioBoreInnerSide(survey, tubeIndex) === 1 ? -1 : 1
  const bays = studioLayoutLayBys(doc, survey, tubeIndex)
  let maxWidth = 0

  for (const bay of bays) {
    const baySide = bay.sideSign === 1 ? outer : -outer
    if (baySide !== side) continue
    if (station <= bay.start || station >= bay.end) continue

    const ramp = Math.min((station - bay.start) / bay.taper, (bay.end - station) / bay.taper, 1)
    const t = Math.max(0, ramp)
    const smooth = bay.width * t * t * (3 - 2 * t)
    if (smooth > maxWidth) maxWidth = smooth
  }

  return maxWidth
}

/**
 * 生成沿隧道纵向的断面采样桩号集合（在所有停车带渐变段与所有横洞开口处自动加密）
 */
export function studioProjectStations(
  doc: TunnelSceneDocument,
  survey: TunnelSurvey,
  tubeIndex: number,
): number[] {
  const stations: number[] = [-60, survey.length + 60]
  for (let x = -60; x < survey.length + 60; x += 2) {
    stations.push(x)
  }

  for (const bay of studioLayoutLayBys(doc, survey, tubeIndex)) {
    stations.push(bay.start, bay.flatStart, bay.flatEnd, bay.end)
    for (const segStart of [bay.start, bay.flatEnd]) {
      for (let x = segStart; x <= segStart + bay.taper; x += 0.5) {
        stations.push(x)
      }
    }
  }

  for (const passage of studioLayoutPassages(doc, survey)) {
    for (let i = 0; i <= 40; i++) {
      stations.push(passage.station - passage.halfWidth + (2 * passage.halfWidth * i) / 40)
    }
  }

  return [...new Set(stations)].sort((a, b) => a - b)
}
