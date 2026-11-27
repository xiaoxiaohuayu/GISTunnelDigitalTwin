import type {
  FacilityCategory,
  FacilityType,
  TunnelBodyConfig,
  TunnelFacilityItem,
} from '../schema/tunnelSchema'
import { computeAlignmentMetrics } from '../geometry/alignmentMath'

/**
 * 设施注册表描述符：
 * 新增任何隧道设施或机电设备时，只需在此注册对应的元信息、工厂与校验逻辑，
 * 左侧面板、添加菜单和校验器会自动感知，无需修改核心流程代码。
 */
export interface FacilityDescriptor<T extends TunnelFacilityItem = TunnelFacilityItem> {
  type: T['type']
  label: string
  shortLabel: string
  category: FacilityCategory
  description: string
  /** 默认实例创建工厂 */
  createDefault: (tunnel: TunnelBodyConfig, existingCount: number) => T
  /** 单项配置校验，返回错误提示列表 */
  validate: (item: T, tunnel: TunnelBodyConfig, tunnelLength: number) => string[]
}

function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 7)
  return `${prefix}-${Date.now().toString(36)}-${random}`
}

function firstBoreId(tunnel: TunnelBodyConfig): string {
  return tunnel.bores[0]?.id ?? 'bore-up'
}

export const FACILITY_CATEGORIES: readonly { key: FacilityCategory; label: string }[] = [
  { key: 'portal', label: '洞口结构设施' },
  { key: 'passage', label: '横洞与联络通道' },
  { key: 'roadside', label: '洞内行车设施' },
  { key: 'signage', label: '洞口标牌标志' },
] as const

