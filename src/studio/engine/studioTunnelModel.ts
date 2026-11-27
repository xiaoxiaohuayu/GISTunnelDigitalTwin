// @env browser
/**
 * 新路由隧道整体模型组装模块（基于原版 src/engines/tunnelModel.ts 独立复制并重构）
 *
 * 分层热更新能力：
 * - rebuildCanopies：仅重建防雨棚实体（毫秒级，不重载洞口 GLB）
 * - rebuildInterior：仅重建隧道内壁 PBR、多停车带加宽与横洞拱体（不重载洞口 GLB）
 * - applyPortalNames：仅刷新洞口拱形门头题字
 * - 隐藏山体环境时自动切换为与隧道底板绝对共面的 CAD 参考网格地面，彻底消除高程视差。
 */
import {
  BoundingSphere,
  Cartesian3,
  ClippingPolygonCollection,
  Color,
  ComponentDatatype,
  Geometry,
  GeometryAttribute,
  GeometryAttributes,
  GeometryInstance,
  GeometryPipeline,
  Material,
  MaterialAppearance,
  Primitive,
  PrimitiveType,
} from 'cesium'
import type { Viewer } from 'cesium'
import type { TunnelSurvey } from '../../types/tunnel'
import { boreLength, mouthName, type TunnelProject } from '../../engines/projectConfig'
import { boreIndices } from '../../engines/projectSurvey'
import { sceneResources } from '../../engines/sceneResources'
import { tunnelPoint } from '../../engines/tunnelDetails'
import type { TunnelSceneDocument } from '../schema/tunnelSchema'
import { addStudioCanopies } from './studioCanopy'
import { addStudioPortalSite } from './studioPortalSite'
import { addStudioTunnelInterior } from './studioTunnelInterior'
import { addStudioTunnelDetails } from './studioTunnelDetails'

const CONTACT_OCCLUSION_STAGE_NAME = 'tunnel-contact-occlusion'

export interface StudioTunnelModelHandle {
  clippingSupported: boolean
  setWallsVisible: (visible: boolean) => void
  setWallOpacity: (opacity: number) => void
  setUnderground: (enabled: boolean) => void
  applyPortalNames: (project: TunnelProject, textColor?: string) => void
  rebuildCanopies: (survey: TunnelSurvey, doc: TunnelSceneDocument) => void
  rebuildInterior: (survey: TunnelSurvey, doc: TunnelSceneDocument) => void
  dispose: () => void
}

function clearStaleContactOcclusionStage(viewer: Viewer): void {
  if (viewer.isDestroyed()) return
  const stages = viewer.scene.postProcessStages
  for (let i = stages.length - 1; i >= 0; i--) {
    const stage = stages.get(i)
    if (stage?.name === CONTACT_OCCLUSION_STAGE_NAME) {
      stages.remove(stage)
    }
  }
}

/**
 * 构建与隧道底板完全共面（z = -0.02 m，沿纵坡贴合）的程序化 CAD 参考网格地面：
 * - 次网格 5 m、主网格 25 m，边缘径向柔和淡出；
 * - 隐藏山体时替代远处卫星底图，彻底消除视差飘动感。
 */
