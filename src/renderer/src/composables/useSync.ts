import { ref } from 'vue'
import type { SyncResult } from '@renderer/types'

// 模块级共享状态（多个组件共享同一份）
const lastSyncedAt = ref<number | null>(null)
const syncing = ref(false)
const lastResult = ref<SyncResult | null>(null)
const pendingConflict = ref(false)

export function useSync() {
  async function runSync(): Promise<SyncResult | null> {
    syncing.value = true
    try {
      const result = await window.api.sync.run()
      if (result.success && result.data) {
        applySyncResult(result.data)
        return result.data
      }
      return null
    } finally {
      syncing.value = false
    }
  }

  function applySyncResult(result: SyncResult): void {
    lastResult.value = result
    if (result.status === 'conflict') {
      pendingConflict.value = true
    } else if (result.status === 'pushed' || result.status === 'pulled') {
      lastSyncedAt.value = Date.now()
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
    applySyncResult,
    runSync,
    resolveConflict,
    loadStatus
  }
}
