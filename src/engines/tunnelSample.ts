// @env browser
import {
  BoxGeometry, CanvasTexture, CylinderGeometry, DoubleSide, ExtrudeGeometry,
  Group, Mesh, MeshStandardMaterial, Path, PlaneGeometry, PointLight,
  RepeatWrapping, Shape, SRGBColorSpace, TorusGeometry,
} from 'three'

// Local sample coordinates: X across the bores, Y up, Z along the alignment.
export function createTunnelSample() {
  const root = new Group()
  const textures: CanvasTexture[] = []
  let seed = 19
  function random() { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  function surface(base: number, grain: number, repeatX: number, repeatY: number) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')!
    const pixels = ctx.createImageData(256, 256)
    for (let i = 0; i < pixels.data.length; i += 4) {
      const value = base + (random() - 0.5) * grain
      pixels.data[i] = value
      pixels.data[i + 1] = value
      pixels.data[i + 2] = value * 0.97
      pixels.data[i + 3] = 255
    }
    ctx.putImageData(pixels, 0, 0)
    const texture = new CanvasTexture(canvas)
    texture.wrapS = texture.wrapT = RepeatWrapping
    texture.repeat.set(repeatX, repeatY)
    texture.colorSpace = SRGBColorSpace
    textures.push(texture)
    return texture
  }
  const concreteMap = surface(175, 28, 2, 2)
  const asphaltMap = surface(76, 55, 8, 90)
  const concrete = new MeshStandardMaterial({ map: concreteMap, roughness: 0.93, bumpMap: concreteMap, bumpScale: 0.035 })
  const tile = new MeshStandardMaterial({ color: '#c4cec8', roughness: 0.48 })
  const dark = new MeshStandardMaterial({ color: '#252f32', roughness: 0.8 })
  const steel = new MeshStandardMaterial({ color: '#929da2', metalness: 0.75, roughness: 0.32 })
  const road = new MeshStandardMaterial({ map: asphaltMap, roughness: 0.98, bumpMap: asphaltMap, bumpScale: 0.025 })
  const white = new MeshStandardMaterial({ color: '#e3e1ce', roughness: 0.75 })
  const yellow = new MeshStandardMaterial({ color: '#d5ad42', roughness: 0.7 })
  const red = new MeshStandardMaterial({ color: '#b82e24', metalness: 0.25, roughness: 0.4 })
  const lamp = new MeshStandardMaterial({ color: '#eefff6', emissive: '#c4e4de', emissiveIntensity: 3 })
  const rotors: Group[] = []

  function box(parent: Group, material: MeshStandardMaterial, x: number, y: number, z: number, w: number, h: number, d: number) {
    const mesh = new Mesh(new BoxGeometry(w, h, d), material)
    mesh.position.set(x, y, z)
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  function label(parent: Group, text: string, x: number, y: number, z: number, width: number, background = '#125d3c') {
    const canvas = document.createElement('canvas')
    canvas.width = 1024; canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = background; ctx.fillRect(0, 0, 1024, 256)
    ctx.strokeStyle = '#d8e7db'; ctx.lineWidth = 10; ctx.strokeRect(12, 12, 1000, 232)
    ctx.fillStyle = '#f4fff2'; ctx.font = 'bold 100px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 512, 132)
    const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace; textures.push(map)
    const mesh = new Mesh(new PlaneGeometry(width, width / 4), new MeshStandardMaterial({ map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: 0.35, side: DoubleSide }))
    mesh.position.set(x, y, z); mesh.rotation.y = Math.PI; parent.add(mesh)
    return mesh
  }
  function arch(radius: number, thickness: number, depth: number, material: MeshStandardMaterial) {
    const shape = new Shape()
    shape.moveTo(radius, 2.5)
    shape.absarc(0, 2.5, radius, 0, Math.PI, false)
    shape.lineTo(-radius - thickness, 2.5)
    shape.absarc(0, 2.5, radius + thickness, Math.PI, 0, true)
    shape.closePath()
    return new Mesh(new ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: false, curveSegments: 48 }), material)
  }

  // Both bores have a real opening in the inner wall at station 60 m.
  for (const center of [-12, 12]) {
    const bore = new Group(); bore.position.x = center; root.add(bore)
    const shell = arch(5.5, 0.55, 120, concrete); shell.receiveShadow = true; shell.castShadow = true; bore.add(shell)
    box(bore, road, 0, -0.12, 35, 11, 0.24, 170)
    for (const side of [-1, 1]) {
      const inner = center * side < 0
      for (const [start, end] of inner ? [[0, 58], [62, 120]] : [[0, 120]]) {
        box(bore, concrete, side * 5.77, 1.25, (start! + end!) / 2, 0.55, 2.5, end! - start!)
        box(bore, tile, side * 5.48, 1.25, (start! + end!) / 2, 0.035, 1.7, end! - start!)
      }
      for (const [start, end] of inner ? [[-40, 58], [62, 120]] : [[-40, 120]]) {
        box(bore, concrete, side * 5, 0.18, (start! + end!) / 2, 0.9, 0.36, end! - start!)
        box(bore, white, side * 4.52, 0.025, (start! + end!) / 2, 0.12, 0.035, end! - start!)
      }
      // Cable tray with two rails and visible supports.
      for (const x of [4.6, 4.95]) box(bore, steel, side * x, 4.25, 60, 0.05, 0.12, 120)
      box(bore, dark, side * 4.78, 4.22, 60, 0.38, 0.035, 120)
      for (let z = 2; z < 120; z += 4) {
        box(bore, steel, side * 4.9, 4.08, z, 0.65, 0.06, 0.08)
        box(bore, steel, side * 5.18, 4.34, z, 0.06, 0.55, 0.08)
        box(bore, dark, side * 4.55, 4.63, z, 0.46, 0.18, 1.5)
        box(bore, lamp, side * 4.55, 4.52, z, 0.32, 0.045, 1.35)
        box(bore, yellow, side * 4.55, 0.24, z, 0.035, 0.14, 0.22)
      }
      for (let z = -38; z < 120; z += 2) {
        if (inner && Math.abs(z - 60) < 3) continue
        box(bore, dark, side * 5.27, 0.365, z, 0.26, 0.015, 0.6)
      }
      for (let z = 6; z < 120; z += 6) {
        if (inner && Math.abs(z - 60) < 3) continue
        box(bore, dark, side * 5.455, 1.25, z, 0.012, 1.7, 0.012)
      }
      for (const z of [25, 85]) {
        const cabinet = box(bore, steel, side * 5.32, 1.45, z, 0.26, 1.3, 1)
        cabinet.castShadow = true
        box(bore, red, side * 5.16, 1.45, z, 0.06, 1.12, 0.87)
        box(bore, white, side * 5.12, 1.45, z + 0.3, 0.025, 0.18, 0.035)
        const sign = label(bore, '消火栓  FIRE', side * 5.09, 2.4, z, 1, '#8d2622')
        sign.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2
      }
    }
    for (let z = -45; z < 120; z += 9) box(bore, white, 0, 0.025, z, 0.15, 0.035, 4.5)
    for (let z = 0; z <= 120; z += 6) {
      const joint = arch(5.485, 0.022, 0.022, dark); joint.position.z = z; bore.add(joint)
    }
    // Actual local illumination; limit light count instead of creating a light for every fixture.
    for (const z of [8, 28, 48, 68, 88, 108]) {
      const light = new PointLight('#d9edee', 48, 25, 1.4)
      light.position.set(0, 5.5, z); bore.add(light)
    }
    for (const z of [24, 86]) {
      for (const x of [-1.5, 1.5]) {
        const fan = new Group(); fan.position.set(x, 6.3, z); bore.add(fan)
        const housing = new Mesh(new CylinderGeometry(0.57, 0.57, 2.5, 40, 1, true), steel)
        housing.rotation.x = Math.PI / 2; fan.add(housing)
        for (const end of [-1.25, 1.25]) {
          const ring = new Mesh(new TorusGeometry(0.57, 0.065, 10, 40), steel)
          ring.position.z = end; fan.add(ring)
          for (let i = -2; i <= 2; i++) box(fan, dark, i * 0.17, 0, end, 0.025, 0.85 - Math.abs(i) * 0.1, 0.025)
        }
        const rotor = new Group(); rotor.position.z = -1.17; fan.add(rotor); rotors.push(rotor)
        for (let i = 0; i < 7; i++) {
          const blade = box(rotor, steel, 0, 0, 0, 0.17, 0.47, 0.04)
          blade.position.set(Math.sin(i * Math.PI * 2 / 7) * 0.25, Math.cos(i * Math.PI * 2 / 7) * 0.25, 0)
          blade.rotation.z = -i * Math.PI * 2 / 7 + 0.3
        }
        box(bore, steel, x, 7.1, z, 0.12, 0.9, 0.15)
        box(bore, steel, x, 7.53, z, 1.2, 0.12, 0.55)
      }
    }
    for (const z of [8, 52, 100]) {
      box(bore, steel, 0, 5.7, z, 3.2, 0.08, 0.1)
      label(bore, '↓  车道通行  ↓', 0, 5.3, z - 0.1, 2.7)
    }
    const exitSign = label(bore, '安全出口 →', center < 0 ? 5.42 : -5.42, 2.9, 56, 1.7)
    exitSign.rotation.y = center < 0 ? -Math.PI / 2 : Math.PI / 2
    const end = new Mesh(new PlaneGeometry(11, 9), dark)
    end.position.set(0, 4.5, 120); end.rotation.y = Math.PI; bore.add(end)
    // Thick portal collar and a separate facade with a horseshoe-shaped opening.
    const facade = new Shape()
    facade.moveTo(-7, 0); facade.lineTo(7, 0); facade.lineTo(7, 10); facade.lineTo(-7, 10); facade.closePath()
    const opening = new Path()
    opening.moveTo(-5.5, 0); opening.lineTo(-5.5, 2.5)
    opening.absarc(0, 2.5, 5.5, Math.PI, 0, true)
    opening.lineTo(5.5, 0); opening.closePath(); facade.holes.push(opening)
    const face = new Mesh(new ExtrudeGeometry(facade, { depth: 1.2, bevelEnabled: false, curveSegments: 48 }), concrete)
    face.position.z = -1.2; face.castShadow = true; face.receiveShadow = true; bore.add(face)
    const collar = arch(5.52, 0.3, 0.3, steel); collar.position.z = -1.5; bore.add(collar)
    label(bore, center < 0 ? '青山隧道 · 上行' : '青山隧道 · 下行', 0, 9.03, -1.25, 5.8, '#283f40')
    for (const side of [-1, 1]) {
      box(bore, concrete, side * 7, 2.2, -15, 0.7, 4.4, 30)
      for (let z = -29; z < 0; z += 3) box(bore, concrete, side * 6.56, 2.2, z, 0.2, 4.4, 0.28)
      for (let z = -27; z < 0; z += 6) {
        box(bore, steel, side * 4.8, 0.68, z, 0.08, 1, 0.08)
      }
      box(bore, steel, side * 4.8, 1.03, -15, 0.12, 0.2, 28)
    }
    label(bore, '限高 5 m     限速 60', 0, 6.8, -10, 3.4)
    for (const x of [-4.5, 4.5]) box(bore, steel, x, 3.6, -10, 0.12, 7.2, 0.12)
    box(bore, steel, 0, 7.15, -10, 9.1, 0.12, 0.12)
  }
  // Clear 4 m opening, continuous floor and overhead lights connecting the two bores.
  box(root, concrete, 0, 0.07, 60, 13, 0.14, 4)
  for (const z of [57.8, 62.2]) box(root, tile, 0, 1.6, z, 13, 3.2, 0.4)
  box(root, concrete, 0, 3.3, 60, 13, 0.3, 4.8)
  for (const x of [-5, 0, 5]) {
    box(root, lamp, x, 3.12, 60, 1.1, 0.06, 0.25)
    const light = new PointLight('#d3f0da', 28, 9, 1.4); light.position.set(x, 2.7, 60); root.add(light)
  }
  label(root, '人行联络通道  01', -6.35, 2.8, 60, 2).rotation.y = -Math.PI / 2
  box(root, concrete, 0, -0.5, -15, 90, 0.6, 100)
  // Local landscape massing only. Geographic terrain remains in Cesium.
  const rock = new MeshStandardMaterial({ color: '#656c58', map: concreteMap, roughness: 1 })
  const hill = new PlaneGeometry(150, 130, 60, 52)
  hill.rotateX(-Math.PI / 2)
  const positions = hill.attributes.position!
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i) + 65
    const height = 9.4 + 20 * Math.exp(-((x / 48) ** 2)) * Math.sin(Math.PI * Math.min(z / 160, 1)) + 0.7 * Math.sin(x * 0.4) * Math.sin(z * 0.3)
    positions.setXYZ(i, x, height, z + 2)
  }
  hill.computeVertexNormals(); const landscape = new Mesh(hill, rock); landscape.receiveShadow = true; root.add(landscape)
  box(root, rock, 0, 5.35, 7, 9.9, 10.7, 12)
  for (const side of [-1, 1]) box(root, rock, side * 47, 5.35, 17, 54, 10.7, 30)
  return { root, textures, rotors }
}