function createTunnelFloorReferenceGrid(viewer: Viewer, survey: TunnelSurvey): Primitive {
  const minS = -260
  const maxS = survey.length + 260
  const maxOffset = survey.project
    ? survey.project.bores.reduce((acc, b) => Math.max(acc, Math.abs(b.offset)), 12)
    : 12
  const halfW = Math.max(280, maxOffset + 240)
  const z = -0.02

  // 以双洞中线为参考中心点铺设大平面网格
  const centerPoint = (s: number, lateral: number): Cartesian3 => {
    if (survey.tubes.length >= 2) {
      const p0 = tunnelPoint(survey, 0, s, lateral, z)
      const p1 = tunnelPoint(survey, 1, s, lateral, z)
      return Cartesian3.midpoint(p0, p1, new Cartesian3())
    }
    return tunnelPoint(survey, 0, s, lateral, z)
  }

  const corners = [
    centerPoint(minS, -halfW),
    centerPoint(maxS, -halfW),
    centerPoint(maxS, halfW),
    centerPoint(minS, halfW),
  ]
  const positions = corners.flatMap(p => [p.x, p.y, p.z])
  const uvs = [minS, -halfW, maxS, -halfW, maxS, halfW, minS, halfW]

  const attributes = new GeometryAttributes()
  attributes.position = new GeometryAttribute({
    componentDatatype: ComponentDatatype.DOUBLE,
    componentsPerAttribute: 3,
    values: new Float64Array(positions),
  })
  attributes.st = new GeometryAttribute({
    componentDatatype: ComponentDatatype.FLOAT,
    componentsPerAttribute: 2,
    values: new Float32Array(uvs),
  })

  const geometry = GeometryPipeline.computeNormal(
    new Geometry({
      attributes,
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      primitiveType: PrimitiveType.TRIANGLES,
      boundingSphere: BoundingSphere.fromVertices(positions),
    }),
  )

  const material = new Material({
    fabric: {
      type: 'StudioFloorReferenceGrid',
      uniforms: {
        u_midS: (minS + maxS) * 0.5,
        u_halfS: (maxS - minS) * 0.5,
        u_halfW: halfW,
      },
      source: `
        float gridLine(vec2 coord, float spacing, float thickness) {
          vec2 p = coord / spacing;
          vec2 grid = abs(fract(p - 0.5) - 0.5) / max(fwidth(p), vec2(0.0005));
          float d = min(grid.x, grid.y);
          return 1.0 - smoothstep(thickness, thickness + 1.1, d);
        }
        czm_material czm_getMaterial(czm_materialInput materialInput) {
          czm_material m = czm_getDefaultMaterial(materialInput);
          vec2 st = materialInput.st;
          float minor = gridLine(st, 5.0, 0.55);
          float major = gridLine(st, 25.0, 0.85);
          float axisY = 1.0 - smoothstep(0.35, 1.35, abs(st.t) / max(fwidth(st.t), 0.01));
          float axisX = 1.0 - smoothstep(0.35, 1.35, abs(st.s) / max(fwidth(st.s), 0.01));

          vec3 baseColor = vec3(0.055, 0.082, 0.135);
          vec3 minorColor = vec3(0.14, 0.22, 0.34);
          vec3 majorColor = vec3(0.24, 0.39, 0.58);
          vec3 color = mix(baseColor, minorColor, minor * 0.65);
          color = mix(color, majorColor, major * 0.9);
          color = mix(color, vec3(0.35, 0.68, 0.98), axisY * 0.75);
          color = mix(color, vec3(0.92, 0.45, 0.38), axisX * 0.75);

          float edgeS = smoothstep(1.0, 0.78, abs(st.s - u_midS) / u_halfS);
          float edgeW = smoothstep(1.0, 0.75, abs(st.t) / u_halfW);
          float fade = edgeS * edgeW;

          m.diffuse = vec3(0.0);
          m.emission = color;
          m.alpha = clamp(fade * 0.96, 0.0, 1.0);
          return m;
        }
      `,
    },
    translucent: true,
  })

  const primitive = viewer.scene.primitives.add(
    new Primitive({
      asynchronous: false,
      compressVertices: false,
      geometryInstances: new GeometryInstance({ geometry }),
      appearance: new MaterialAppearance({
        material,
        materialSupport: MaterialAppearance.MaterialSupport.TEXTURED,
        translucent: true,
        faceForward: true,
        closed: false,
      }),
    }),
  )
  return primitive
}

function createSingleBoreModel(viewer: Viewer, survey: TunnelSurvey, doc: TunnelSceneDocument) {
  const scope = sceneResources(viewer)
  const interior = addStudioTunnelInterior(viewer, survey, doc)
  const details = addStudioTunnelDetails(viewer, survey, doc)
  scope.capture()

  return {
    setWallsVisible(visible: boolean) {
      interior.setWallsVisible(visible)
      details.setWallsVisible(visible)
    },
    setWallOpacity(opacity: number) {
      interior.setWallOpacity(opacity)
    },
    dispose() {
      interior.dispose()
      details.dispose()
      scope.dispose()
    },
  }
}

