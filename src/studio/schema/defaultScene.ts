import {
  STUDIO_SCHEMA_VERSION,
  type TunnelSceneDocument,
  type WallMaterialPreset,
} from './tunnelSchema'
import { DEMO_HEADING, DEMO_LATITUDE, DEMO_LONGITUDE } from '../../engines/sceneFrame'
import { computeAlignmentMetrics, computeEndPointFromVector } from '../geometry/alignmentMath'
import { FACILITY_REGISTRY } from '../registry/facilityRegistry'

export const WALL_MATERIAL_PRESETS: Record<
  WallMaterialPreset,
  { label: string; wallColor: string; archColor: string; wainscotColor: string }
> = {
  concrete: {
    label: '标准混凝土衬砌',
    wallColor: '#8d969f',
    archColor: '#5c646c',
    wainscotColor: '#cfd6dc',
  },
  fireproof_paint: {
    label: '浅灰防火涂料',
    wallColor: '#adb7c2',
    archColor: '#76818c',
    wainscotColor: '#e2e8ee',
  },
  ceramic_tile: {
    label: '搪瓷/瓷砖装饰板',
    wallColor: '#c7d2dc',
    archColor: '#66717c',
    wainscotColor: '#eef4f8',
  },
  dark_antiglare: {
    label: '深色防眩衬砌',
    wallColor: '#4c5661',
    archColor: '#303842',
    wainscotColor: '#8b97a4',
  },
}

/**
 * 创建默认隧道场景配置：
 * 默认坐落于原版验证过的山地隧道坐标（103.56, 30.91, 700m），
 * 并预置全部 7 类隧道设施，确保打开新路由即可获得与原版一致的高保真 3D 效果。
 */
export function createDefaultSceneDocument(): TunnelSceneDocument {
  const startPoint = {
    longitude: DEMO_LONGITUDE,
    latitude: DEMO_LATITUDE,
    elevation: 700,
  }
  const endPoint = computeEndPointFromVector(startPoint, 1200, DEMO_HEADING, 0)

  return {
    schemaVersion: STUDIO_SCHEMA_VERSION,
    id: 'studio-tunnel-01',
    updatedAt: new Date().toISOString(),
    tunnel: {
      name: '青山隧道',
      code: 'G42-QS-01',
      startPoint,
      endPoint,
      portalArch: {
        style: 'bamboo_cut',
        archColor: '#b7c0c7',
        textColor: '#e8eddf',
        depth: 6,
        headwallHeight: 2.6,
        startPortalTitle: '',
        endPortalTitle: '',
      },
      bores: [
        {
          id: 'bore-up',
          name: '上行洞',
          direction: 'upbound',
          laneCount: 2,
          laneWidth: 3.5,
          lateralOffset: -12,
          startChainage: 0,
          visible: true,
        },
        {
          id: 'bore-down',
          name: '下行洞',
          direction: 'downbound',
          laneCount: 2,
          laneWidth: 3.5,
          lateralOffset: 12,
          startChainage: 0,
          visible: true,
        },
      ],
    },
    wall: {
      visible: true,
      opacity: 1,
      materialPreset: 'concrete',
      wallColor: '#8d969f',
      archColor: '#5c646c',
      wainscotHeight: 2.4,
      wainscotColor: '#cfd6dc',
      springLineHeight: 2.5,
      archCrownHeight: 8.0,
      sidewalkWidth: 0.9,
      sidewalkHeight: 0.36,
      jointSpacing: 6,
    },
    facilities: [
      {
        id: 'canopy-start-up',
        type: 'rain_canopy',
        name: '西洞口防雨棚（上行洞）',
        visible: true,
        boreId: 'bore-up',
        portalEnd: 'start',
        offsetFromPortal: 1,
        length: 21,
        ribSpacing: 7,
        roofColor: '#b8cedb',
        roofOpacity: 0.45,
        frameColor: '#7c929f',
      },
      {
        id: 'canopy-start-down',
        type: 'rain_canopy',
        name: '西洞口防雨棚（下行洞）',
        visible: true,
        boreId: 'bore-down',
        portalEnd: 'start',
        offsetFromPortal: 1,
        length: 21,
        ribSpacing: 7,
        roofColor: '#b8cedb',
        roofOpacity: 0.45,
        frameColor: '#7c929f',
      },
      {
        id: 'canopy-end-up',
        type: 'rain_canopy',
        name: '东洞口防雨棚（上行洞）',
        visible: true,
        boreId: 'bore-up',
        portalEnd: 'end',
        offsetFromPortal: 1,
        length: 21,
        ribSpacing: 7,
        roofColor: '#b8cedb',
        roofOpacity: 0.45,
        frameColor: '#7c929f',
      },
      {
        id: 'canopy-end-down',
        type: 'rain_canopy',
        name: '东洞口防雨棚（下行洞）',
        visible: true,
        boreId: 'bore-down',
        portalEnd: 'end',
        offsetFromPortal: 1,
        length: 21,
        ribSpacing: 7,
        roofColor: '#b8cedb',
        roofOpacity: 0.45,
        frameColor: '#7c929f',
      },
      {
        id: 'ped-passage-1',
        type: 'pedestrian_passage',
        name: '人行横洞 #1',
        visible: true,
        station: 320,
        width: 2.2,
        height: 2.8,
        hasFireDoor: true,
        wallColor: '#d5dde5',
      },
      {
        id: 'veh-passage-1',
        type: 'vehicle_passage',
        name: '车行横洞 #1',
        visible: true,
        station: 620,
        width: 4.5,
        height: 5.0,
        skewAngle: 60,
        hasRollerDoor: true,
        wallColor: '#cfd8e3',
      },
      {
        id: 'conn-portal-start',
        type: 'connecting_passage',
        name: '洞口联络通道',
        visible: true,
        placement: 'portal_outside',
        portalEnd: 'start',
        station: 80,
        length: 24,
        width: 15,
        height: 3.4,
        showMarkings: true,
      },
      {
        id: 'parking-bay-up-1',
        type: 'parking_bay',
        name: '上行紧急停车带 #1',
        visible: true,
        boreId: 'bore-up',
        station: 420,
        length: 40,
        taperLength: 12,
        extraWidth: 3.0,
        side: 'right',
        showSignage: true,
      },
      {
        id: 'portal-sign-start',
        type: 'portal_sign',
        name: '西洞口入口标牌',
        visible: true,
        boreId: 'bore-up',
        portalEnd: 'start',
        offsetFromPortal: 35,
        mountType: 'cantilever',
        title: '',
        subtitle: 'Qingshan Tunnel',
        lengthText: '',
        notice: '请开灯行驶',
        backgroundColor: '#007d65',
      },
      {
        id: 'traffic-sign-start',
        type: 'portal_traffic_sign',
        name: '西洞口交通标志',
        visible: true,
        boreId: 'bore-up',
        portalEnd: 'start',
        offsetFromPortal: 36,
        mountType: 'cantilever',
        signs: [
          { id: 'ts-1', preset: 'no_lane_change', value: '', label: '禁止变道' },
          { id: 'ts-2', preset: 'speed_limit', value: '80', label: '限速 80' },
          { id: 'ts-3', preset: 'height_limit', value: '4.5m', label: '限高 4.5m' },
        ],
      },
    ],
    extensions: {},
  }
}

