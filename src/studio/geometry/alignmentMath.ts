import type { GeoPoint, TunnelBoreConfig } from '../schema/tunnelSchema'

const EARTH_RADIUS_METERS = 6_378_137
const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

/** 由起止经纬度高程解算出的隧道轴线几何指标 */
export interface TunnelAlignmentMetrics {
  /** 水平投影长度（米） */
  horizontalLength: number
  /** 空间斜距全长（米） */
  slopeLength: number
  /** 方位角（度，正北为 0°，顺时针 0 ~ 360°） */
  headingDeg: number
  /** 纵坡坡度（%，正值上坡，负值下坡） */
  gradePercent: number
  /** 起止点高差（米） */
  elevationDelta: number
  /** 隧道中点经纬度与高程 */
  midpoint: GeoPoint
}

/**
 * 基于起止经纬度高程，采用局部等距投影快速解算隧道轴线几何指标。
 * 精度满足 20km 以内公路隧道工程级误差要求，且不依赖 Cesium 运行时，便于单元测试。
 */
export function computeAlignmentMetrics(start: GeoPoint, end: GeoPoint): TunnelAlignmentMetrics {
  const meanLatRad = ((start.latitude + end.latitude) * 0.5) * DEG_TO_RAD
  const deltaLatRad = (end.latitude - start.latitude) * DEG_TO_RAD
  const deltaLonRad = (end.longitude - start.longitude) * DEG_TO_RAD

  const east = deltaLonRad * Math.cos(meanLatRad) * EARTH_RADIUS_METERS
  const north = deltaLatRad * EARTH_RADIUS_METERS
  const horizontalLength = Math.hypot(east, north)
  const elevationDelta = end.elevation - start.elevation
  const slopeLength = Math.hypot(horizontalLength, elevationDelta)

  // 方位角：北为 0°，东为 90°
  const rawHeading = Math.atan2(east, north) * RAD_TO_DEG
  const headingDeg = ((rawHeading % 360) + 360) % 360
  const gradePercent = horizontalLength > 1e-3 ? (elevationDelta / horizontalLength) * 100 : 0

  return {
    horizontalLength: Number(horizontalLength.toFixed(2)),
    slopeLength: Number(slopeLength.toFixed(2)),
    headingDeg: Number(headingDeg.toFixed(2)),
    gradePercent: Number(gradePercent.toFixed(3)),
    elevationDelta: Number(elevationDelta.toFixed(2)),
    midpoint: {
      longitude: Number(((start.longitude + end.longitude) * 0.5).toFixed(6)),
      latitude: Number(((start.latitude + end.latitude) * 0.5).toFixed(6)),
      elevation: Number(((start.elevation + end.elevation) * 0.5).toFixed(2)),
    },
  }
}

/**
 * 根据起点坐标、水平长度、方位角与纵坡反算终点经纬度高程。
 * 用于在编辑器中快捷调整隧道长度或方位角。
 */
export function computeEndPointFromVector(
  start: GeoPoint,
  horizontalLength: number,
  headingDeg: number,
  gradePercent: number,
): GeoPoint {
  const headingRad = headingDeg * DEG_TO_RAD
  const east = horizontalLength * Math.sin(headingRad)
  const north = horizontalLength * Math.cos(headingRad)

  const startLatRad = start.latitude * DEG_TO_RAD
  const deltaLatDeg = (north / EARTH_RADIUS_METERS) * RAD_TO_DEG
  const deltaLonDeg = (east / (EARTH_RADIUS_METERS * Math.max(Math.cos(startLatRad), 1e-5))) * RAD_TO_DEG

  return {
    longitude: Number((start.longitude + deltaLonDeg).toFixed(6)),
    latitude: Number((start.latitude + deltaLatDeg).toFixed(6)),
    elevation: Number((start.elevation + (horizontalLength * gradePercent) / 100).toFixed(2)),
  }
}

/** 计算单个洞筒的净路面总宽（米） */
export function getBoreRoadWidth(bore: TunnelBoreConfig): number {
  return Number((bore.laneCount * bore.laneWidth).toFixed(2))
}

/** 计算单个洞筒的内部净宽（路面宽 + 两侧检修道） */
export function getBoreClearWidth(bore: TunnelBoreConfig, sidewalkWidth: number): number {
  return Number((getBoreRoadWidth(bore) + sidewalkWidth * 2).toFixed(2))
}

/** 将米制桩号格式化为标准公路桩号（例如 10320 -> K10+320） */
export function formatChainage(meters: number): string {
  const safe = Number.isFinite(meters) ? Math.round(meters) : 0
  if (safe < 0) return `K0${safe}`
  const km = Math.floor(safe / 1000)
  const remainder = safe - km * 1000
  return `K${km}+${String(remainder).padStart(3, '0')}`
}

/** 获取洞筒行车方向的中文标签 */
export function getBoreDirectionLabel(direction: TunnelBoreConfig['direction']): string {
  switch (direction) {
    case 'upbound':
      return '上行'
    case 'downbound':
      return '下行'
    case 'bidirectional':
      return '双向'
  }
}
