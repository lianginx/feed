import { onMounted, onUnmounted } from 'vue'
import { useSync } from '@renderer/shared/composables/useSync'
import { useFeeds } from '@renderer/windows/main/composables/useFeeds'

/**
 * 同步相关的主进程事件接入（在 App.vue 中调用一次）：
 * - sync:status：更新同步状态；从远端拉取数据后刷新订阅列表
 */
export function useSyncEvents(): void {
  const { applySyncResult } = useSync()
  const { loadFeeds } = useFeeds()

  let stopStatus: (() => void) | null = null

  onMounted(() => {
    stopStatus = window.api.sync.onStatus((result) => {
      applySyncResult(result)
      // 远端数据已应用，刷新订阅列表（含新增/删除/排序变化）
      if (result.status === 'pulled') {
        void loadFeeds()
      }
    })
  })

  onUnmounted(() => {
    stopStatus?.()
  })
}
