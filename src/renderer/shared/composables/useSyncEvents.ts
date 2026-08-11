import { onMounted, onUnmounted } from 'vue'
import { useSync } from '@renderer/shared/composables/useSync'
import type { SyncResult } from '@renderer/shared/types'

/**
 * 订阅主进程 sync:status 事件并更新共享同步状态（两个窗口均调用一次）。
 * onStatus 回调供窗口注入专属逻辑（如拉取数据后刷新列表）。
 */
export function useSyncEvents(onStatus?: (result: SyncResult) => void): void {
  const { applySyncResult } = useSync()

  let stopStatus: (() => void) | null = null

  onMounted(() => {
    stopStatus = window.api.sync.onStatus((result) => {
      applySyncResult(result)
      onStatus?.(result)
    })
  })

  onUnmounted(() => {
    stopStatus?.()
  })
}
