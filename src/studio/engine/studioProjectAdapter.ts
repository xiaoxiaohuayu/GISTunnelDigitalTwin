import type {
  AssetRecord,
  BoreConfig,
  MouthName,
  PassageRecord,
  PortalAccessConfig,
  TunnelProject,
} from '../../engines/projectConfig'
import { projectSurvey } from '../../engines/projectSurvey'
import type { TunnelSurvey } from '../../types/tunnel'
import type {
  ParkingBayFacility,
  PedestrianPassageFacility,
  TunnelBoreConfig,
  TunnelSceneDocument,
  VehiclePassageFacility,
} from '../schema/tunnelSchema'
import { computeAlignmentMetrics } from '../geometry/alignmentMath'

export interface AdaptedTunnelScene {
  project: TunnelProject
  survey: TunnelSurvey
  length: number
}

function buildBoreLanes(bore: TunnelBoreConfig): BoreConfig['lanes'] {
  const count = Math.max(1, Math.min(6, Math.round(bore.laneCount)))
  return Array.from({ length: count }, (_, index) => {
    let direction: 1 | -1 = 1
    if (bore.direction === 'downbound') {
      direction = -1
    } else if (bore.direction === 'bidirectional') {
      direction = index < count / 2 ? -1 : 1
    }
    return {
      id: `${bore.id}-lane-${index + 1}`,
      direction,
    }
  })
}

/**
 * 将新版可扩展场景文档（TunnelSceneDocument）适配为原版高保真渲染管线所需的 TunnelProject 与 TunnelSurvey。
 *
 * 优势：
 * - 完整保留原版 GLB 拱形洞门、PBR 混凝土衬砌、横洞拱形开孔、平滑停车带加宽与洞口联络通道变形；
 * - 编辑器层继续面向可扩展的起止经纬度、多洞、设施注册表建模，与底层渲染实现解耦。
 */
export function adaptStudioDocToSurvey(doc: TunnelSceneDocument): AdaptedTunnelScene {
  const { tunnel, facilities } = doc
  const metrics = computeAlignmentMetrics(tunnel.startPoint, tunnel.endPoint)
  const horizontalLength = Math.max(80, Math.round(metrics.horizontalLength))

  // 原版洞口 GLB 支持 1～2 洞；这里取前两个可见洞筒作为主洞口，后续多洞可扩展独立参数化渲染
  const visibleBores = tunnel.bores.filter(bore => bore.visible)
  const activeBores = (visibleBores.length > 0 ? visibleBores : tunnel.bores).slice(0, 2)

  const bores: BoreConfig[] = activeBores.map((bore, index) => ({
    id: bore.id,
    name: bore.name,
    start: bore.startChainage,
    end: bore.startChainage + horizontalLength,
    // 原版坐标系中左侧洞筒为负偏移、右侧为正偏移；若仅单洞则允许自定义偏移
    offset: activeBores.length === 1 ? bore.lateralOffset : (bore.lateralOffset || (index === 0 ? -12 : 12)),
    laneWidth: Math.max(2.5, Math.min(4.5, bore.laneWidth)),
    lanes: buildBoreLanes(bore),
  }))

  // 1. 每个洞筒的起止洞口独立门头题字（优先取洞筒独立配置，其次回退隧道主名称）
  const mouths: MouthName[] = []
  for (const bore of activeBores) {
    const startTitle =
      bore.startPortalName?.trim() || tunnel.portalArch.startPortalTitle.trim() || tunnel.name.trim()
    const endTitle =
      bore.endPortalName?.trim() || tunnel.portalArch.endPortalTitle.trim() || tunnel.name.trim()
    if (startTitle) mouths.push({ boreId: bore.id, end: 0, name: startTitle.slice(0, 16) })
    if (endTitle) mouths.push({ boreId: bore.id, end: 1, name: endTitle.slice(0, 16) })
  }

  // 2. 人行横洞与车行横洞 -> passages（驱动原版衬砌拱形开孔与双洞横洞渲染）
  const passages: PassageRecord[] = facilities
    .filter(
      (f): f is PedestrianPassageFacility | VehiclePassageFacility =>
        f.visible && (f.type === 'pedestrian_passage' || f.type === 'vehicle_passage'),
    )
    .slice(0, 12)
    .map(f => ({
      station: Math.max(10, Math.min(horizontalLength - 10, f.station)),
      vehicle: f.type === 'vehicle_passage',
    }))

  // 3. 紧急停车带 -> layby 资产记录（驱动原版平滑三次样条加宽与停车带标线）
  const assets: AssetRecord[] = []
  const parkingBays = facilities.filter(
    (f): f is ParkingBayFacility => f.visible && f.type === 'parking_bay',
  )
  for (const bay of parkingBays) {
    const bore = bores.find(b => b.id === bay.boreId) ?? bores[0]
    if (!bore) continue
    assets.push({
      id: bay.id,
      code: bay.id,
      name: bay.name,
      kind: 'layby',
      boreId: bore.id,
      chainage: bore.start + Math.max(45, Math.min(horizontalLength - 45, bay.station)),
      lateral: 0,
      height: 0,
      heading: 0,
    })
  }

  // 4. 关闭 GLB 写死的洞口联络通道，统一由 studioTunnelDetails 渲染可自由三轴移动的联络通道
  const portalAccess: PortalAccessConfig = {
    enabled: false,
    start: -92,
    end: -68,
    halfWidth: 7.5,
  }

  const project: TunnelProject = {
    version: 2,
    id: doc.id,
    name: tunnel.name.trim() || '未命名隧道',
    origin: {
      longitude: tunnel.startPoint.longitude,
      latitude: tunnel.startPoint.latitude,
      elevation: tunnel.startPoint.elevation,
      heading: metrics.headingDeg,
      grade: metrics.gradePercent,
    },
    bores,
    assets,
    passages,
    portalAccess,
    mouths,
  }

  const survey = projectSurvey(project)
  return { project, survey, length: horizontalLength }
}
