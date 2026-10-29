// @env browser
import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import type { ShallowRef } from 'vue'
import type { EngineFactory, EngineHandle } from '../types/engine'

export function useEngine<T extends EngineHandle>(container: Readonly<ShallowRef<HTMLDivElement | null>>, create: EngineFactory<T>) {
  const ready = shallowRef(false)
  const error = shallowRef('')
  let handle: T | undefined
  let disposed = false

  onMounted(async () => {
    if (!container.value) return
    try {
      const instance = await create(container.value)
      // An asynchronous map load can finish after the user has left the page.
      if (disposed) {
        instance.dispose()
        return
      }
      handle = instance
      ready.value = true
    }
    catch (cause) {
      if (!disposed) error.value = cause instanceof Error ? cause.message : String(cause)
    }
  })

  onBeforeUnmount(() => {
    disposed = true
    handle?.dispose()
    handle = undefined
  })

  function resetView(): void {
    handle?.resetView()
  }

  function getHandle(): T | undefined {
    return handle
  }

  return { ready, error, resetView, getHandle }
}
