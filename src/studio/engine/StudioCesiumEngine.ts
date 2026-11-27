// @env browser
/**
 * 隧道场景编辑器 Cesium 引擎（基于原版高保真渲染管线 + 三级局部热更新 + 3D Gizmo 拖拽）
 *
 * 更新分级策略：
 * 1. 轻量级（< 5ms）：防雨棚、入口标牌、洞口交通标志、洞口题字、墙体显隐 —— 仅局部刷新对应实体；
 * 2. 内部结构级（~20ms）：紧急停车带、人行横洞、车行横洞 —— 仅重建隧道内壁与细部，不重载洞口 GLB；
 * 3. 全量结构级：起止经纬度、洞筒数量/车道、洞口外联络通道 —— 串行重建洞口 GLB 并保持相机视角。
 */
import {
  BoundingSphere,
  Cartesian3,
  CesiumTerrainProvider,
  createWorldImageryAsync,
  createWorldTerrainAsync,
  DirectionalLight,
  EllipsoidTerrainProvider,
  HeadingPitchRange,
  ImageryLayer,
  Ion,
  IonWorldImageryStyle,
  Matrix4,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  SingleTileImageryProvider,
  Transforms,
  UrlTemplateImageryProvider,
  Viewer,
  WebMapServiceImageryProvider,
  WebMapTileServiceImageryProvider,
  Math as CesiumMath,
} from 'cesium'
import type { ImageryProvider, TerrainProvider } from 'cesium'
import { loadRuntimeConfig, type ImageryConfig, type TerrainConfig } from '../../config/runtimeConfig'
import type { TunnelSurvey } from '../../types/tunnel'
import { surveyFrame } from '../../engines/projectSurvey'
import { PORTAL_EXTENSION, tunnelPoint } from '../../engines/tunnelDetails'
import { positionGizmo } from '../../engines/positionGizmo'
import { addTunnelOrbitController, type TunnelOrbitController } from '../../engines/tunnelOrbitController'
import type { TunnelFacilityItem, TunnelSceneDocument } from '../schema/tunnelSchema'
import { adaptStudioDocToSurvey } from './studioProjectAdapter'
import { buildStudioTunnelModel, type StudioTunnelModelHandle } from './studioTunnelModel'
import { addStudioPortalBoards, type StudioPortalBoardsHandle } from './studioPortalBoards'
import {
  addStudioPortalTrafficSigns,
  type StudioPortalTrafficSignsHandle,
} from './studioPortalTrafficSigns'

export type StudioCameraPreset = 'overview' | 'start_portal' | 'end_portal' | 'interior'

export interface StudioEngineCallbacks {
  onReady?: () => void
  onRebuilding?: (rebuilding: boolean) => void
  onError?: (message: string) => void
  onSelectFacility?: (facilityId: string) => void
  onMoveFacility?: (facilityId: string, patch: Partial<TunnelFacilityItem>) => void
}

async function buildImageryProvider(config: ImageryConfig): Promise<ImageryProvider> {
  if (config.type === 'xyz') {
    return new UrlTemplateImageryProvider({ url: config.url, maximumLevel: config.maximumLevel })
  }
  if (config.type === 'wmts') {
    return new WebMapTileServiceImageryProvider({
      url: config.url,
      layer: config.layer,
      style: config.style,
      tileMatrixSetID: config.tileMatrixSetID,
      maximumLevel: config.maximumLevel,
    })
  }
  if (config.type === 'wms') {
    return new WebMapServiceImageryProvider({ url: config.url, layers: config.layer })
  }
  if (config.type === 'single-tile') {
    return SingleTileImageryProvider.fromUrl(config.url)
  }
  return createWorldImageryAsync({ style: IonWorldImageryStyle.AERIAL })
}

async function buildTerrainProvider(config: TerrainConfig): Promise<TerrainProvider> {
  if (config.type === 'ellipsoid') return new EllipsoidTerrainProvider()
  if (config.type === 'url') {
    return CesiumTerrainProvider.fromUrl(config.url, { requestVertexNormals: true })
  }
  return createWorldTerrainAsync({ requestVertexNormals: true })
}

