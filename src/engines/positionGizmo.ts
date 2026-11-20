import { Cartesian2, Cartesian3, Matrix4, SceneTransforms } from 'cesium'
import type { Viewer } from 'cesium'

export type GizmoTransformMode = 'translate' | 'rotate' | 'scale'

export interface GizmoTransformState {
  offset: Cartesian3
  headingDelta: number
  scale: number
}

export interface TransformGizmoOptions {
  mode?: GizmoTransformMode
  initialHeadingDelta?: number
  initialScale?: number
  onRotate?: (headingDelta: number, shiftHeld: boolean) => void
  onScale?: (scale: number, shiftHeld: boolean) => void
  onMoveWithShift?: (offset: Cartesian3, shiftHeld: boolean) => void
  onCommit?: (state: GizmoTransformState) => void
}

export function axisDistance(rayOrigin: Cartesian3, rayDirection: Cartesian3, origin: Cartesian3, axis: Cartesian3): number | undefined {
  const dot = Cartesian3.dot(rayDirection, axis), denominator = 1 - dot * dot
  if (denominator < .015) return undefined
  const offset = Cartesian3.subtract(rayOrigin, origin, new Cartesian3())
  return (Cartesian3.dot(offset, axis) - dot * Cartesian3.dot(offset, rayDirection)) / denominator
}

function planeIntersection(
  rayOrigin: Cartesian3,
  rayDirection: Cartesian3,
  planeOrigin: Cartesian3,
  normal: Cartesian3,
  axisA: Cartesian3,
  axisB: Cartesian3,
): [number, number] | undefined {
  const denom = Cartesian3.dot(rayDirection, normal)
  if (Math.abs(denom) < 0.08) return undefined
  const diff = Cartesian3.subtract(planeOrigin, rayOrigin, new Cartesian3())
  const t = Cartesian3.dot(diff, normal) / denom
  if (t < 0) return undefined
  const hit = Cartesian3.add(rayOrigin, Cartesian3.multiplyByScalar(rayDirection, t, new Cartesian3()), new Cartesian3())
  const rel = Cartesian3.subtract(hit, planeOrigin, new Cartesian3())
  return [Cartesian3.dot(rel, axisA), Cartesian3.dot(rel, axisB)]
}