export async function buildStudioTunnelModel(
  viewer: Viewer,
  survey: TunnelSurvey,
  doc: TunnelSceneDocument,
): Promise<StudioTunnelModelHandle> {
  clearStaleContactOcclusionStage(viewer)

  const makeBoreSurvey = (s: TunnelSurvey, tubeIndex: number): TunnelSurvey => ({
    ...s,
    length: s.project ? boreLength(s.project.bores[tubeIndex]!) : s.length,
    tubeIndices: [tubeIndex],
  })

  let wallsVisible = doc.wall.visible
  let wallOpacity = doc.wall.opacity
  let boreHandles = boreIndices(survey).map(i => createSingleBoreModel(viewer, makeBoreSurvey(survey, i), doc))
  let canopies = addStudioCanopies(viewer, survey, doc)
  const referenceGrid = createTunnelFloorReferenceGrid(viewer, survey)

  const siteScope = sceneResources(viewer)
  let sites: Awaited<ReturnType<typeof addStudioPortalSite>>[]
  try {
    sites = await Promise.all(([0, 1] as const).map(end => addStudioPortalSite(viewer, survey, end)))
    siteScope.capture()
  } catch (error) {
    viewer.scene.primitives.remove(referenceGrid)
    canopies.dispose()
    boreHandles.forEach(handle => handle.dispose())
    siteScope.dispose()
    clearStaleContactOcclusionStage(viewer)
    throw error
  }

  const clippingSupported = ClippingPolygonCollection.isSupported(viewer.scene)

  function applyEnvironmentVisibility(visible: boolean): void {
    sites.forEach(site => site.setUnderground(!visible))
    referenceGrid.show = !visible
    viewer.scene.globe.show = visible
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = visible
    if (viewer.scene.skyBox) viewer.scene.skyBox.show = visible
    viewer.scene.backgroundColor = Color.fromCssColorString('#0b1220')

    if (visible && clippingSupported) {
      viewer.scene.globe.depthTestAgainstTerrain = true
      viewer.scene.globe.translucency.enabled = false
      viewer.scene.globe.clippingPolygons = new ClippingPolygonCollection({
        polygons: sites.map(site => site.excavation),
      })
    } else {
      viewer.scene.globe.depthTestAgainstTerrain = false
      viewer.scene.globe.translucency.enabled = false
      if (clippingSupported) {
        viewer.scene.globe.clippingPolygons = new ClippingPolygonCollection()
      }
    }
    viewer.scene.requestRender()
  }

  // 默认隐藏山体/卫星底图并启用与隧道底板共面的参考网格
  applyEnvironmentVisibility(false)

  return {
    clippingSupported,
    setWallsVisible(visible: boolean) {
      wallsVisible = visible
      boreHandles.forEach(handle => handle.setWallsVisible(visible))
      viewer.scene.requestRender()
    },
    setWallOpacity(opacity: number) {
      wallOpacity = opacity
      boreHandles.forEach(handle => handle.setWallOpacity(opacity))
      viewer.scene.requestRender()
    },
    setUnderground(enabled: boolean) {
      applyEnvironmentVisibility(!enabled)
    },
    applyPortalNames(project: TunnelProject, textColor?: string) {
      sites.forEach((site, index) => {
        const end = (index === 0 ? 0 : 1) as 0 | 1
        site.setNames(project.bores.map(bore => mouthName(project, bore.id, end)), textColor)
      })
    },
    rebuildCanopies(nextSurvey: TunnelSurvey, nextDoc: TunnelSceneDocument) {
      canopies.dispose()
      canopies = addStudioCanopies(viewer, nextSurvey, nextDoc)
      viewer.scene.requestRender()
    },
    rebuildInterior(nextSurvey: TunnelSurvey, nextDoc: TunnelSceneDocument) {
      boreHandles.forEach(handle => handle.dispose())
      clearStaleContactOcclusionStage(viewer)
      boreHandles = boreIndices(nextSurvey).map(i =>
        createSingleBoreModel(viewer, makeBoreSurvey(nextSurvey, i), nextDoc),
      )
      boreHandles.forEach(handle => {
        handle.setWallsVisible(wallsVisible)
        handle.setWallOpacity(wallOpacity)
      })
      viewer.scene.requestRender()
    },
    dispose() {
      if (!viewer.isDestroyed()) {
        viewer.scene.primitives.remove(referenceGrid)
        viewer.scene.globe.show = true
      }
      canopies.dispose()
      boreHandles.forEach(handle => handle.dispose())
      sites.forEach(site => site.dispose())
      siteScope.dispose()
      clearStaleContactOcclusionStage(viewer)
      if (!viewer.isDestroyed() && clippingSupported) {
        viewer.scene.globe.clippingPolygons = new ClippingPolygonCollection()
      }
    },
  }
}