export const FACILITY_REGISTRY: Record<FacilityType, FacilityDescriptor> = {
  rain_canopy: {
    type: 'rain_canopy',
    label: '防雨棚',
    shortLabel: '防雨棚',
    category: 'portal',
    description: '洞口外接钢架采光遮雨棚，缓冲明暗过渡并阻挡雨水飘入。',
    createDefault: (tunnel, count) => ({
      id: createId('canopy'),
      type: 'rain_canopy',
      name: `防雨棚 #${count + 1}`,
      visible: true,
      boreId: tunnel.bores[count % Math.max(1, tunnel.bores.length)]?.id ?? firstBoreId(tunnel),
      portalEnd: count % 2 === 0 ? 'start' : 'end',
      // 新增防雨棚自动错开外延距离，避免与已有防雨棚完全重叠
      offsetFromPortal: 1 + Math.floor(count / Math.max(1, tunnel.bores.length * 2)) * 24,
      length: 21,
      ribSpacing: 7,
      roofColor: '#b8cedb',
      roofOpacity: 0.45,
      frameColor: '#7c929f',
    }),
    validate: (item, tunnel) => {
      const f = item as Extract<TunnelFacilityItem, { type: 'rain_canopy' }>
      const errors: string[] = []
      if (!tunnel.bores.some(b => b.id === f.boreId)) errors.push(`${f.name}：所属洞筒不存在`)
      if (f.length < 4 || f.length > 120) errors.push(`${f.name}：长度须在 4 ~ 120 m 之间`)
      if (f.ribSpacing < 2 || f.ribSpacing > 20) errors.push(`${f.name}：拱肋间距须在 2 ~ 20 m 之间`)
      return errors
    },
  },

  pedestrian_passage: {
    type: 'pedestrian_passage',
    label: '人行横洞',
    shortLabel: '人行横洞',
    category: 'passage',
    description: '连接双洞的人行应急疏散通道。',
    createDefault: (tunnel, count) => {
      const len = Math.max(200, computeAlignmentMetrics(tunnel.startPoint, tunnel.endPoint).horizontalLength)
      const span = tunnel.bores.length >= 2
        ? Math.max(4, Math.round(Math.abs(tunnel.bores[1]!.lateralOffset - tunnel.bores[0]!.lateralOffset) - 11))
        : 12
      return {
        id: createId('ped'),
        type: 'pedestrian_passage',
        name: `人行横洞 #${count + 1}`,
        visible: true,
        station: Math.round(len * Math.min(0.85, 0.25 + count * 0.2)),
        length: span,
        width: 2.2,
        height: 2.8,
        hasFireDoor: true,
        wallColor: '#d5dde5',
      }
    },
    validate: (item, _tunnel, tunnelLength) => {
      const f = item as Extract<TunnelFacilityItem, { type: 'pedestrian_passage' }>
      const errors: string[] = []
      if (f.station < 10 || f.station > Math.max(20, tunnelLength - 10)) {
        errors.push(`${f.name}：桩号位置须落在隧道有效范围内`)
      }
      if (f.width < 1.2 || f.width > 5) errors.push(`${f.name}：净宽须在 1.2 ~ 5 m 之间`)
      return errors
    },
  },

  vehicle_passage: {
    type: 'vehicle_passage',
    label: '车行横洞',
    shortLabel: '车行横洞',
    category: 'passage',
    description: '供救援与应急车辆掉头转换的双洞车行通道，支持正交/斜交角度。',
    createDefault: (tunnel, count) => {
      const len = Math.max(200, computeAlignmentMetrics(tunnel.startPoint, tunnel.endPoint).horizontalLength)
      const span = tunnel.bores.length >= 2
        ? Math.max(4, Math.round(Math.abs(tunnel.bores[1]!.lateralOffset - tunnel.bores[0]!.lateralOffset) - 11))
        : 12
      return {
        id: createId('veh'),
        type: 'vehicle_passage',
        name: `车行横洞 #${count + 1}`,
        visible: true,
        station: Math.round(len * Math.min(0.85, 0.5 + count * 0.2)),
        length: span,
        width: 4.5,
        height: 5.0,
        skewAngle: 60,
        hasRollerDoor: true,
        wallColor: '#cfd8e3',
      }
    },
    validate: (item, _tunnel, tunnelLength) => {
      const f = item as Extract<TunnelFacilityItem, { type: 'vehicle_passage' }>
      const errors: string[] = []
      if (f.station < 20 || f.station > Math.max(30, tunnelLength - 20)) {
        errors.push(`${f.name}：桩号位置须落在隧道有效范围内`)
      }
      if (f.width < 3 || f.width > 8) errors.push(`${f.name}：净宽须在 3 ~ 8 m 之间`)
      return errors
    },
  },

  connecting_passage: {
    type: 'connecting_passage',
    label: '联络通道',
    shortLabel: '联络通道',
    category: 'passage',
    description: '支持洞口外中央分隔带转换通道或洞内设备/应急联络通道。',
    createDefault: (_tunnel, count) => ({
      id: createId('conn'),
      type: 'connecting_passage',
      name: `联络通道 #${count + 1}`,
      visible: true,
      placement: 'portal_outside',
      portalEnd: count % 2 === 0 ? 'start' : 'end',
      station: 45,
      length: 24,
      width: 14,
      height: 3.4,
      showMarkings: true,
    }),
    validate: (item) => {
      const f = item as Extract<TunnelFacilityItem, { type: 'connecting_passage' }>
      const errors: string[] = []
      if (f.length < 4 || f.length > 80) errors.push(`${f.name}：通道长度须在 4 ~ 80 m 之间`)
      if (f.width < 2 || f.width > 40) errors.push(`${f.name}：通道宽度须在 2 ~ 40 m 之间`)
      return errors
    },
  },

  parking_bay: {
    type: 'parking_bay',
    label: '停车带',
    shortLabel: '停车带',
    category: 'roadside',
    description: '洞内加宽型紧急停车带，包含渐变段、停靠段与 P 字引导标志。',
    createDefault: (tunnel, count) => {
      const len = Math.max(200, computeAlignmentMetrics(tunnel.startPoint, tunnel.endPoint).horizontalLength)
      return {
        id: createId('bay'),
        type: 'parking_bay',
        name: `紧急停车带 #${count + 1}`,
        visible: true,
        boreId: tunnel.bores[count % Math.max(1, tunnel.bores.length)]?.id ?? firstBoreId(tunnel),
        station: Math.round(len * Math.min(0.82, 0.4 + count * 0.2)),
        length: 40,
        taperLength: 15,
        extraWidth: 3.5,
        side: 'right',
        showSignage: true,
      }
    },
    validate: (item, tunnel, tunnelLength) => {
      const f = item as Extract<TunnelFacilityItem, { type: 'parking_bay' }>
      const errors: string[] = []
      if (!tunnel.bores.some(b => b.id === f.boreId)) errors.push(`${f.name}：所属洞筒不存在`)
      if (f.station < 30 || f.station > Math.max(40, tunnelLength - 30)) {
        errors.push(`${f.name}：中心桩号须位于隧道内部`)
      }
      if (f.extraWidth < 2 || f.extraWidth > 6) errors.push(`${f.name}：加宽宽度须在 2 ~ 6 m 之间`)
      return errors
    },
  },

  portal_sign: {
    type: 'portal_sign',
    label: '入口标牌',
    shortLabel: '入口标牌',
    category: 'signage',
    description: '洞口前方隧道概况标牌，展示隧道名称、全长与安全行车提示。',
    createDefault: (tunnel, count) => ({
      id: createId('sign'),
      type: 'portal_sign',
      name: `入口标牌 #${count + 1}`,
      visible: true,
      boreId: tunnel.bores[count % Math.max(1, tunnel.bores.length)]?.id ?? firstBoreId(tunnel),
      portalEnd: count % 2 === 0 ? 'start' : 'end',
      offsetFromPortal: 52,
      mountType: 'cantilever',
      title: '',
      subtitle: 'Tunnel Digital Twin',
      lengthText: '',
      notice: '请开灯行驶',
      backgroundColor: '#007d65',
    }),
    validate: (item, tunnel) => {
      const f = item as Extract<TunnelFacilityItem, { type: 'portal_sign' }>
      const errors: string[] = []
      if (!tunnel.bores.some(b => b.id === f.boreId)) errors.push(`${f.name}：所属洞筒不存在`)
      if (f.offsetFromPortal < 5 || f.offsetFromPortal > 200) {
        errors.push(`${f.name}：距洞口距离须在 5 ~ 200 m 之间`)
      }
      return errors
    },
  },

  portal_traffic_sign: {
    type: 'portal_traffic_sign',
    label: '洞口交通标志',
    shortLabel: '交通标志',
    category: 'signage',
    description: '洞口门架/悬臂组合交通标志，支持自由增删限速、限高、禁变道等牌面。',
    createDefault: (tunnel, count) => ({
      id: createId('traffic'),
      type: 'portal_traffic_sign',
      name: `洞口交通标志 #${count + 1}`,
      visible: true,
      boreId: tunnel.bores[count % Math.max(1, tunnel.bores.length)]?.id ?? firstBoreId(tunnel),
      portalEnd: count % 2 === 0 ? 'start' : 'end',
      offsetFromPortal: 34,
      mountType: 'cantilever',
      signs: [
        { id: createId('badge'), preset: 'no_lane_change', value: '', label: '禁止变道' },
        { id: createId('badge'), preset: 'speed_limit', value: '80', label: '限速 80' },
        { id: createId('badge'), preset: 'height_limit', value: '4.5m', label: '限高 4.5m' },
      ],
    }),
    validate: (item, tunnel) => {
      const f = item as Extract<TunnelFacilityItem, { type: 'portal_traffic_sign' }>
      const errors: string[] = []
      if (!tunnel.bores.some(b => b.id === f.boreId)) errors.push(`${f.name}：所属洞筒不存在`)
      if (f.signs.length === 0) errors.push(`${f.name}：至少保留 1 块交通标志牌`)
      return errors
    },
  },
}

export const FACILITY_LIST: readonly FacilityDescriptor[] = Object.values(FACILITY_REGISTRY)

export function createFacilityByType(
  type: FacilityType,
  tunnel: TunnelBodyConfig,
  existingItems: TunnelFacilityItem[],
): TunnelFacilityItem {
  const sameTypeCount = existingItems.filter(item => item.type === type).length
  return FACILITY_REGISTRY[type].createDefault(tunnel, sameTypeCount)
}
