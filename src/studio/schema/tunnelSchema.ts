/**
 * 隧道数字孪生场景编辑器 —— 可扩展领域数据模型（Schema v1）
 *
 * 设计原则：
 * 1. 数据与渲染解耦：所有配置均为可序列化纯 JSON，方便与后端接口或本地存储对接。
 * 2. 面向拓展：
 *    - 洞筒使用数组建模，天然支持单洞、双洞乃至未来的连拱/多洞结构；
 *    - 设施采用可辨识联合类型（Discriminated Union）+ 注册表模式，新增设施/机电设备无需改动核心框架；
 *    - 顶层及设施节点均预留 `extensions` 扩展槽，用于后续挂接物联网遥测、照明控制、应急预案等模块。
 */

export const STUDIO_SCHEMA_VERSION = '1.0' as const

/** 地理经纬度高程点（WGS84） */
export interface GeoPoint {
  /** 经度（度，-180 ~ 180） */
  longitude: number
  /** 纬度（度，-85 ~ 85） */
  latitude: number
  /** 高程（米，相对于椭球面/海平面） */
  elevation: number
}

/** 洞筒行车方向：上行、下行或双向 */
export type BoreDirection = 'upbound' | 'downbound' | 'bidirectional'

/** 隧道洞口拱形门头结构形式 */
export type PortalArchStyle = 'bamboo_cut' | 'end_wall' | 'wing_wall' | 'canopy_arch'

/** 隧道洞口拱形结构配置 */
export interface PortalArchConfig {
  /** 洞口建筑形式 */
  style: PortalArchStyle
  /** 拱门混凝土主色 */
  archColor: string
  /** 门头字牌文字颜色 */
  textColor: string
  /** 拱门纵深厚度（米） */
  depth: number
  /** 门头高度附加量（米） */
  headwallHeight: number
  /** 起始端洞口自定义名称（留空则使用隧道主名称） */
  startPortalTitle: string
  /** 结束端洞口自定义名称（留空则使用隧道主名称） */
  endPortalTitle: string
}

/** 单个隧道洞筒配置 */
export interface TunnelBoreConfig {
  id: string
  /** 洞筒显示名称（例如：上行洞、下行洞） */
  name: string
  /** 行车方向（上下行可自由更改） */
  direction: BoreDirection
  /** 洞内车道数（1 ~ 6） */
  laneCount: number
  /** 单车道宽度（米，默认 3.75） */
  laneWidth: number
  /** 相对隧道中轴线的横向偏移（米，左负右正） */
  lateralOffset: number
  /** 起始桩号（米，例如 10000 表示 K10+000） */
  startChainage: number
  /** 起点洞口门头自定义文字（留空则跟随隧道主名称） */
  startPortalName?: string
  /** 终点洞口门头自定义文字（留空则跟随隧道主名称） */
  endPortalName?: string
  /** 是否启用渲染 */
  visible: boolean
}

/** 隧道本体几何与线形配置 */
export interface TunnelBodyConfig {
  /** 隧道名称（同步显示在洞口拱形门头上） */
  name: string
  /** 隧道编号（可选，便于工程台账对接） */
  code: string
  /** 起始点经纬度与高程 */
  startPoint: GeoPoint
  /** 结束点经纬度与高程 */
  endPoint: GeoPoint
  /** 洞口拱形结构配置 */
  portalArch: PortalArchConfig
  /** 隧道洞筒列表（支持单洞、双洞及后续多洞拓展） */
  bores: TunnelBoreConfig[]
}

/** 隧道墙体衬砌材质预设 */
export type WallMaterialPreset = 'concrete' | 'fireproof_paint' | 'ceramic_tile' | 'dark_antiglare'