const BOX_EDGES: readonly [number, number][] = [
  [0, 1], [1, 3], [3, 2], [2, 0],
  [4, 5], [5, 7], [7, 6], [6, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
]

type AxisIndex = 0 | 1 | 2
type PlaneDef = { id: string; a: AxisIndex; b: AxisIndex; normalAxis: AxisIndex; fill: string; stroke: string; label: string }

const PLANES: readonly PlaneDef[] = [
  { id: 'xy', a: 0, b: 1, normalAxis: 2, fill: 'rgba(56, 224, 255, 0.34)', stroke: '#54e8ff', label: 'XY 水平面' },
  { id: 'xz', a: 0, b: 2, normalAxis: 1, fill: 'rgba(240, 108, 255, 0.32)', stroke: '#f584ff', label: 'XZ 纵断面' },
  { id: 'yz', a: 1, b: 2, normalAxis: 0, fill: 'rgba(255, 174, 76, 0.34)', stroke: '#ffbe66', label: 'YZ 横断面' },
]

const RING_SEGMENTS = 48

export function positionGizmo(
  viewer: Viewer,
  frame: Matrix4,
  constrained: boolean,
  onMove: (offset: Cartesian3) => void,
  onCancel: () => void,
  boxSize: [number, number, number] = [1.4, 1.0, 0.9],
  boxOffset: [number, number, number] = [0, 0, 0],
  options: TransformGizmoOptions = {},
) {
  const axes = [
    Cartesian3.UNIT_X,
    Cartesian3.negate(Cartesian3.UNIT_Y, new Cartesian3()),
    Cartesian3.UNIT_Z,
  ].map(a => Cartesian3.normalize(Matrix4.multiplyByPointAsVector(frame, a, new Cartesian3()), new Cartesian3()))

  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  const offset = new Cartesian3()
  let mode: GizmoTransformMode = constrained ? 'translate' : (options.mode ?? 'translate')
  let headingDelta = options.initialHeadingDelta ?? 0
  let scale = options.initialScale ?? 1
  let snapHint = ''

  svg.setAttribute('class', 'position-axes')
  svg.setAttribute('aria-label', '三维变换控制器')
  Object.assign(svg.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    overflow: 'visible',
    zIndex: '7',
  })
  viewer.container.append(svg)

  // 1. Yellow 3D bounding wireframe box
  const boxGroup = document.createElementNS(ns, 'g')
  const boxLines = BOX_EDGES.map(() => {
    const line = document.createElementNS(ns, 'line')
    line.setAttribute('stroke', '#ffe63b')
    line.setAttribute('stroke-width', '1.6')
    line.setAttribute('stroke-opacity', '0.95')
    boxGroup.append(line)
    return line
  })
  svg.append(boxGroup)

  // 2. Center plane drag handles (translate mode)
  const translatePlanesGroup = document.createElementNS(ns, 'g')
  const planeHandles = (constrained ? [] : PLANES).map(def => {
    const group = document.createElementNS(ns, 'g')
    const poly = document.createElementNS(ns, 'polygon')
    poly.setAttribute('fill', def.fill)
    poly.setAttribute('stroke', def.stroke)
    poly.setAttribute('stroke-width', '1.5')
    poly.style.pointerEvents = 'all'
    poly.style.cursor = 'move'
    poly.setAttribute('aria-label', def.label)
    group.append(poly)
    translatePlanesGroup.append(group)
    return { def, group, poly }
  })
  svg.append(translatePlanesGroup)

  // 3. Axis handles (shared by translate arrows and scale cube caps)
  const axisColors = [
    { main: '#ff3b3b', dark: '#b81d1d', glow: '#ff8a8a', label: 'X 沿线路' },
    { main: '#24e058', dark: '#119638', glow: '#7dff9e', label: 'Y 横向' },
    { main: '#2e88ff', dark: '#1554b5', glow: '#8ac2ff', label: 'Z 高度' },
  ] as const

  const axisGroup = document.createElementNS(ns, 'g')
  const handles = axes.slice(0, constrained ? 1 : 3).map((_, i) => {
    const spec = axisColors[i]!
    const group = document.createElementNS(ns, 'g')
    const line = document.createElementNS(ns, 'line')
    const hit = document.createElementNS(ns, 'line')
    const coneLeft = document.createElementNS(ns, 'polygon')
    const coneRight = document.createElementNS(ns, 'polygon')
    const scaleBox = document.createElementNS(ns, 'rect')
    const tipHit = document.createElementNS(ns, 'circle')
    const label = document.createElementNS(ns, 'text')

    line.setAttribute('stroke', spec.main)
    line.setAttribute('stroke-width', '2.6')
    line.setAttribute('stroke-linecap', 'round')
    hit.setAttribute('stroke', 'transparent')
    hit.setAttribute('stroke-width', '24')
    hit.style.pointerEvents = 'stroke'
    hit.style.cursor = 'grab'
    hit.setAttribute('data-axis', String(i))
    hit.setAttribute('aria-label', spec.label)

    coneLeft.setAttribute('fill', spec.main)
    coneRight.setAttribute('fill', spec.dark)

    scaleBox.setAttribute('width', '12')
    scaleBox.setAttribute('height', '12')
    scaleBox.setAttribute('rx', '2')
    scaleBox.setAttribute('fill', spec.main)
    scaleBox.setAttribute('stroke', '#081326')
    scaleBox.setAttribute('stroke-width', '1.4')
    scaleBox.style.display = 'none'

    tipHit.setAttribute('r', '15')
    tipHit.setAttribute('fill', 'transparent')
    tipHit.style.pointerEvents = 'all'
    tipHit.style.cursor = 'grab'

    label.textContent = spec.label
    label.setAttribute('fill', spec.glow)
    label.setAttribute('font-size', '12')
    label.setAttribute('font-weight', '600')
    label.setAttribute('stroke', '#081326')
    label.setAttribute('stroke-width', '3.2')
    label.style.paintOrder = 'stroke'

    group.append(line, coneLeft, coneRight, scaleBox, label, hit, tipHit)
    axisGroup.append(group)
    return { group, line, hit, tipHit, coneLeft, coneRight, scaleBox, label, spec }
  })
  svg.append(axisGroup)

  // 4. Rotate mode: projected 3D Yaw ring + active angle ray
  const rotateGroup = document.createElementNS(ns, 'g')
  const rotateRing = document.createElementNS(ns, 'polyline')
  rotateRing.setAttribute('fill', 'none')
  rotateRing.setAttribute('stroke', '#42d8ff')
  rotateRing.setAttribute('stroke-width', '3')
  const rotateRingHit = document.createElementNS(ns, 'polyline')
  rotateRingHit.setAttribute('fill', 'none')
  rotateRingHit.setAttribute('stroke', 'transparent')
  rotateRingHit.setAttribute('stroke-width', '24')
  rotateRingHit.style.pointerEvents = 'stroke'
  rotateRingHit.style.cursor = 'grab'
  rotateRingHit.setAttribute('aria-label', '水平朝向旋转环')
  const rotateRay = document.createElementNS(ns, 'line')
  rotateRay.setAttribute('stroke', '#ffe63b')
  rotateRay.setAttribute('stroke-width', '2')
  rotateRay.setAttribute('stroke-dasharray', '4 3')
  const rotateLabel = document.createElementNS(ns, 'text')
  rotateLabel.textContent = 'Yaw 旋转'
  rotateLabel.setAttribute('fill', '#98ecff')
  rotateLabel.setAttribute('font-size', '12')
  rotateLabel.setAttribute('font-weight', '600')
  rotateLabel.setAttribute('stroke', '#081326')
  rotateLabel.setAttribute('stroke-width', '3.2')
  rotateLabel.style.paintOrder = 'stroke'
  rotateGroup.append(rotateRing, rotateRay, rotateLabel, rotateRingHit)
  svg.append(rotateGroup)

  // Center origin handle (clickable uniform scale in scale mode)
  const originDot = document.createElementNS(ns, 'circle')
  originDot.setAttribute('r', '5')
  originDot.setAttribute('fill', '#ffffff')
  originDot.setAttribute('stroke', '#0b1730')
  originDot.setAttribute('stroke-width', '1.6')
  originDot.style.pointerEvents = 'all'
  svg.append(originDot)

  // Live drag HUD readout
  const readoutGroup = document.createElementNS(ns, 'g')
  readoutGroup.style.display = 'none'
  const readoutBg = document.createElementNS(ns, 'rect')
  readoutBg.setAttribute('rx', '6')
  readoutBg.setAttribute('fill', 'rgba(8, 17, 38, 0.92)')
  readoutBg.setAttribute('stroke', '#ffe63b')
  readoutBg.setAttribute('stroke-width', '1')
  const readoutText = document.createElementNS(ns, 'text')
  readoutText.setAttribute('fill', '#fff5b8')
  readoutText.setAttribute('font-size', '12')
  readoutText.setAttribute('font-weight', '600')
  readoutGroup.append(readoutBg, readoutText)
  svg.append(readoutGroup)

  let hovered: { kind: 'axis'; index: number } | { kind: 'plane'; id: string } | { kind: 'rotate' } | { kind: 'uniform-scale' } | null = null
  let drag:
    | { kind: 'axis'; axis: AxisIndex; start: number; offset: Cartesian3; originAtStart: Cartesian3; moved: boolean }
    | { kind: 'plane'; def: PlaneDef; startA: number; startB: number; offset: Cartesian3; originAtStart: Cartesian3; moved: boolean }
    | { kind: 'rotate'; startAngleRad: number; startHeading: number; originAtStart: Cartesian3; moved: boolean }
    | { kind: 'scale'; axis?: AxisIndex; startScreenX: number; startScale: number; startDist?: number; originAtStart: Cartesian3; moved: boolean }
    | undefined
  let inputs = true
  let enabled = true
  let pointerScreen: { x: number; y: number } | null = null

  function currentCenter(): Cartesian3 {
    return Matrix4.multiplyByPoint(
      frame,
      new Cartesian3(offset.x + boxOffset[0], -offset.y + boxOffset[1], offset.z + boxOffset[2]),
      new Cartesian3(),
    )
  }

  function applyHighlightStyles(): void {
    const activeAxis = (drag?.kind === 'axis' || drag?.kind === 'scale') && drag.axis !== undefined ? drag.axis : hovered?.kind === 'axis' ? hovered.index : -1
    const activePlane = drag?.kind === 'plane' ? drag.def.id : hovered?.kind === 'plane' ? hovered.id : ''
    const activeRotate = drag?.kind === 'rotate' || hovered?.kind === 'rotate'
    const hasFocus = activeAxis !== -1 || activePlane !== '' || activeRotate

    handles.forEach((h, i) => {
      const active = activeAxis === i || (drag?.kind === 'plane' && (drag.def.a === i || drag.def.b === i))
      h.line.setAttribute('stroke-width', active ? '4' : '2.6')
      h.line.setAttribute('stroke', active ? h.spec.glow : h.spec.main)
      h.group.style.opacity = hasFocus && !active ? '0.42' : '1'
      const cursor = drag ? 'grabbing' : 'grab'
      h.hit.style.cursor = cursor
      h.tipHit.style.cursor = cursor
    })

    planeHandles.forEach(p => {
      const active = activePlane === p.def.id
      p.poly.setAttribute('fill-opacity', active ? '1' : hasFocus ? '0.35' : '0.75')
      p.poly.setAttribute('stroke-width', active ? '2.4' : '1.4')
      p.poly.style.cursor = drag ? 'grabbing' : 'move'
    })

    rotateRing.setAttribute('stroke-width', activeRotate ? '4.5' : '3')
    rotateRing.setAttribute('stroke', activeRotate ? '#a3f2ff' : '#42d8ff')
    rotateRingHit.style.cursor = drag?.kind === 'rotate' ? 'grabbing' : 'grab'

    originDot.setAttribute('r', mode === 'scale' ? '7' : '4.5')
    originDot.setAttribute('fill', mode === 'scale' ? '#ffe63b' : '#ffffff')
    originDot.style.cursor = mode === 'scale' ? (drag ? 'grabbing' : 'ew-resize') : 'default'
  }

  function updateReadout(): void {
    if (!drag || !pointerScreen) {
      readoutGroup.style.display = 'none'
      return
    }
    const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} m`
    const names = ['X', 'Y', 'Z'] as const
    const vals = [offset.x, offset.y, offset.z] as const
    let text = ''
    if (drag.kind === 'axis') {
      text = `Δ${names[drag.axis]} ${fmt(vals[drag.axis]!)}`
    } else if (drag.kind === 'plane') {
      text = `Δ${names[drag.def.a]} ${fmt(vals[drag.def.a]!)} · Δ${names[drag.def.b]} ${fmt(vals[drag.def.b]!)}`
    } else if (drag.kind === 'rotate') {
      text = `Δ朝向 ${headingDelta >= 0 ? '+' : ''}${headingDelta.toFixed(1)}°`
    } else {
      text = `缩放 ×${scale.toFixed(2)}`
    }
    if (snapHint) text += ` · ${snapHint}`

    readoutText.textContent = text
    const x = pointerScreen.x + 16
    const y = pointerScreen.y - 18
    readoutText.setAttribute('x', String(x + 8))
    readoutText.setAttribute('y', String(y + 16))
    const width = Math.max(96, text.length * 8.4 + 18)
    readoutBg.setAttribute('x', String(x))
    readoutBg.setAttribute('y', String(y))
    readoutBg.setAttribute('width', String(width))
    readoutBg.setAttribute('height', '24')
    readoutGroup.style.display = ''
  }

  function render(): void {
    const center = currentCenter()
    const camDist = Cartesian3.distance(viewer.camera.positionWC, center)
    const size = Math.max(0.85, Math.min(14, camDist * 0.13))
    const start = SceneTransforms.worldToWindowCoordinates(viewer.scene, center)

    // 1. Wireframe box (scaled by current uniform scale)
    const [bx, by, bz] = boxSize
    const [ox, oy, oz] = boxOffset
    const hx = bx * 0.5 * scale, hy = by * 0.5 * scale, hz = bz * 0.5 * scale
    const corners: (Cartesian2 | undefined)[] = []
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const p = Matrix4.multiplyByPoint(
            frame,
            new Cartesian3(offset.x + ox + sx * hx, -offset.y + oy + sy * hy, offset.z + oz + sz * hz),
            new Cartesian3(),
          )
          corners.push(SceneTransforms.worldToWindowCoordinates(viewer.scene, p))
        }
      }
    }
    const boxVisible = corners.every(Boolean)
    boxGroup.style.display = boxVisible ? '' : 'none'
    if (boxVisible) {
      BOX_EDGES.forEach(([a, b], idx) => {
        const p1 = corners[a]!, p2 = corners[b]!, line = boxLines[idx]!
        line.setAttribute('x1', String(p1.x))
        line.setAttribute('y1', String(p1.y))
        line.setAttribute('x2', String(p2.x))
        line.setAttribute('y2', String(p2.y))
      })
    }

    originDot.style.display = start ? '' : 'none'
    if (start) {
      originDot.setAttribute('cx', String(start.x))
      originDot.setAttribute('cy', String(start.y))
    }

    const showAxes = mode === 'translate' || mode === 'scale'
    const showPlanes = mode === 'translate'
    const showRotate = mode === 'rotate' && !constrained

    axisGroup.style.display = showAxes ? '' : 'none'
    translatePlanesGroup.style.display = showPlanes ? '' : 'none'
    rotateGroup.style.display = showRotate ? '' : 'none'

    // 2. Plane handles
    if (showPlanes) {
      const planeSpan = size * 0.34
      for (const p of planeHandles) {
        if (!start) {
          p.group.style.display = 'none'
          continue
        }
        const va = Cartesian3.multiplyByScalar(axes[p.def.a]!, planeSpan, new Cartesian3())
        const vb = Cartesian3.multiplyByScalar(axes[p.def.b]!, planeSpan, new Cartesian3())
        const pA = SceneTransforms.worldToWindowCoordinates(viewer.scene, Cartesian3.add(center, va, new Cartesian3()))
        const pB = SceneTransforms.worldToWindowCoordinates(viewer.scene, Cartesian3.add(center, vb, new Cartesian3()))
        const pAB = SceneTransforms.worldToWindowCoordinates(
          viewer.scene,
          Cartesian3.add(Cartesian3.add(center, va, new Cartesian3()), vb, new Cartesian3()),
        )
        if (!pA || !pB || !pAB) {
          p.group.style.display = 'none'
          continue
        }
        p.group.style.display = ''
        p.poly.setAttribute('points', `${start.x},${start.y} ${pA.x},${pA.y} ${pAB.x},${pAB.y} ${pB.x},${pB.y}`)
      }
    }

    // 3. Axis shafts (cones for translate, cube caps for scale)
    if (showAxes) {
      handles.forEach((h, i) => {
        const end = SceneTransforms.worldToWindowCoordinates(
          viewer.scene,
          Cartesian3.add(center, Cartesian3.multiplyByScalar(axes[i]!, size, new Cartesian3()), new Cartesian3()),
        )
        h.group.style.display = start && end ? '' : 'none'
        if (!start || !end) return
        const dx = end.x - start.x, dy = end.y - start.y
        const len = Math.max(1, Math.hypot(dx, dy))
        const ux = dx / len, uy = dy / len

        if (mode === 'translate') {
          const coneLen = 18, coneHalf = 6.5
          const baseX = end.x - ux * coneLen, baseY = end.y - uy * coneLen
          const leftX = baseX - uy * coneHalf, leftY = baseY + ux * coneHalf
          const rightX = baseX + uy * coneHalf, rightY = baseY - ux * coneHalf

          for (const line of [h.line, h.hit]) {
            line.setAttribute('x1', String(start.x))
            line.setAttribute('y1', String(start.y))
            line.setAttribute('x2', String(baseX))
            line.setAttribute('y2', String(baseY))
          }
          h.coneLeft.style.display = ''
          h.coneRight.style.display = ''
          h.scaleBox.style.display = 'none'
          h.coneLeft.setAttribute('points', `${end.x},${end.y} ${leftX},${leftY} ${baseX},${baseY}`)
          h.coneRight.setAttribute('points', `${end.x},${end.y} ${baseX},${baseY} ${rightX},${rightY}`)
        } else {
          for (const line of [h.line, h.hit]) {
            line.setAttribute('x1', String(start.x))
            line.setAttribute('y1', String(start.y))
            line.setAttribute('x2', String(end.x))
            line.setAttribute('y2', String(end.y))
          }
          h.coneLeft.style.display = 'none'
          h.coneRight.style.display = 'none'
          h.scaleBox.style.display = ''
          h.scaleBox.setAttribute('x', String(end.x - 6))
          h.scaleBox.setAttribute('y', String(end.y - 6))
        }
        h.tipHit.setAttribute('cx', String(end.x - ux * 6))
        h.tipHit.setAttribute('cy', String(end.y - uy * 6))
        h.label.setAttribute('x', String(end.x + ux * 10 + 4))
        h.label.setAttribute('y', String(end.y + uy * 10 + 4))
      })
    }

    // 4. Rotate Yaw ring
    if (showRotate && start) {
      const radius = size * 0.92
      const pts: string[] = []
      let allValid = true
      for (let step = 0; step <= RING_SEGMENTS; step += 1) {
        const angle = (step / RING_SEGMENTS) * Math.PI * 2
        const worldPt = Cartesian3.add(
          center,
          Cartesian3.add(
            Cartesian3.multiplyByScalar(axes[0]!, Math.cos(angle) * radius, new Cartesian3()),
            Cartesian3.multiplyByScalar(axes[1]!, Math.sin(angle) * radius, new Cartesian3()),
            new Cartesian3(),
          ),
          new Cartesian3(),
        )
        const screenPt = SceneTransforms.worldToWindowCoordinates(viewer.scene, worldPt)
        if (!screenPt) { allValid = false; break }
        pts.push(`${screenPt.x},${screenPt.y}`)
      }
      rotateGroup.style.display = allValid ? '' : 'none'
      if (allValid) {
        const joined = pts.join(' ')
        rotateRing.setAttribute('points', joined)
        rotateRingHit.setAttribute('points', joined)
        const rad = (-headingDelta * Math.PI) / 180
        const tipWorld = Cartesian3.add(
          center,
          Cartesian3.add(
            Cartesian3.multiplyByScalar(axes[0]!, Math.cos(rad) * radius, new Cartesian3()),
            Cartesian3.multiplyByScalar(axes[1]!, Math.sin(rad) * radius, new Cartesian3()),
            new Cartesian3(),
          ),
          new Cartesian3(),
        )
        const tipScreen = SceneTransforms.worldToWindowCoordinates(viewer.scene, tipWorld)
        if (tipScreen) {
          rotateRay.setAttribute('x1', String(start.x))
          rotateRay.setAttribute('y1', String(start.y))
          rotateRay.setAttribute('x2', String(tipScreen.x))
          rotateRay.setAttribute('y2', String(tipScreen.y))
          rotateLabel.setAttribute('x', String(tipScreen.x + 8))
          rotateLabel.setAttribute('y', String(tipScreen.y - 6))
        }
      }
    }

    applyHighlightStyles()
    updateReadout()
  }

  const release = () => {
    const finished = drag
    if (drag) viewer.scene.screenSpaceCameraController.enableInputs = inputs
    drag = undefined
    pointerScreen = null
    snapHint = ''
    applyHighlightStyles()
    updateReadout()
    if (finished?.moved) {
      options.onCommit?.({
        offset: Cartesian3.clone(offset),
        headingDelta,
        scale,
      })
    }
  }

  const rayAt = (event: PointerEvent) => {
    const bounds = viewer.canvas.getBoundingClientRect()
    pointerScreen = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    return viewer.camera.getPickRay(new Cartesian2(pointerScreen.x, pointerScreen.y))
  }

  function startAxisDrag(axis: AxisIndex, target: Element, event: PointerEvent): void {
    if (!enabled) return
    const ray = rayAt(event)
    if (!ray) return
    const centerAtStart = currentCenter()
    const start = axisDistance(ray.origin, ray.direction, centerAtStart, axes[axis]!)
    if (start === undefined) return
    event.preventDefault()
    event.stopPropagation()
    inputs = viewer.scene.screenSpaceCameraController.enableInputs
    if (mode === 'scale') {
      drag = { kind: 'scale', axis, startScreenX: event.clientX, startScale: scale, startDist: start, originAtStart: centerAtStart, moved: false }
    } else {
      drag = { kind: 'axis', axis, start, offset: Cartesian3.clone(offset), originAtStart: centerAtStart, moved: false }
    }
    viewer.scene.screenSpaceCameraController.enableInputs = false
    target.setPointerCapture(event.pointerId)
    applyHighlightStyles()
    updateReadout()
  }

  handles.forEach((h, i) => {
    const axis = i as AxisIndex
    for (const el of [h.hit, h.tipHit]) {
      el.addEventListener('pointerenter', () => { hovered = { kind: 'axis', index: axis }; applyHighlightStyles() })
      el.addEventListener('pointerleave', () => { if (hovered?.kind === 'axis' && hovered.index === axis) hovered = null; applyHighlightStyles() })
      el.addEventListener('pointerdown', event => startAxisDrag(axis, el, event as PointerEvent))
    }
  })

  planeHandles.forEach(p => {
    p.poly.addEventListener('pointerenter', () => { hovered = { kind: 'plane', id: p.def.id }; applyHighlightStyles() })
    p.poly.addEventListener('pointerleave', () => { if (hovered?.kind === 'plane' && hovered.id === p.def.id) hovered = null; applyHighlightStyles() })
    p.poly.addEventListener('pointerdown', event => {
      if (!enabled || mode !== 'translate') return
      const ray = rayAt(event)
      if (!ray) return
      const centerAtStart = currentCenter()
      const hit = planeIntersection(ray.origin, ray.direction, centerAtStart, axes[p.def.normalAxis]!, axes[p.def.a]!, axes[p.def.b]!)
      if (!hit) return
      event.preventDefault()
      event.stopPropagation()
      inputs = viewer.scene.screenSpaceCameraController.enableInputs
      drag = { kind: 'plane', def: p.def, startA: hit[0], startB: hit[1], offset: Cartesian3.clone(offset), originAtStart: centerAtStart, moved: false }
      viewer.scene.screenSpaceCameraController.enableInputs = false
      p.poly.setPointerCapture(event.pointerId)
      applyHighlightStyles()
      updateReadout()
    })
  })

  rotateRingHit.addEventListener('pointerenter', () => { hovered = { kind: 'rotate' }; applyHighlightStyles() })
  rotateRingHit.addEventListener('pointerleave', () => { if (hovered?.kind === 'rotate') hovered = null; applyHighlightStyles() })
  rotateRingHit.addEventListener('pointerdown', event => {
    if (!enabled || mode !== 'rotate' || constrained) return
    const ray = rayAt(event)
    if (!ray) return
    const centerAtStart = currentCenter()
    const hit = planeIntersection(ray.origin, ray.direction, centerAtStart, axes[2]!, axes[0]!, axes[1]!)
    if (!hit) return
    event.preventDefault()
    event.stopPropagation()
    inputs = viewer.scene.screenSpaceCameraController.enableInputs
    drag = { kind: 'rotate', startAngleRad: Math.atan2(hit[1], hit[0]), startHeading: headingDelta, originAtStart: centerAtStart, moved: false }
    viewer.scene.screenSpaceCameraController.enableInputs = false
    rotateRingHit.setPointerCapture(event.pointerId)
    applyHighlightStyles()
    updateReadout()
  })

  originDot.addEventListener('pointerenter', () => { if (mode === 'scale') { hovered = { kind: 'uniform-scale' }; applyHighlightStyles() } })
  originDot.addEventListener('pointerleave', () => { if (hovered?.kind === 'uniform-scale') { hovered = null; applyHighlightStyles() } })
  originDot.addEventListener('pointerdown', event => {
    if (!enabled || mode !== 'scale' || constrained) return
    event.preventDefault()
    event.stopPropagation()
    rayAt(event)
    inputs = viewer.scene.screenSpaceCameraController.enableInputs
    drag = { kind: 'scale', startScreenX: event.clientX, startScale: scale, originAtStart: currentCenter(), moved: false }
    viewer.scene.screenSpaceCameraController.enableInputs = false
    originDot.setPointerCapture(event.pointerId)
    applyHighlightStyles()
    updateReadout()
  })

  const snap = (value: number, shift: boolean) => (shift ? Math.round(value * 10) / 10 : value)

  const move = (event: PointerEvent) => {
    if (!drag) return
    const ray = rayAt(event)
    if (!ray) return
    const keys = ['x', 'y', 'z'] as const
    if (drag.kind === 'axis') {
      const distance = axisDistance(ray.origin, ray.direction, drag.originAtStart, axes[drag.axis]!)
      if (distance === undefined) return
      Cartesian3.clone(drag.offset, offset)
      const key = keys[drag.axis]!
      offset[key] = options.onMoveWithShift ? offset[key] + (distance - drag.start) : snap(offset[key] + (distance - drag.start), event.shiftKey)
      drag.moved = true
      if (options.onMoveWithShift) options.onMoveWithShift(Cartesian3.clone(offset), event.shiftKey)
      else onMove(Cartesian3.clone(offset))
    } else if (drag.kind === 'plane') {
      const hit = planeIntersection(ray.origin, ray.direction, drag.originAtStart, axes[drag.def.normalAxis]!, axes[drag.def.a]!, axes[drag.def.b]!)
      if (!hit) return
      Cartesian3.clone(drag.offset, offset)
      const keyA = keys[drag.def.a]!
      const keyB = keys[drag.def.b]!
      offset[keyA] = options.onMoveWithShift ? offset[keyA] + (hit[0] - drag.startA) : snap(offset[keyA] + (hit[0] - drag.startA), event.shiftKey)
      offset[keyB] = options.onMoveWithShift ? offset[keyB] + (hit[1] - drag.startB) : snap(offset[keyB] + (hit[1] - drag.startB), event.shiftKey)
      drag.moved = true
      if (options.onMoveWithShift) options.onMoveWithShift(Cartesian3.clone(offset), event.shiftKey)
      else onMove(Cartesian3.clone(offset))
    } else if (drag.kind === 'rotate') {
      const hit = planeIntersection(ray.origin, ray.direction, drag.originAtStart, axes[2]!, axes[0]!, axes[1]!)
      if (!hit) return
      const currentAngleRad = Math.atan2(hit[1], hit[0])
      let deltaDeg = ((drag.startAngleRad - currentAngleRad) * 180) / Math.PI
      if (deltaDeg > 180) deltaDeg -= 360
      if (deltaDeg < -180) deltaDeg += 360
      headingDelta = drag.startHeading + deltaDeg
      drag.moved = true
      options.onRotate?.(headingDelta, event.shiftKey)
    } else if (drag.kind === 'scale') {
      let factor = drag.startScale
      if (drag.axis !== undefined && drag.startDist !== undefined) {
        const dist = axisDistance(ray.origin, ray.direction, drag.originAtStart, axes[drag.axis]!)
        if (dist !== undefined) factor = drag.startScale + (dist - drag.startDist) * 0.35
      } else {
        factor = drag.startScale + (event.clientX - drag.startScreenX) * 0.008
      }
      scale = Math.max(0.25, Math.min(4, factor))
      drag.moved = true
      options.onScale?.(scale, event.shiftKey)
    }
    render()
    viewer.scene.requestRender()
  }

  const key = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      onCancel()
    }
  }

  render()
  const tick = viewer.scene.preRender.addEventListener(render)
  window.addEventListener('keydown', key, true)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', release)
  window.addEventListener('pointercancel', release)

  return {
    setEnabled(next: boolean) {
      enabled = next
      if (!enabled) release()
      handles.forEach(h => {
        h.hit.style.pointerEvents = enabled ? 'stroke' : 'none'
        h.tipHit.style.pointerEvents = enabled ? 'all' : 'none'
      })
      planeHandles.forEach(p => { p.poly.style.pointerEvents = enabled ? 'all' : 'none' })
      rotateRingHit.style.pointerEvents = enabled ? 'stroke' : 'none'
      originDot.style.pointerEvents = enabled ? 'all' : 'none'
    },
    setMode(next: GizmoTransformMode) {
      mode = constrained ? 'translate' : next
      render()
      viewer.scene.requestRender()
    },
    setOffset(value: Cartesian3) {
      Cartesian3.clone(value, offset)
      render()
    },
    setRotation(nextHeadingDelta: number) {
      headingDelta = nextHeadingDelta
      render()
    },
    setScale(nextScale: number) {
      scale = Math.max(0.25, Math.min(4, nextScale))
      render()
    },
    setSnapHint(hint: string) {
      snapHint = hint
      updateReadout()
    },
    dispose() {
      drag = undefined
      viewer.scene.screenSpaceCameraController.enableInputs = inputs
      tick()
      svg.remove()
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      viewer.scene.requestRender()
    },
  }
}
