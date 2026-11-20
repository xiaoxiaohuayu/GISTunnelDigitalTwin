import { Cartesian3, Color, ConstantPositionProperty, Matrix3, Matrix4, Quaternion } from 'cesium'
import type { Entity, Viewer } from 'cesium'
import { DeviceInstance } from './deviceInstance'
import { positionGizmo } from './positionGizmo'
import { openSceneSettings } from './portalSignConfig'

interface PortalGroup {
  frame: Matrix4
  gizmoFrame: Matrix4
  boxSize: [number, number, number]
  move: (p: Cartesian3) => void
  offset: Cartesian3
}

const groups = new WeakMap<Viewer, Map<string, PortalGroup>>()
const highlightEntities = new WeakMap<Viewer, Entity>()

function buildGizmoFrame(frame: Matrix4, center?: Cartesian3): Matrix4 {
  const result = Matrix4.clone(frame, new Matrix4())
  if (center) Matrix4.setTranslation(result, center, result)
  return result
}

export function highlightPortalGroup(viewer: Viewer, id: string | null): void {
  if (viewer.isDestroyed()) return
  let entity = highlightEntities.get(viewer)
  if (!id) {
    if (entity) {
      entity.show = false
      viewer.scene.requestRender()
    }
    return
  }
  const group = groups.get(viewer)?.get(id)
  if (!group) {
    if (entity) entity.show = false
    return
  }
  const selectionColor = Color.fromCssColorString('#ffe63b')
  if (!entity || !viewer.entities.contains(entity)) {
    entity = viewer.entities.add({
      id: 'portal-selection-box',
      show: false,
      box: {
        dimensions: new Cartesian3(1.2, 1.2, 1.2),
        fill: true,
        material: selectionColor.withAlpha(0.11),
        outline: true,
        outlineColor: selectionColor,
        outlineWidth: 2,
      },
    })
    highlightEntities.set(viewer, entity)
  }
  const pos = Matrix4.multiplyByPoint(
    group.gizmoFrame,
    new Cartesian3(group.offset.x, -group.offset.y, group.offset.z),
    new Cartesian3(),
  )
  const rot = Quaternion.fromRotationMatrix(Matrix4.getMatrix3(group.gizmoFrame, new Matrix3()))
  const [dx, dy, dz] = group.boxSize
  entity.position = new ConstantPositionProperty(pos)
  entity.orientation = new ConstantPositionProperty(rot) as unknown as Entity['orientation']
  if (entity.box) {
    entity.box.dimensions = new ConstantPositionProperty(new Cartesian3(dx, dy, dz)) as unknown as NonNullable<Entity['box']>['dimensions']
  }
  entity.show = true
  viewer.scene.requestRender()
}