/** 隧道墙体与断面配置 */
export interface TunnelWallConfig {
  /** 墙体是否可见（关闭便于透视内部设施） */
  visible: boolean
  /** 墙体不透明度（0.15 ~ 1.0，支持半透明剖视） */
  opacity: number
  /** 衬砌材质预设 */
  materialPreset: WallMaterialPreset
  /** 侧墙主色 */
  wallColor: string
  /** 拱顶颜色 */
  archColor: string
  /** 墙裙/防火装饰板高度（米） */
  wainscotHeight: number
  /** 墙裙颜色 */
  wainscotColor: string
  /** 起拱线高度（米） */
  springLineHeight: number
  /** 拱顶净高（米） */
  archCrownHeight: number
  /** 两侧检修道宽度（米） */
  sidewalkWidth: number
  /** 检修道高度（米） */
  sidewalkHeight: number
  /** 衬砌环缝/分段间距（米） */
  jointSpacing: number
}

/** 隧道设施类型枚举（后续可扩展更多机电或土建设施） */
export type FacilityType =
  | 'rain_canopy'
  | 'pedestrian_passage'
  | 'vehicle_passage'
  | 'connecting_passage'
  | 'parking_bay'
  | 'portal_sign'
  | 'portal_traffic_sign'

/** 设施分类 */
export type FacilityCategory = 'portal' | 'passage' | 'roadside' | 'signage'

/** 洞口端枚举 */
export type PortalEnd = 'start' | 'end'

/** 所有设施共享的基础字段 */
export interface BaseFacilityItem {
  id: string
  type: FacilityType
  name: string
  visible: boolean
  /** 相对默认基准的横向偏移（Y 轴，米，支持 3D 视口自由拖拽） */
  lateralOffset?: number
  /** 相对默认基准的高度偏移（Z 轴，米，支持 3D 视口自由拖拽） */
  heightOffset?: number
  /** 预留扩展字段（例如台账编码、遥测绑定、施工批次） */
  extensions?: Record<string, unknown>
}

/** 1. 防雨棚 */
export interface RainCanopyFacility extends BaseFacilityItem {
  type: 'rain_canopy'
  boreId: string
  portalEnd: PortalEnd
  /** 距洞口端面的外延起始距离（米，正值向洞外延伸） */
  offsetFromPortal: number
  /** 防雨棚总长度（米） */
  length: number
  /** 拱肋/钢架间距（米） */
  ribSpacing: number
  /** 顶棚颜色 */
  roofColor: string
  /** 顶棚不透明度（0.2 ~ 0.95） */
  roofOpacity: number
  /** 钢架颜色 */
  frameColor: string
}

/** 2. 人行横洞 */
export interface PedestrianPassageFacility extends BaseFacilityItem {
  type: 'pedestrian_passage'
  /** 沿隧道轴线距离起点的位置（米） */
  station: number
  /** 横洞长度（米，留空则自动匹配双洞内壁净距） */
  length?: number
  /** 净宽（米，常规 2.0 ~ 2.5m） */
  width: number
  /** 净高（米，常规 2.5 ~ 3.0m） */
  height: number
  /** 预留：早期字段，防火门已改为独立设备 */
  hasFireDoor?: boolean
  /** 通道墙体颜色 */
  wallColor: string
}

/** 3. 车行横洞 */
export interface VehiclePassageFacility extends BaseFacilityItem {
  type: 'vehicle_passage'
  /** 沿隧道轴线距离起点的位置（米） */
  station: number
  /** 横洞长度（米，留空则自动匹配双洞内壁净距） */
  length?: number
  /** 净宽（米，常规 4.5m） */
  width: number
  /** 净高（米，常规 5.0m） */
  height: number
  /** 与主洞夹角（度，60° 斜交或 90° 正交） */
  skewAngle: number
  /** 预留：早期字段，防火卷帘门已改为独立设备 */
  hasRollerDoor?: boolean
  /** 通道墙体颜色 */
  wallColor: string
}

