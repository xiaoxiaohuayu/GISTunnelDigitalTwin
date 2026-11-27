import { computed, ref } from 'vue'

/**
 * 轻量级路由标识：
 * - legacy: 原有隧道数字孪生主视图（保持原逻辑与交互完全不变）
 * - studio: 新版可扩展隧道场景编辑器路由
 */
export type AppRouteName = 'legacy' | 'studio'

export interface RouteRecord {
  name: AppRouteName
  path: string
  title: string
}

export const APP_ROUTES: readonly RouteRecord[] = [
  { name: 'legacy', path: '/', title: '隧道数字孪生' },
  { name: 'studio', path: '/studio', title: '隧道场景编辑器' },
] as const

const STUDIO_PATH_ALIASES = new Set(['/studio', '/scene-editor', '/tunnel-editor'])

function normalizePath(rawPath: string): string {
  const cleaned = rawPath.replace(/\/+$/, '') || '/'
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`
}

/**
 * 同时兼容 History 路径（/studio）与 Hash 路径（#/studio），
 * 确保在开发服务器与静态相对路径部署（base: './'）下均可直接访问。
 */
function resolveRouteFromLocation(): AppRouteName {
  if (typeof window === 'undefined') return 'legacy'

  const hashPath = window.location.hash.replace(/^#/, '')
  if (hashPath) {
    const normalizedHash = normalizePath(hashPath.split('?')[0] ?? '/')
    if (STUDIO_PATH_ALIASES.has(normalizedHash)) return 'studio'
  }

  const normalizedPathname = normalizePath(window.location.pathname)
  if (STUDIO_PATH_ALIASES.has(normalizedPathname)) return 'studio'

  return 'legacy'
}

const currentRouteName = ref<AppRouteName>(resolveRouteFromLocation())
let listenersBound = false

function syncFromBrowser(): void {
  const next = resolveRouteFromLocation()
  currentRouteName.value = next
  const matched = APP_ROUTES.find(route => route.name === next)
  if (matched && typeof document !== 'undefined') {
    document.title = matched.title
  }
}

export function initAppRouter(): void {
  if (listenersBound || typeof window === 'undefined') return
  listenersBound = true
  window.addEventListener('popstate', syncFromBrowser)
  window.addEventListener('hashchange', syncFromBrowser)
  syncFromBrowser()
}

export function navigateTo(routeName: AppRouteName): void {
  if (typeof window === 'undefined') return
  const target = APP_ROUTES.find(route => route.name === routeName) ?? APP_ROUTES[0]!
  currentRouteName.value = target.name
  document.title = target.title

  // 使用 History API 更新路径，保持 URL 简洁可读
  if (window.location.protocol !== 'file:') {
    window.history.pushState({ route: target.name }, '', target.path)
  } else {
    window.location.hash = `#${target.path}`
  }
}

export function useAppRouter() {
  initAppRouter()
  return {
    currentRouteName: computed(() => currentRouteName.value),
    isStudioRoute: computed(() => currentRouteName.value === 'studio'),
    navigateTo,
  }
}
