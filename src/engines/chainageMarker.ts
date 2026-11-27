import {
  BoundingSphere, BoxGeometry, Cartesian3, Color, ColorGeometryInstanceAttribute,
  ComponentDatatype, Geometry, GeometryAttribute, GeometryAttributes, GeometryInstance,
  Material, MaterialAppearance, Matrix4, PerInstanceColorAppearance, Primitive, PrimitiveType,
} from 'cesium'
import type { Viewer } from 'cesium'

export const MILESTONE_WIDTH = 1.12
export const MILESTONE_HEIGHT = 0.34
export const MILESTONE_THICKNESS = 0.04
export const MILESTONE_MOUNT_HEIGHT = 1.05
export const MILESTONE_WALL_OFFSET = 5.44
export const MILESTONE_SPACING = 100

const textureCache = new Map<string, string>()

export function createChainageTexture(label: string): string {
  const key = label.trim() || 'K0+000'
  const cached = textureCache.get(key)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 160
  const ctx = canvas.getContext('2d')!

  // Highway tunnel reflective green backing with subtle vertical gradient
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height)
  grad.addColorStop(0, '#0e7c4f')
  grad.addColorStop(1, '#095c3a')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Crisp white reflective inner border
  const inset = 12
  const radius = 14
  ctx.strokeStyle = '#f2f7f4'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.roundRect(inset, inset, canvas.width - inset * 2, canvas.height - inset * 2, radius)
  ctx.stroke()

  // High-contrast bold chainage typography
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const fontSize = key.length > 8 ? 64 : 78
  ctx.font = `700 ${fontSize}px "DIN Alternate", "Helvetica Neue", "PingFang SC", sans-serif`
  ctx.fillText(key, canvas.width / 2, canvas.height / 2 + 2)

  const url = canvas.toDataURL()
  textureCache.set(key, url)
  return url
}

export interface ChainageMarkerHandle {
  move(delta: Matrix4): void
  setVisible(visible: boolean): void
  setText(label: string): void
  setBrightness(level: number): void
  dispose(): void
}

export function createChainageMarker(
  viewer: Viewer,
  matrix: Matrix4,
  label: string,
  id: string,
): ChainageMarkerHandle {
  const baseMatrix = Matrix4.clone(matrix)
  let currentLabel = label

  // 1. Metallic backing plate in local coordinates (X: along wall, Y: thickness, Z: height)
  const backingPrimitive = viewer.scene.primitives.add(
    new Primitive({
      asynchronous: false,
      compressVertices: false,
      modelMatrix: Matrix4.clone(baseMatrix),
      geometryInstances: new GeometryInstance({
        id,
        geometry: BoxGeometry.fromDimensions({
          dimensions: new Cartesian3(MILESTONE_WIDTH, MILESTONE_THICKNESS, MILESTONE_HEIGHT),
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString('#27323a')),
        },
      }),
      appearance: new PerInstanceColorAppearance({ flat: true, translucent: false, closed: true }),
    }),
  )

  // 2. Front sign face at local y = +thickness/2 + 0.002 facing into the carriageway (+Y)
  const hw = (MILESTONE_WIDTH - 0.02) * 0.5
  const hh = (MILESTONE_HEIGHT - 0.02) * 0.5
  const faceY = MILESTONE_THICKNESS * 0.5 + 0.002
  const positions = new Float64Array([
    hw, faceY, -hh,
    -hw, faceY, -hh,
    -hw, faceY, hh,
    hw, faceY, hh,
  ])
  const attributes = new GeometryAttributes()
  attributes.position = new GeometryAttribute({
    componentDatatype: ComponentDatatype.DOUBLE,
    componentsPerAttribute: 3,
    values: positions,
  })
  attributes.st = new GeometryAttribute({
    componentDatatype: ComponentDatatype.FLOAT,
    componentsPerAttribute: 2,
    values: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
  })
  attributes.normal = new GeometryAttribute({
    componentDatatype: ComponentDatatype.FLOAT,
    componentsPerAttribute: 3,
    values: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
  })

  const material = new Material({
    fabric: {
      type: 'TunnelChainageMarker',
      uniforms: {
        image: createChainageTexture(label),
        u_brightness: 0.75,
      },
      source: `
        czm_material czm_getMaterial(czm_materialInput materialInput) {
          czm_material m = czm_getDefaultMaterial(materialInput);
          vec3 tex = texture(image, materialInput.st).rgb;
          m.diffuse = tex * (0.45 * u_brightness);
          m.emission = tex * (0.42 + 0.42 * u_brightness);
          m.alpha = 1.0;
          return m;
        }
      `,
    },
    translucent: false,
  })

  const facePrimitive = viewer.scene.primitives.add(
    new Primitive({
      asynchronous: false,
      compressVertices: false,
      modelMatrix: Matrix4.clone(baseMatrix),
      geometryInstances: new GeometryInstance({
        id,
        geometry: new Geometry({
          attributes,
          indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
          primitiveType: PrimitiveType.TRIANGLES,
          boundingSphere: BoundingSphere.fromVertices(Array.from(positions)),
        }),
      }),
      appearance: new MaterialAppearance({
        material,
        materialSupport: MaterialAppearance.MaterialSupport.TEXTURED,
        faceForward: false,
        closed: false,
      }),
    }),
  )

  return {
    move(delta: Matrix4) {
      const next = Matrix4.multiply(delta, baseMatrix, new Matrix4())
      backingPrimitive.modelMatrix = next
      facePrimitive.modelMatrix = Matrix4.clone(next)
    },
    setVisible(visible: boolean) {
      backingPrimitive.show = visible
      facePrimitive.show = visible
    },
    setText(nextLabel: string) {
      if (nextLabel === currentLabel) return
      currentLabel = nextLabel
      material.uniforms.image = createChainageTexture(nextLabel)
    },
    setBrightness(level: number) {
      material.uniforms.u_brightness = Math.max(0.2, Math.min(1, level))
    },
    dispose() {
      if (viewer.scene.primitives.contains(backingPrimitive)) viewer.scene.primitives.remove(backingPrimitive)
      if (viewer.scene.primitives.contains(facePrimitive)) viewer.scene.primitives.remove(facePrimitive)
    },
  }
}
