// @env browser
/**
 * 新路由洞口场地与拱形结构加载模块（基于原版 src/engines/portalSite.ts 独立复制）
 *
 * 使用 `studioPortalGeometry.ts` 剔除烘焙在 GLB 中的默认情报板与门架，
 * 其余洞口拱形门头、题字牌、联络通道、山体/植被显隐控制均保持原版一致，且不改动旧代码。
 */
import {
  Axis,
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Cartographic,
  ClippingPolygon,
  ComponentDatatype,
  ConstantProperty,
  CustomShader,
  Geometry,
  GeometryAttribute,
  GeometryAttributes,
  GeometryInstance,
  GeometryPipeline,
  ImageMaterialProperty,
  Material,
  MaterialAppearance,
  Matrix3,
  Matrix4,
  Model,
  Plane,
  Primitive,
  PrimitiveType,
  Quaternion,
  sampleTerrainMostDetailed,
  TextureUniform,
  UniformType,
} from 'cesium'
import type { Viewer } from 'cesium'
import portalLamps from '../../config/portalLamps.json'
import type { TunnelSurvey } from '../../types/tunnel'
import { mouthName } from '../../engines/projectConfig'
import { surveyFrame } from '../../engines/projectSurvey'
import { modelAssetUrl } from '../../engines/modelAssets'
import { portalImagery } from '../../engines/portalImagery'
import { addPortalStreetlights, streetlightHead } from '../../engines/portalStreetlights'
import { PORTAL_EXTENSION, tunnelPoint } from '../../engines/tunnelDetails'
import type { SceneDevice, SystemsState } from '../../engines/tunnelSystemsState'
import {
  studioPortalAlong,
  studioPortalGeometryUrl,
  studioPortalLateral,
  studioPortalNameLateral,
} from './studioPortalGeometry'

function mountainHeight(x: number, y: number): number {
  if (x < 0) return -0.08
  const side = Math.max(0, 1 - (Math.abs(y) / 100) ** 2)
  return (
    1.8 +
    side *
      (15 +
        30 * Math.sin((Math.PI * x) / 440) +
        3 * Math.sin(x * 0.065 + y * 0.08) +
        1.8 * Math.sin(y * 0.22 + x * 0.12))
  )
}