/** 决定是否需要重建洞口 GLB 的结构指纹（忽略洞口起止文字，避免改文字触发重载） */
function portalStructureKey(doc: TunnelSceneDocument): string {
  return JSON.stringify({
    startPoint: doc.tunnel.startPoint,
    endPoint: doc.tunnel.endPoint,
    bores: doc.tunnel.bores.map(({ startPortalName: _s, endPortalName: _e, ...rest }) => rest),
  })
}

/** 决定是否需要重建洞内 PBR 墙体/多停车带/横洞/联络通道的指纹 */
function interiorStructureKey(doc: TunnelSceneDocument): string {
  return JSON.stringify({
    wallTranslucent: doc.wall.opacity < 0.99,
    passages: doc.facilities.filter(
      f =>
        f.type === 'pedestrian_passage' ||
        f.type === 'vehicle_passage' ||
        f.type === 'connecting_passage',
    ),
    parkingBays: doc.facilities.filter(f => f.type === 'parking_bay'),
  })
}

export class StudioCesiumEngine {
  private viewer: Viewer | null = null
  private clickHandler: ScreenSpaceEventHandler | null = null
  private resizeObserver: ResizeObserver | null = null
  private orbit: TunnelOrbitController | null = null
  private tunnelModel: StudioTunnelModelHandle | null = null
  private portalBoards: StudioPortalBoardsHandle | null = null
  private trafficSigns: StudioPortalTrafficSignsHandle | null = null
  private activeGizmo: { facilityId: string; gizmo: ReturnType<typeof positionGizmo> } | null = null
  private currentSurvey: TunnelSurvey | null = null
  private currentDoc: TunnelSceneDocument | null = null
  private selectedFacilityId: string | null = null
  private lastPortalKey = ''
  private lastInteriorKey = ''
  private isRebuilding = false
  private pendingDoc: TunnelSceneDocument | null = null
  private disposed = false
  private callbacks: StudioEngineCallbacks = {}

