import { ref } from 'vue'
import type { SyncResult } from '../types'

// 模块级共享状态（多个组件共享同一份）
const lastSyncedAt = ref<number | null>(null)
const syncing = ref(false)
const lastResult = ref<SyncResult | null>(null)
const pendingConflict = ref(false)

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useSync() {
  async function runSync(): Promise<SyncResult | null> {
    syncing.value = true
    try {
      const result = await window.api.sync.run()
      if (result.success && result.data) {
        lastResult.value = result.data
        if (result.data.status === 'conflict') {
          pendingConflict.value = true
        }
        return result.data
      }
      return null
    } finally {
      syncing.value = false
    }
  }

  async function resolveConflict(choice: 'local' | 'remote'): Promise<void> {
    const result = await window.api.sync.resolve(choice)
    if (result.success && result.data) {
      lastResult.value = result.data
    }
    pendingConflict.value = false
  }

  async function loadStatus(): Promise<void> {
    const result = await window.api.sync.status()
    if (result.success && result.data) {
      lastSyncedAt.value = result.data.lastSyncedAt
    }
  }

  return {
    lastSyncedAt,
    syncing,
    lastResult,
    pendingConflict,
    runSync,
    resolveConflict,
    loadStatus
  }
}

/**
 * 注册主进程同步状态事件监听（在 App.vue 中调用一次）。
 * 更新共享状态；当从远端拉取数据后调用 onPulled 回调（用于刷新订阅列表）。
 * 返回取消订阅函数。
 */
export function registerSyncListener(onPulled?: () => void): () => void {
  return window.api.sync.onStatus((result) => {
    lastResult.value = result
    if (result.status === 'conflict') {
      pendingConflict.value = true
    } else if (result.status === 'pushed' || result.status === 'pulled') {
      lastSyncedAt.value = Date.now()
    }
    // 远端数据已应用，刷新订阅列表（含新增/删除/排序变化）
    if (result.status === 'pulled') {
      onPulled?.()
    }
  })
}