export async function addStudioPortalSite(viewer: Viewer, survey: TunnelSurvey, end: 0 | 1 = 0) {
  const origin = survey.actualPointAt
    ? survey.actualPointAt(
        0,
        end === 0 ? -PORTAL_EXTENSION : survey.length + PORTAL_EXTENSION,
        survey.project!.bores[0]!.offset,
        0,
      )
    : tunnelPoint(survey, 0, end === 0 ? -PORTAL_EXTENSION : survey.length + PORTAL_EXTENSION, 12)

  const rotation = Matrix3.multiply(
    Matrix3.fromRotationY(-Math.atan(survey.grade / 100)),
    Matrix3.fromRotationZ(end * Math.PI),
    new Matrix3(),
  )
  const frame = Matrix4.multiply(
    surveyFrame(survey, origin),
    Matrix4.fromRotationTranslation(rotation),
    new Matrix4(),
  )
  const inverse = Matrix4.inverse(frame, new Matrix4())
  const world = (p: Cartesian3) => Matrix4.multiplyByPoint(frame, p, new Cartesian3())

  const imagery = await portalImagery(viewer.imageryLayers.get(0).imageryProvider, frame)
  const corners = [
    [-180, -100],
    [220, -100],
    [220, 100],
    [-180, 100],
  ]
  const outerCorners = [
    [-240, -180],
    [320, -180],
    [320, 180],
    [-240, 180],
  ]
  const points: { x: number; y: number; innerHeight: number; t: number }[] = []
  const segments = 32
  const rings = 12
  const perimeter = segments * 4

  for (let ring = 0; ring <= rings; ring++) {
    for (let edge = 0; edge < 4; edge++) {
      for (let part = 0; part < segments; part++) {
        const t = ring / rings
        const q = part / segments
        const a = corners[edge]!
        const b = corners[(edge + 1) % 4]!
        const c = outerCorners[edge]!
        const d = outerCorners[(edge + 1) % 4]!
        const x = a[0]! + (b[0]! - a[0]!) * q
        const y = a[1]! + (b[1]! - a[1]!) * q
        points.push({
          x: x * (1 - t) + (c[0]! + (d[0]! - c[0]!) * q) * t,
          y: y * (1 - t) + (c[1]! + (d[1]! - c[1]!) * q) * t,
          innerHeight: mountainHeight(x, y),
          t,
        })
      }
    }
  }

  const samples = points.map(p => Cartographic.fromCartesian(world(new Cartesian3(p.x, p.y, 0))))
  await sampleTerrainMostDetailed(viewer.terrainProvider, samples, true)
  if (samples.some(p => !Number.isFinite(p.height))) {
    throw new Error('洞口周边地形采样不完整，请重试')
  }

  const vertices: number[] = []
  const indices: number[] = []
  const uv: number[] = []
  points.forEach((p, i) => {
    const sample = samples[i]!
    const terrain = Matrix4.multiplyByPoint(
      inverse,
      Cartesian3.fromRadians(sample.longitude, sample.latitude, sample.height),
      new Cartesian3(),
    )
    const t = Math.min(1, p.t / 0.8)
    const blend = t * t * (3 - 2 * t)
    vertices.push(p.x, p.y, p.innerHeight * (1 - blend) + (terrain.z + 0.35) * blend)
    uv.push(...imagery.uv(sample))
    if (i >= perimeter) {
      const a = i - perimeter
      const b = Math.floor(i / perimeter) * perimeter + ((i + 1) % perimeter)
      indices.push(a, i, b, a, b, b - perimeter)
    }
  })

  const attributes: GeometryAttributes & { blend?: GeometryAttribute } = new GeometryAttributes()
  attributes.position = new GeometryAttribute({
    componentDatatype: ComponentDatatype.DOUBLE,
    componentsPerAttribute: 3,
    values: new Float64Array(vertices),
  })
  attributes.st = new GeometryAttribute({
    componentDatatype: ComponentDatatype.FLOAT,
    componentsPerAttribute: 2,
    values: new Float32Array(uv),
  })
  attributes.blend = new GeometryAttribute({
    componentDatatype: ComponentDatatype.FLOAT,
    componentsPerAttribute: 1,
    values: new Float32Array(points.map(p => p.t)),
  })

  const geometry = GeometryPipeline.computeNormal(
    new Geometry({
      attributes,
      indices: new Uint16Array(indices),
      primitiveType: PrimitiveType.TRIANGLES,
      boundingSphere: BoundingSphere.fromVertices(vertices),
    }),
  )

  const groundMaterial = new Material({
    fabric: {
      type: 'StudioPortalSatellite',
      uniforms: { image: imagery.image },
      source: `in float v_blend;
      czm_material czm_getMaterial(czm_materialInput inputValue) {
        czm_material m = czm_getDefaultMaterial(inputValue);
        float coverage = 1.0 - smoothstep(0.82, 1.0, v_blend);
        float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        if (coverage < noise) discard;
        m.diffuse = vec3(0.0);
        m.emission = czm_srgbToLinear(texture(image, inputValue.st).rgb);
        m.alpha = 1.0;
        return m;
      }`,
    },
    translucent: false,
  })

  const transition = new Primitive({
    geometryInstances: new GeometryInstance({ geometry, modelMatrix: frame }),
    appearance: new MaterialAppearance({
      material: groundMaterial,
      materialSupport: MaterialAppearance.MaterialSupport.TEXTURED,
      vertexShaderSource: MaterialAppearance.MaterialSupport.TEXTURED.vertexShaderSource
        .replace('in vec2 st;', 'in vec2 st;\nin float blend;\nout float v_blend;')
        .replace('v_st = st;', 'v_st = st; v_blend = blend;'),
      translucent: false,
      closed: false,
      faceForward: true,
    }),
    asynchronous: false,
    compressVertices: false,
  })

  const urls = await Promise.all(
    ['terrain', 'structures', 'substation-new', 'finishes'].map(part =>
      part === 'substation-new'
        ? Promise.resolve(modelAssetUrl(part))
        : studioPortalGeometryUrl(
            modelAssetUrl(part === 'terrain' && survey.project ? 'portal-terrain-editable' : `portal-${part}`),
            survey.project,
            end,
          ),
    ),
  )

  const models = await Promise.all(
    ['terrain', 'structures', 'substation-new', 'finishes'].map((part, i) =>
      Model.fromGltfAsync({
        url: urls[i]!,
        modelMatrix:
          part === 'substation-new'
            ? Matrix4.multiplyByTranslation(frame, new Cartesian3(-50, 0, 0.14), new Matrix4())
            : frame,
        upAxis: Axis.Y,
        forwardAxis: Axis.X,
        id:
          part === 'structures'
            ? `portal-structures:${end}`
            : part === 'substation-new'
              ? `substation-${end + 1}`
              : undefined,
        enableVerticalExaggeration: false,
        allowPicking: part !== 'finishes',
      }),
    ),
  )

  const mountain = models[0]!
  const structures = models[1]!
  const substation = models[2]!
  const finishes = models[3]!

  mountain.imageBasedLighting.sphericalHarmonicCoefficients = Array.from({ length: 9 }, (_, index) =>
    index === 0 ? new Cartesian3(0.8, 0.84, 0.9) : new Cartesian3(),
  )
  const daylight = mountain.imageBasedLighting.sphericalHarmonicCoefficients
  for (const model of models.slice(1)) {
    model.imageBasedLighting.sphericalHarmonicCoefficients = daylight
  }

  mountain.customShader = new CustomShader({
    uniforms: {
      u_map: { type: UniformType.SAMPLER_2D, value: new TextureUniform({ url: imagery.image }) },
      u_inverse: { type: UniformType.MAT4, value: inverse },
      u_mapU: { type: UniformType.VEC3, value: imagery.u },
      u_mapV: { type: UniformType.VEC3, value: imagery.v },
    },
    fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
      vec3 local = (u_inverse * vec4(fsInput.attributes.positionWC, 1.0)).xyz;
      vec2 uv = vec2(dot(u_mapU, vec3(local.xy, 1.0)), dot(u_mapV, vec3(local.xy, 1.0)));
      float edge = max(smoothstep(50.0, 99.0, abs(local.y)), max(smoothstep(150.0, 219.0, local.x), smoothstep(110.0, 179.0, -local.x)));
      material.diffuse *= vec3(0.98, 1.0, 0.97);
      material.diffuse *= 1.0 - edge;
      material.emissive += czm_srgbToLinear(texture(u_map, uv).rgb) * edge;
    }`,
  })

  const lamps = portalLamps.map(l => {
    const y = survey.project ? studioPortalLateral(survey.project, end, l.y) : l.y
    const tube = survey.tubes.length === 1 ? 0 : (l.y < 0 ? 0 : 1) ^ end
    const b = survey.project?.bores[tube]
    return {
      ...l,
      x: l.x + (survey.project ? studioPortalAlong(survey.project, end, l.y) : 0),
      y,
      headY: streetlightHead(l).y + y - l.y,
      roadCenter: b ? (end === 0 ? -b.offset : b.offset) : l.y < 0 ? -12 : 12,
      roadHalfWidth: b ? (b.lanes.length * b.laneWidth) / 2 : 4.3,
    }
  })

  const devices: SceneDevice[] = lamps.map((lamp, index) => {
    const tube = survey.tubes.length === 1 ? 0 : (portalLamps[index]!.y < 0 ? 0 : 1) ^ end
    const sideLateral = (lamp.headY - lamp.roadCenter) * (end === 0 ? 1 : -1)
    return {
      id: `street-${end * portalLamps.length + index + 1}`,
      kind: 'street',
      tube,
      station: end === 0 ? -PORTAL_EXTENSION + lamp.x : survey.length + PORTAL_EXTENSION - lamp.x,
      lateral: sideLateral,
      height: 8,
      heading: 0,
      portalEnd: end,
      position: world(streetlightHead(lamp)),
    }
  })

  const lampUniforms = Object.fromEntries(
    portalLamps.map((_, index) => [`u_lamp${index}`, { type: UniformType.FLOAT, value: 0 }]),
  )
  const lampLocations = Object.fromEntries(
    lamps.map((l, i) => [`u_lampLocation${i}`, { type: UniformType.VEC3, value: new Cartesian3(l.x, l.y, 0) }]),
  )

  const lighting = new CustomShader({
    uniforms: {
      ...lampUniforms,
      ...lampLocations,
      u_inverseSite: { type: UniformType.MAT4, value: inverse },
      u_street: { type: UniformType.FLOAT, value: 0 },
      u_day: { type: UniformType.FLOAT, value: 1 },
      u_hideZ0: { type: UniformType.FLOAT, value: 999 },
      u_hideZ1: { type: UniformType.FLOAT, value: 999 },
      u_nameLeft: { type: UniformType.FLOAT, value: survey.project ? studioPortalAlong(survey.project, end, -12) : 0 },
      u_nameRight: { type: UniformType.FLOAT, value: survey.project ? studioPortalAlong(survey.project, end, 12) : 0 },
    },
    fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
      material.diffuse *= mix(0.6, 1.0, u_day);
      vec3 local = (u_inverseSite * vec4(fsInput.attributes.positionWC, 1.0)).xyz;
      vec3 vertex = fsInput.attributes.positionMC;
      bool fascia = vertex.y > 8.9 && vertex.y < 10.0 && (abs(vertex.x - u_nameLeft + 1.54) < 0.04 || abs(vertex.x - u_nameRight + 1.54) < 0.04);
      if (fascia && (abs(vertex.z - u_hideZ0) < 6.0 || abs(vertex.z - u_hideZ1) < 6.0)) discard;
      float power = u_street;
      ${portalLamps.map((_, index) => `if (abs(local.x - u_lampLocation${index}.x) < 3.0 && abs(local.y - u_lampLocation${index}.y) < 5.0) power = u_lamp${index};`).join('\n')}
      if (length(material.emissive) > 0.05 && material.emissive.g > material.emissive.r * 0.7) {
        material.diffuse = mix(vec3(0.055, 0.065, 0.075), vec3(1.0, 0.94, 0.78), power);
        material.roughness = 0.28;
        material.emissive = vec3(1.0, 0.86, 0.58) * power * 6.0;
      }
    }`,
  })

  structures.customShader = lighting
  substation.customShader = lighting
  finishes.customShader = lighting

  // 场景编辑器默认不展示未配置的变电所模型
  substation.show = false

  viewer.scene.primitives.add(transition)
  viewer.scene.primitives.add(mountain)
  viewer.scene.primitives.add(structures)
  viewer.scene.primitives.add(substation)
  viewer.scene.primitives.add(finishes)

  const streetlights = addPortalStreetlights(
    viewer,
    frame,
    lamps,
    devices,
    (index, power) => lighting.setUniform(`u_lamp${index}`, power),
    () => true,
  )

  const nameMaterials = survey.tubes.map(() => new ImageMaterialProperty({ transparent: true }))
  const namePanels = survey.tubes.map((_, tube) => {
    const y = studioPortalNameLateral(survey.project, end, tube)
    return viewer.entities.add({
      show: false,
      position: world(
        new Cartesian3(
          -1.59 + (survey.project ? studioPortalAlong(survey.project, end, (tube ^ end) === 0 ? -12 : 12) : 0),
          y,
          9.45,
        ),
      ),
      orientation: Quaternion.fromRotationMatrix(Matrix4.getMatrix3(frame, new Matrix3())),
      plane: {
        plane: new Plane(new Cartesian3(-1, 0, 0), 0),
        dimensions: new Cartesian2(5, 0.85),
        material: nameMaterials[tube],
      },
    })
  })

  function paintName(name: string, textColor = '#e8eddf'): string {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 174
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, 1024, 174)
    ctx.fillStyle = textColor || '#e8eddf'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let size = 140
    do {
      ctx.font = `${size}px "PingFang SC","Microsoft YaHei",sans-serif`
      size -= 2
    } while (ctx.measureText(name).width > 980 && size > 24)
    ctx.fillText(name, 512, 87)
    return canvas.toDataURL()
  }

  function setNames(names: string[], textColor = '#e8eddf') {
    const hideZ = [999, 999]
    let slot = 0
    const customColor = textColor.toLowerCase() !== '#e8eddf'
    survey.tubes.forEach((_, tube) => {
      const name = (names[tube] ?? '青山隧道').trim() || '青山隧道'
      const custom = name !== '青山隧道' || customColor
      if (custom && slot < 2) hideZ[slot++] = -studioPortalNameLateral(survey.project, end, tube)
      if (custom) nameMaterials[tube]!.image = new ConstantProperty(paintName(name, textColor))
      namePanels[tube]!.show = custom
    })
    lighting.setUniform('u_hideZ0', hideZ[0])
    lighting.setUniform('u_hideZ1', hideZ[1])
    viewer.scene.requestRender()
  }

  setNames(
    survey.tubes.map((_, tube) => {
      const bore = survey.project?.bores[tube]
      return bore && survey.project ? mouthName(survey.project, bore.id, end) : '青山隧道'
    }),
  )

  const excavation = new ClippingPolygon({
    positions: outerCorners.map(([x, y], i) =>
      world(new Cartesian3(corners[i]![0]! * 0.2 + x! * 0.8, corners[i]![1]! * 0.2 + y! * 0.8, 0)),
    ),
  })

  return {
    setNames,
    excavation,
    frame,
    structures,
    substation,
    dispose() {
      streetlights.dispose()
      urls.filter(u => u.startsWith('blob:')).forEach(u => URL.revokeObjectURL(u))
    },
    setLighting(state: SystemsState) {
      const skyLight = state.environment === 'night' ? 0.65 : state.environment === 'fog' ? 0.7 : 1
      mountain.imageBasedLighting.imageBasedLightingFactor = new Cartesian2(skyLight, skyLight)
      for (const model of models.slice(1)) {
        model.imageBasedLighting.imageBasedLightingFactor = new Cartesian2(skyLight, skyLight)
      }
      streetlights.setLighting(state)
      lighting.setUniform('u_street', Number(state.street))
      lighting.setUniform('u_day', Number(state.environment === 'day'))
    },
    setUnderground(enabled: boolean) {
      streetlights.setVisible(!enabled)
      mountain.show = !enabled
      transition.show = !enabled
      finishes.show = !enabled
    },
  }
}
