import type { TunnelProject } from './projectConfig.ts'

export type ProjectUpdateKind = 'records' | 'inventory' | 'rebuild'

const structuralKinds = new Set(['street', 'substation', 'signal', 'vms', 'pedestrian', 'vehicle', 'shutter', 'layby'])

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function projectUpdateKind(previous: TunnelProject, next: TunnelProject): ProjectUpdateKind {
  if (!same(previous.section ?? null, next.section ?? null) || !same(previous.passages ?? null, next.passages ?? null)) return 'rebuild'
  const assetKey = (project: TunnelProject) => project.assets.map(asset => [asset.id, asset.kind])
  const sameAssets = same(assetKey(previous), assetKey(next))
  if (same([previous.origin, previous.bores], [next.origin, next.bores]) && sameAssets) return 'records'
  const inventoryChanges = [
    ...previous.assets.filter(asset => !next.assets.some(other => other.id === asset.id && other.kind === asset.kind)),
    ...next.assets.filter(asset => !previous.assets.some(other => other.id === asset.id && other.kind === asset.kind)),
  ]
  const sameOrigin = same(previous.origin, next.origin)
  const sameBoreIds = same(previous.bores.map(bore => bore.id), next.bores.map(bore => bore.id))
  const boresChanged = next.bores.some((bore, index) => !same(bore, previous.bores[index]))
  if ((sameAssets || inventoryChanges.every(asset => !structuralKinds.has(asset.kind))) && sameOrigin && sameBoreIds && (boresChanged || !sameAssets)) return 'inventory'
  return 'rebuild'
}

export interface ProjectApplyHost {
  moveRecords(next: TunnelProject): Promise<void>
  updateInventory(next: TunnelProject): Promise<void>
  rebuild(next: TunnelProject): Promise<void>
  restore(previous: TunnelProject): Promise<void>
}

export async function applyTunnelProject(host: ProjectApplyHost, previous: TunnelProject, next: TunnelProject, recovering = false): Promise<void> {
  const kind = recovering ? 'rebuild' : projectUpdateKind(previous, next)
  try {
    if (kind === 'records') await host.moveRecords(next)
    else if (kind === 'inventory') await host.updateInventory(next)
    else await host.rebuild(next)
  } catch (error) {
    if (recovering) throw error
    try {
      await host.restore(previous)
    } catch (restoreError) {
      const reason = error instanceof Error ? error.message : String(error)
      const second = restoreError instanceof Error ? restoreError.message : String(restoreError)
      throw new Error(`${reason}；恢复上一版配置失败：${second}`)
    }
    throw error
  }
}