/** 4. 联络通道（支持洞口外转换通道与洞内联络通道） */
export interface ConnectingPassageFacility extends BaseFacilityItem {
  type: 'connecting_passage'
  /** 布设位置：洞口外中央开口 / 洞内联络 */
  placement: 'portal_outside' | 'interior'
  /** 当 placement 为 portal_outside 时，指定所在洞口端 */
  portalEnd: PortalEnd
  /** 沿隧道轴线位置（洞内为距起点米数；洞口外为距洞口外延米数） */
  station: number
  /** 通道纵向开口长度（米） */
  length: number
  /** 通道宽度（米） */
  width: number
  /** 通道净高（仅洞内联络通道生效，米） */
  height: number
  /** 是否绘制导流/边缘标线 */
  showMarkings: boolean
}

/** 5. 停车带（紧急停车带） */
export interface ParkingBayFacility extends BaseFacilityItem {
  type: 'parking_bay'
  boreId: string
  /** 停车带中心距起点位置（米） */
  station: number
  /** 有效停车段长度（米，常规 30 ~ 40m） */
  length: number
  /** 两端渐变过渡段长度（米，常规 10 ~ 15m） */
  taperLength: number
  /** 相对行车道外侧的加宽宽度（米，常规 3.5m） */
  extraWidth: number
  /** 布设侧（按洞筒行车方向右侧或左侧） */
  side: 'right' | 'left'
  /** 是否显示停车带 P 标志与地面标线 */
  showSignage: boolean
}

/** 6. 入口标牌（隧道名牌/概况牌） */
export interface PortalSignFacility extends BaseFacilityItem {
  type: 'portal_sign'
  boreId: string
  portalEnd: PortalEnd
  /** 距洞口外侧距离（米） */
  offsetFromPortal: number
  /** 支撑结构形式：悬臂式 / 门架式 */
  mountType: 'cantilever' | 'gantry'
  /** 标牌主标题（留空自动读取隧道名称） */
  title: string
  /** 英文副标题 */
  subtitle: string
  /** 长度标注（留空自动读取计算后的隧道长度） */
  lengthText: string
  /** 底部安全提示语 */
  notice: string
  /** 牌面主背景色（默认高速绿 #007d65） */
  backgroundColor: string
}

/** 单个交通标志牌内容 */
export interface TrafficSignBadge {
  id: string
  /** 预设图标类型（支持上传自定义图片） */
  preset:
    | 'speed_limit'
    | 'no_lane_change'
    | 'height_limit'
    | 'turn_on_lights'
    | 'no_horn'
    | 'custom_text'
    | 'custom_image'
  /** 主显示值（如 80、4.5m 等） */
  value: string
  /** 辅助文字说明 */
  label: string
  /** 自定义上传图片的 Data URL（base64） */
  imageDataUrl?: string
}

/** 7. 洞口交通标志（门架/悬臂组合标志） */
export interface PortalTrafficSignFacility extends BaseFacilityItem {
  type: 'portal_traffic_sign'
  boreId: string
  portalEnd: PortalEnd
  /** 距洞口外侧距离（米） */
  offsetFromPortal: number
  /** 支撑结构形式 */
  mountType: 'cantilever' | 'gantry'
  /** 挂载的交通标志牌列表（支持自由增删） */
  signs: TrafficSignBadge[]
}

/** 隧道设施联合类型 */
export type TunnelFacilityItem =
  | RainCanopyFacility
  | PedestrianPassageFacility
  | VehiclePassageFacility
  | ConnectingPassageFacility
  | ParkingBayFacility
  | PortalSignFacility
  | PortalTrafficSignFacility

/** 完整的隧道数字孪生场景配置文档 */
export interface TunnelSceneDocument {
  schemaVersion: typeof STUDIO_SCHEMA_VERSION
  id: string
  updatedAt: string
  tunnel: TunnelBodyConfig
  wall: TunnelWallConfig
  facilities: TunnelFacilityItem[]
  /** 顶层扩展字段：预留给后续机电设备、传感器点位、视角书签、环境光影等模块 */
  extensions: Record<string, unknown>
}