  async mount(
    container: HTMLDivElement,
    initialDoc: TunnelSceneDocument,
    callbacks: StudioEngineCallbacks = {},
  ): Promise<void> {
    this.callbacks = callbacks
    try {
      window.CESIUM_BASE_URL = new URL(`${import.meta.env.BASE_URL}cesium/`, document.baseURI).href
      const runtimeConfig = await loadRuntimeConfig(
        import.meta.env.BASE_URL,
        import.meta.env.VITE_CESIUM_ION_TOKEN ?? '',
      )
      if (runtimeConfig.cesium.ionToken) {
        Ion.defaultAccessToken = runtimeConfig.cesium.ionToken
      }

      const [imageryProvider, terrainProvider] = await Promise.all([
        buildImageryProvider(runtimeConfig.cesium.imagery),
        buildTerrainProvider(runtimeConfig.cesium.terrain),
      ])

      if (this.disposed) return

      const viewer = new Viewer(container, {
        baseLayer: new ImageryLayer(imageryProvider),
        terrainProvider,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        shouldAnimate: false,
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
        useBrowserRecommendedResolution: false,
      })

      viewer.scene.highDynamicRange = true
      viewer.scene.globe.translucency.frontFaceAlpha = 0.22
      viewer.scene.globe.translucency.backFaceAlpha = 0.22
      viewer.scene.globe.depthTestAgainstTerrain = false
      viewer.scene.screenSpaceCameraController.enableCollisionDetection = false
      viewer.scene.globe.maximumScreenSpaceError = 1.5
      viewer.scene.postProcessStages.fxaa.enabled = true

      this.viewer = viewer
      this.bindPicking()
      this.resizeObserver = new ResizeObserver(() => {
        if (this.viewer && !this.viewer.isDestroyed()) {
          this.viewer.resize()
          this.viewer.scene.requestRender()
        }
      })
      this.resizeObserver.observe(container)

      await this.syncScene(initialDoc, true)
      if (this.disposed) return

      // 覆盖 Cesium 默认的“右键缩放”，统一为标准 3D 场景编辑器交互：左键平移、右键旋转、滚轮缩放
      this.orbit = addTunnelOrbitController({
        viewer,
        getSurvey: () => this.currentSurvey!,
        isIntroPlaying: () => false,
        isRoaming: () => false,
        isUnderground: () => true,
      })

      this.focusPreset('start_portal', false)
      callbacks.onReady?.()
    } catch (error) {
      callbacks.onError?.(error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * 同步场景文档到 3D 视口（按变更粒度自动走轻量/内部/全量路径）
   */
  async syncScene(doc: TunnelSceneDocument, isInitial = false): Promise<void> {
    const viewer = this.viewer
    if (!viewer || viewer.isDestroyed() || this.disposed) return

    if (this.isRebuilding) {
      this.pendingDoc = doc
      return
    }

    const adapted = adaptStudioDocToSurvey(doc)
    const nextPortalKey = portalStructureKey(doc)
    const nextInteriorKey = interiorStructureKey(doc)

    // 1. 洞口 GLB 未变：走秒级局部刷新（防雨棚/标牌/交通标志/停车带/横洞/洞口题字/墙体透明度均可即时生效）
    if (!isInitial && this.tunnelModel && nextPortalKey === this.lastPortalKey) {
      this.currentSurvey = adapted.survey
      this.currentDoc = doc
      this.tunnelModel.applyPortalNames(adapted.project, doc.tunnel.portalArch.textColor)
      this.tunnelModel.setWallsVisible(doc.wall.visible)
      this.tunnelModel.setWallOpacity(doc.wall.opacity)

      if (nextInteriorKey !== this.lastInteriorKey) {
        this.tunnelModel.rebuildInterior(adapted.survey, doc)
        this.lastInteriorKey = nextInteriorKey
      }

      this.tunnelModel.rebuildCanopies(adapted.survey, doc)
      this.portalBoards?.dispose()
      this.portalBoards = addStudioPortalBoards(viewer, adapted.survey, doc)
      this.trafficSigns?.dispose()
      this.trafficSigns = addStudioPortalTrafficSigns(viewer, adapted.survey, doc)
      this.refreshFacilityGizmo()
      viewer.scene.requestRender()
      return
    }

    // 2. 全量重建路径：串行化执行，保留相机视角
    this.isRebuilding = true
    const savedPos = !isInitial ? Cartesian3.clone(viewer.camera.positionWC) : null
    const savedDir = !isInitial ? Cartesian3.clone(viewer.camera.directionWC) : null
    const savedUp = !isInitial ? Cartesian3.clone(viewer.camera.upWC) : null

    if (!isInitial) this.callbacks.onRebuilding?.(true)
    try {
      this.detachGizmo()
      this.disposeSceneHandles()
      if (this.disposed || viewer.isDestroyed()) return

      const sunlight = Matrix4.multiplyByPointAsVector(
        Transforms.eastNorthUpToFixedFrame(adapted.survey.center),
        new Cartesian3(0.4, 0.25, -1),
        new Cartesian3(),
      )
      viewer.scene.light = new DirectionalLight({
        direction: Cartesian3.normalize(sunlight, sunlight),
        intensity: 2.4,
      })

      const builtModel = await buildStudioTunnelModel(viewer, adapted.survey, doc)
      if (this.disposed || viewer.isDestroyed()) {
        builtModel.dispose()
        return
      }

      builtModel.applyPortalNames(adapted.project, doc.tunnel.portalArch.textColor)
      builtModel.setWallsVisible(doc.wall.visible)
      builtModel.setWallOpacity(doc.wall.opacity)
      this.tunnelModel = builtModel
      this.portalBoards = addStudioPortalBoards(viewer, adapted.survey, doc)
      this.trafficSigns = addStudioPortalTrafficSigns(viewer, adapted.survey, doc)
      this.currentSurvey = adapted.survey
      this.currentDoc = doc
      this.lastPortalKey = nextPortalKey
      this.lastInteriorKey = nextInteriorKey
      this.refreshFacilityGizmo()

      if (savedPos && savedDir && savedUp) {
        viewer.camera.setView({
          destination: savedPos,
          orientation: { direction: savedDir, up: savedUp },
        })
      }
      viewer.scene.requestRender()
    } catch (error) {
      this.callbacks.onError?.(error instanceof Error ? error.message : String(error))
    } finally {
      this.isRebuilding = false
      if (!isInitial) this.callbacks.onRebuilding?.(false)
      const queued = this.pendingDoc
      this.pendingDoc = null
      if (queued && !this.disposed && !viewer.isDestroyed()) {
        void this.syncScene(queued, false)
      }
    }
  }

  /**
   * 选中设施并在 3D 视口中挂载沿隧道轴向拖拽的 3D Gizmo（支持直接拖动移动设施）
   */
  setSelectedFacility(facilityId: string | null): void {
    this.selectedFacilityId = facilityId
    this.refreshFacilityGizmo()
  }

  private detachGizmo(): void {
    if (this.activeGizmo) {
      this.activeGizmo.gizmo.dispose()
      this.activeGizmo = null
    }
  }

  private computeFacilityAnchor(facility: TunnelFacilityItem): {
    point: Cartesian3
    boxSize: [number, number, number]
    outwardSign: 1 | -1
    mode: 'station' | 'offsetFromPortal'
  } | null {
    const survey = this.currentSurvey
    if (!survey) return null

    const lateralOffset = facility.lateralOffset ?? 0
    const heightOffset = facility.heightOffset ?? 0

    let tube = 0
    if ('boreId' in facility && survey.project) {
      const idx = survey.project.bores.findIndex(b => b.id === facility.boreId)
      if (idx >= 0) tube = idx
    }

    switch (facility.type) {
      case 'rain_canopy': {
        const isStart = facility.portalEnd === 'start'
        const outward: 1 | -1 = isStart ? -1 : 1
        const edge = isStart ? -PORTAL_EXTENSION : survey.length + PORTAL_EXTENSION
        const midStation = edge + outward * (facility.offsetFromPortal + facility.length / 2)
        return {
          point: tunnelPoint(survey, tube, midStation, lateralOffset, 4.2 + heightOffset),
          boxSize: [facility.length, 11.2, 8.2],
          outwardSign: outward,
          mode: 'offsetFromPortal',
        }
      }
      case 'portal_sign': {
        const isStart = facility.portalEnd === 'start'
        const outward: 1 | -1 = isStart ? -1 : 1
        const station = isStart
          ? -PORTAL_EXTENSION - facility.offsetFromPortal
          : survey.length + PORTAL_EXTENSION + facility.offsetFromPortal
        return {
          point: tunnelPoint(survey, tube, station, (isStart ? -4.8 : 4.8) + lateralOffset, 5.5 + heightOffset),
          boxSize: [1.5, 4.5, 9.0],
          outwardSign: outward,
          mode: 'offsetFromPortal',
        }
      }
      case 'portal_traffic_sign': {
        const isStart = facility.portalEnd === 'start'
        const outward: 1 | -1 = isStart ? -1 : 1
        const station = isStart
          ? -PORTAL_EXTENSION - facility.offsetFromPortal
          : survey.length + PORTAL_EXTENSION + facility.offsetFromPortal
        return {
          point: tunnelPoint(survey, tube, station, lateralOffset, 5.2 + heightOffset),
          boxSize: [1.5, 9.5, 7.6],
          outwardSign: outward,
          mode: 'offsetFromPortal',
        }
      }
      case 'parking_bay': {
        const outer = tube === 0 ? -1 : 1
        return {
          point: tunnelPoint(survey, tube, facility.station, outer * 5.8 + lateralOffset, 2.6 + heightOffset),
          boxSize: [facility.length + facility.taperLength, facility.extraWidth + 1.5, 4.8],
          outwardSign: 1,
          mode: 'station',
        }
      }
      case 'pedestrian_passage':
      case 'vehicle_passage': {
        const mid =
          survey.tubes.length >= 2
            ? Cartesian3.midpoint(
                tunnelPoint(survey, 0, facility.station, lateralOffset, facility.height / 2 + heightOffset),
                tunnelPoint(survey, 1, facility.station, lateralOffset, facility.height / 2 + heightOffset),
                new Cartesian3(),
              )
            : tunnelPoint(survey, 0, facility.station, 12 + lateralOffset, facility.height / 2 + heightOffset)
        return {
          point: mid,
          boxSize: [facility.width + 0.8, facility.length ?? 13, facility.height + 0.8],
          outwardSign: 1,
          mode: 'station',
        }
      }
      case 'connecting_passage': {
        const isOutside = facility.placement === 'portal_outside'
        const isStart = facility.portalEnd === 'start'
        const outward: 1 | -1 = isOutside ? (isStart ? -1 : 1) : 1
        const station = isOutside
          ? isStart
            ? -PORTAL_EXTENSION - facility.station
            : survey.length + PORTAL_EXTENSION + facility.station
          : facility.station
        const h = isOutside ? 1.2 : facility.height / 2
        const mid =
          survey.tubes.length >= 2
            ? Cartesian3.midpoint(
                tunnelPoint(survey, 0, station, lateralOffset, h + heightOffset),
                tunnelPoint(survey, 1, station, lateralOffset, h + heightOffset),
                new Cartesian3(),
              )
            : tunnelPoint(survey, 0, station, 12 + lateralOffset, h + heightOffset)
        return {
          point: mid,
          boxSize: [facility.length, facility.width, isOutside ? 2.4 : facility.height],
          outwardSign: outward,
          mode: 'station',
        }
      }
    }
  }

  private refreshFacilityGizmo(): void {
    this.detachGizmo()
    const viewer = this.viewer
    const survey = this.currentSurvey
    const doc = this.currentDoc
    if (!viewer || viewer.isDestroyed() || !survey || !doc || !this.selectedFacilityId) return

    const facility = doc.facilities.find(f => f.id === this.selectedFacilityId && f.visible)
    if (!facility) return

    const anchor = this.computeFacilityAnchor(facility)
    if (!anchor) return

    const baseX =
      anchor.mode === 'offsetFromPortal'
        ? (facility as { offsetFromPortal: number }).offsetFromPortal
        : (facility as { station: number }).station
    const baseY = facility.lateralOffset ?? 0
    const baseZ = facility.heightOffset ?? 0

    let latestOffset = new Cartesian3()
    const gizmo = positionGizmo(
      viewer,
      surveyFrame(survey, anchor.point),
      false,
      offset => {
        latestOffset = Cartesian3.clone(offset, latestOffset)
      },
      () => {
        latestOffset = new Cartesian3()
        gizmo.setOffset(new Cartesian3())
      },
      anchor.boxSize,
      [0, 0, 0],
      {
        mode: 'translate',
        onCommit: () => {
          if (
            Math.abs(latestOffset.x) < 0.05 &&
            Math.abs(latestOffset.y) < 0.05 &&
            Math.abs(latestOffset.z) < 0.05
          ) {
            return
          }
          const round1 = (v: number) => Math.round(v * 10) / 10
          const nextX = round1(baseX + latestOffset.x * anchor.outwardSign)
          const nextY = round1(baseY - latestOffset.y)
          const nextZ = round1(baseZ + latestOffset.z)

          const patch: Partial<TunnelFacilityItem> = {
            lateralOffset: nextY,
            heightOffset: nextZ,
          }
          if (anchor.mode === 'offsetFromPortal') {
            ;(patch as Partial<{ offsetFromPortal: number }>).offsetFromPortal = Math.max(-60, Math.min(200, nextX))
          } else {
            ;(patch as Partial<{ station: number }>).station = Math.max(10, Math.min(survey.length - 10, nextX))
          }
          this.callbacks.onMoveFacility?.(facility.id, patch)
        },
      },
    )

    this.activeGizmo = { facilityId: facility.id, gizmo }
  }

  /** 切换常用相机视角预设 */
  focusPreset(preset: StudioCameraPreset, animate = true): void {
    const viewer = this.viewer
    const survey = this.currentSurvey
    if (!viewer || viewer.isDestroyed() || !survey) return

    const heading = survey.heading ?? 90
    let target: Cartesian3
    let camHeading = heading
    let pitch = -18
    let range = 122

    switch (preset) {
      case 'overview':
        target = survey.center
        camHeading = heading - 70
        pitch = -35
        range = Math.max(300, survey.length * 1.35)
        break
      case 'start_portal':
        target = tunnelPoint(survey, 0, -PORTAL_EXTENSION, 12, 4)
        camHeading = heading - 14
        pitch = -17
        range = 122
        break
      case 'end_portal':
        target = tunnelPoint(survey, 0, survey.length + PORTAL_EXTENSION, 12, 4)
        camHeading = heading + 166
        pitch = -17
        range = 122
        break
      case 'interior': {
        const station = Math.min(survey.length * 0.25, 220)
        target = tunnelPoint(survey, 0, station, 0, 2.2)
        camHeading = heading
        pitch = -6
        range = 32
        break
      }
    }

    const offset = new HeadingPitchRange(
      CesiumMath.toRadians(camHeading),
      CesiumMath.toRadians(pitch),
      range,
    )

    if (animate) {
      viewer.camera.flyToBoundingSphere(new BoundingSphere(target, 1), { duration: 0.9, offset })
    } else {
      viewer.camera.lookAt(target, offset)
      viewer.camera.lookAtTransform(Matrix4.IDENTITY)
    }
    this.orbit?.setTarget(target)
    viewer.scene.requestRender()
  }

  /** 平滑定位相机到指定隧道设施 */
  focusFacility(facility: TunnelFacilityItem): void {
    const viewer = this.viewer
    const survey = this.currentSurvey
    if (!viewer || viewer.isDestroyed() || !survey) return

    const anchor = this.computeFacilityAnchor(facility)
    if (!anchor) return

    const heading = survey.heading ?? 90
    const range = facility.type === 'parking_bay' ? 68 : 58
    viewer.camera.flyToBoundingSphere(new BoundingSphere(anchor.point, 1), {
      duration: 0.85,
      offset: new HeadingPitchRange(
        CesiumMath.toRadians(heading - 20),
        CesiumMath.toRadians(-18),
        range,
      ),
    })
    this.orbit?.setTarget(anchor.point)
    viewer.scene.requestRender()
  }

  private bindPicking(): void {
    const viewer = this.viewer
    if (!viewer) return

    this.clickHandler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    this.clickHandler.setInputAction((movement: { position: import('cesium').Cartesian2 }) => {
      const picked = viewer.scene.pick(movement.position)
      const rawId: unknown = typeof picked?.id === 'string' ? picked.id : picked?.id?.id
      if (typeof rawId === 'string' && rawId.startsWith('studio-facility:')) {
        const facilityId = rawId.split(':')[1]
        if (facilityId) {
          this.callbacks.onSelectFacility?.(facilityId)
        }
      }
    }, ScreenSpaceEventType.LEFT_CLICK)
  }

  private disposeSceneHandles(): void {
    this.portalBoards?.dispose()
    this.portalBoards = null
    this.trafficSigns?.dispose()
    this.trafficSigns = null
    this.tunnelModel?.dispose()
    this.tunnelModel = null
  }

  dispose(): void {
    this.disposed = true
    this.pendingDoc = null
    this.detachGizmo()
    this.orbit?.dispose()
    this.orbit = null
    this.clickHandler?.destroy()
    this.clickHandler = null
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.disposeSceneHandles()
    if (this.viewer && !this.viewer.isDestroyed()) {
      this.viewer.destroy()
    }
    this.viewer = null
  }
}
