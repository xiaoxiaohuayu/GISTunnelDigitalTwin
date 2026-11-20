import type { UserRole } from '../config/runtimeConfig.ts'

export interface RolePermissions {
  canControl: boolean
  canDrill: boolean
  canEditProject: boolean
}

const VALID_ROLES = new Set<UserRole>(['viewer', 'operator', 'admin'])

export function resolveUserRole(defaultRole: UserRole = 'admin', search = ''): UserRole {
  if (search) {
    const param = new URLSearchParams(search).get('role')?.trim() as UserRole | undefined
    if (param && VALID_ROLES.has(param)) return param
  }
  return VALID_ROLES.has(defaultRole) ? defaultRole : 'admin'
}

export function rolePermissions(role: UserRole): RolePermissions {
  if (role === 'viewer') return { canControl: false, canDrill: false, canEditProject: false }
  if (role === 'operator') return { canControl: true, canDrill: true, canEditProject: false }
  return { canControl: true, canDrill: true, canEditProject: true }
}

export function roleLabel(role: UserRole): string {
  return { viewer: '只读观察', operator: '调度运维', admin: '系统管理' }[role]
}