/**
 * 校验整份隧道场景文档，返回人类可读的错误提示列表
 */
export function validateSceneDocument(doc: TunnelSceneDocument): string[] {
  const errors: string[] = []
  const { tunnel, wall, facilities } = doc

  if (!tunnel.name.trim()) {
    errors.push('请填写隧道名称')
  }

  const metrics = computeAlignmentMetrics(tunnel.startPoint, tunnel.endPoint)
  if (!Number.isFinite(metrics.horizontalLength) || metrics.horizontalLength < 50 || metrics.horizontalLength > 20000) {
    errors.push(`隧道起止经纬度计算的水平长度为 ${metrics.horizontalLength} m，须在 50 ~ 20000 m 之间`)
  }
  if (Math.abs(metrics.gradePercent) > 12) {
    errors.push(`隧道纵坡为 ${metrics.gradePercent}%，建议控制在 ±12% 以内`)
  }

  if (tunnel.bores.length === 0) {
    errors.push('至少需要配置 1 个隧道洞筒')
  }

  for (const bore of tunnel.bores) {
    if (!bore.name.trim()) errors.push(`洞筒 ${bore.id} 名称不能为空`)
    if (bore.laneCount < 1 || bore.laneCount > 6) errors.push(`${bore.name}：车道数须在 1 ~ 6 条之间`)
    if (bore.laneWidth < 2.5 || bore.laneWidth > 4.5) errors.push(`${bore.name}：车道宽须在 2.5 ~ 4.5 m 之间`)
  }

  if (wall.archCrownHeight <= wall.springLineHeight + 1) {
    errors.push('墙体拱顶净高必须大于起拱线高度至少 1 m')
  }

  for (const facility of facilities) {
    const descriptor = FACILITY_REGISTRY[facility.type]
    if (descriptor) {
      errors.push(...descriptor.validate(facility, tunnel, metrics.horizontalLength))
    }
  }

  return errors
}