export async function portalPosition(
  viewer: Viewer,
  id: string,
  frame: Matrix4,
  entities: Entity[],
  primitives: any[],
  visual?: { center?: Cartesian3; boxSize?: [number, number, number] },
) {
  const instance = new DeviceInstance({ id, kind: 'vms', tube: 0, station: 0, lateral: 0, height: 0 }, frame, viewer)
  entities.forEach(e => instance.addEntity(e))
  for (const primitive of primitives) {
    const base = Matrix4.clone(primitive.modelMatrix)
    instance.addTransform(delta => { primitive.modelMatrix = Matrix4.multiply(delta, base, new Matrix4()) })
  }
  const gizmoFrame = buildGizmoFrame(frame, visual?.center)
  const boxSize: [number, number, number] = visual?.boxSize ?? [1.2, 4.0, 2.4]
  const group: PortalGroup = {
    frame,
    gizmoFrame,
    boxSize,
    offset: new Cartesian3(),
    move(p: Cartesian3) {
      instance.move(Matrix4.multiplyByTranslation(frame, new Cartesian3(p.x, -p.y, p.z), new Matrix4()))
    },
  }
  const db = await openSceneSettings()
  try {
    const value = await new Promise<any>((resolve, reject) => {
      const r = db.transaction('settings').objectStore('settings').get(`portal-position:${id}`)
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    if (value && [value.x, value.y, value.z].every(Number.isFinite)) {
      group.offset = new Cartesian3(value.x, value.y, value.z)
      group.move(group.offset)
    }
  } finally {
    db.close()
  }
  const map = groups.get(viewer) ?? new Map<string, PortalGroup>()
  map.set(id, group)
  groups.set(viewer, map)
}

export function editPortalPosition(viewer: Viewer, id: string) {
  const group = groups.get(viewer)?.get(id)
  if (!group) return
  viewer.container.querySelector<HTMLButtonElement>('.portal-position-editor .cancel')?.click()
  highlightPortalGroup(viewer, null)

  const panel = document.createElement('aside')
  panel.className = 'portal-position-editor'
  Object.assign(panel.style, {
    position: 'absolute',
    right: '24px',
    top: '86px',
    width: '286px',
    padding: '18px 20px',
    background: 'linear-gradient(165deg, rgba(12, 24, 52, 0.88), rgba(7, 14, 32, 0.94))',
    backdropFilter: 'blur(20px) saturate(150%)',
    color: '#edf4ff',
    zIndex: '30',
    border: '1px solid rgba(120, 186, 255, 0.34)',
    borderRadius: '14px',
    boxShadow: '0 20px 50px rgba(2, 7, 20, 0.62)',
    fontSize: '12px',
  })

  const title = document.createElement('h3')
  title.textContent = id.startsWith('traffic:') ? '调整洞口交通标志位置' : '调整入口标牌位置'
  Object.assign(title.style, { margin: '0 0 6px', fontSize: '15px', fontWeight: '600', color: '#f0f7ff' })
  const hint = document.createElement('p')
  hint.textContent = '拖动红/绿/蓝坐标轴或中心三平面手柄，按住 Shift 可 0.1 m 吸附。'
  Object.assign(hint.style, { margin: '0 0 14px', fontSize: '11px', lineHeight: '1.6', color: '#a9c0df' })
  panel.append(title, hint)

  let draft = Cartesian3.clone(group.offset)
  let busy = false

  const inputs = (['x', 'y', 'z'] as const).map((key, i) => {
    const label = document.createElement('label')
    Object.assign(label.style, { display: 'grid', gridTemplateColumns: '1fr 120px', alignItems: 'center', gap: '8px', margin: '10px 0', color: '#c8daf2' })
    const caption = document.createElement('span')
    caption.textContent = `${['X 沿线路', 'Y 横向', 'Z 高度'][i]}（m）`
    const input = document.createElement('input')
    input.type = 'number'
    input.step = '0.1'
    input.value = String(Number(draft[key].toFixed(3)))
    Object.assign(input.style, {
      width: '100%',
      padding: '6px 8px',
      borderRadius: '6px',
      border: '1px solid rgba(120, 178, 245, 0.28)',
      background: 'rgba(9, 18, 39, 0.84)',
      color: '#edf4ff',
      fontSize: '12px',
    })
    input.oninput = () => {
      if (busy) return
      const v = Number(input.value)
      if (!Number.isFinite(v)) return
      draft[key] = v
      group.move(draft)
      gizmo.setOffset(draft)
    }
    label.append(caption, input)
    panel.append(label)
    return input
  })

  const message = document.createElement('p')
  Object.assign(message.style, { margin: '8px 0 0', fontSize: '11px', color: '#ffb7a1' })
  const actions = document.createElement('div')
  Object.assign(actions.style, { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' })
  const cancel = document.createElement('button')
  const save = document.createElement('button')
  cancel.className = 'cancel'
  cancel.textContent = '取消'
  save.textContent = '保存位置'
  Object.assign(cancel.style, { padding: '7px 14px', borderRadius: '8px', border: '1px solid rgba(122, 178, 245, 0.26)', background: 'rgba(18, 34, 68, 0.72)', color: '#dcecff', cursor: 'pointer' })
  Object.assign(save.style, { padding: '7px 14px', borderRadius: '8px', border: '1px solid rgba(132, 204, 255, 0.72)', background: 'linear-gradient(135deg, #2e7ed6, #4a98ee)', color: '#fff', fontWeight: '500', cursor: 'pointer' })
  actions.append(cancel, save)
  panel.append(message, actions)

  const close = () => {
    gizmo.dispose()
    panel.remove()
  }
  cancel.onclick = () => {
    if (busy) return
    group.move(group.offset)
    close()
  }
  const gizmo = positionGizmo(
    viewer,
    group.gizmoFrame,
    false,
    p => {
      draft = p
      inputs.forEach((input, i) => { input.value = String(Number([p.x, p.y, p.z][i]!.toFixed(3))) })
      group.move(p)
    },
    () => cancel.click(),
    group.boxSize,
  )
  gizmo.setOffset(draft)

  save.onclick = async () => {
    busy = true
    save.disabled = true
    cancel.disabled = true
    gizmo.setEnabled(false)
    try {
      const db = await openSceneSettings()
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('settings', 'readwrite')
          tx.objectStore('settings').put({ x: draft.x, y: draft.y, z: draft.z }, `portal-position:${id}`)
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
          tx.onabort = () => reject(tx.error)
        })
      } finally {
        db.close()
      }
      group.offset = Cartesian3.clone(draft)
      close()
    } catch (error) {
      message.textContent = String(error)
    } finally {
      busy = false
      save.disabled = false
      cancel.disabled = false
      gizmo.setEnabled(true)
    }
  }
  viewer.container.append(panel)
}
