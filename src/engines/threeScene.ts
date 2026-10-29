// @env browser
import {
  ACESFilmicToneMapping, Color, DirectionalLight, Fog, HemisphereLight,
  Mesh, PCFSoftShadowMap, PerspectiveCamera, Scene, WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { EngineHandle } from '../types/engine'
import { createTunnelSample } from './tunnelSample'

export type SampleView = 'portal' | 'interior' | 'passage'
export interface TunnelSceneHandle extends EngineHandle {
  focus: (view: SampleView) => void
}

export function createThreeScene(container: HTMLDivElement): TunnelSceneHandle {
  const renderer = new WebGLRenderer({ antialias: true })
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  const scene = new Scene()
  scene.background = new Color('#9aafba')
  scene.fog = new Fog('#9aafba', 90, 210)
  const camera = new PerspectiveCamera(55, 1, 0.08, 400)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.maxPolarAngle = Math.PI / 2 - 0.015
  controls.minDistance = 0.5
  controls.maxDistance = 130
  const sample = createTunnelSample()
  const ambient = new HemisphereLight('#d4e8f5', '#39413a', 0.9)
  scene.add(sample.root, ambient)
  const sun = new DirectionalLight('#fff1d9', 3)
  sun.position.set(-30, 45, -35)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, far: 180 })
  sun.shadow.normalBias = 0.06
  scene.add(sun)
  container.append(renderer.domElement)

  function focus(view: SampleView): void {
    const exterior = view === 'portal'
    ambient.intensity = exterior ? 0.9 : 0.22
    sun.intensity = exterior ? 3 : 0.15
    scene.fog = exterior ? new Fog('#9aafba', 90, 210) : new Fog('#10191e', 35, 125)
    if (view === 'portal') {
      camera.position.set(-34, 9, -47); controls.target.set(-4, 4, 7)
    }
    else if (view === 'interior') {
      camera.position.set(-12, 1.8, 10); controls.target.set(-12, 3.1, 42)
    }
    else {
      camera.position.set(-14.5, 1.8, 59.5); controls.target.set(1, 1.7, 60)
    }
    controls.update()
  }
  function resetView() { focus('portal') }
  function resize(): void {
    const width = Math.max(container.clientWidth, 1), height = Math.max(container.clientHeight, 1)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setSize(width, height)
    camera.aspect = width / height; camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resetView(); resize()
  let previous = 0
  renderer.setAnimationLoop((time) => {
    const delta = Math.min((time - previous) / 1000, 0.05); previous = time
    for (const rotor of sample.rotors) rotor.rotation.z += delta * 2
    controls.update(); renderer.render(scene, camera)
  })
  return {
    resetView, focus,
    dispose() {
      renderer.setAnimationLoop(null); observer.disconnect(); controls.dispose()
      const geometries = new Set<Mesh['geometry']>()
      const materials = new Set<import('three').Material>()
      scene.traverse(object => {
        if (object instanceof Mesh) {
          geometries.add(object.geometry)
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
        }
      })
      geometries.forEach(geometry => geometry.dispose())
      materials.forEach(material => material.dispose())
      sample.textures.forEach(texture => texture.dispose())
      sun.shadow.dispose()
      scene.clear(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove()
    },
  }
}
