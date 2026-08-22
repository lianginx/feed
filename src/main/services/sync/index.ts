import { BrowserWindow } from 'electron'
import store, { getSettings } from '@main/config'
import { getConnection } from '@main/database/connection'
import { applySnapshot } from './apply'
import { decideSync } from './decide'
import { parseSnapshot, serializeSnapshot } from './snapshot'
import { createSyncProvider } from './providers'

export type { SyncFeed, SyncSnapshot } from './snapshot'
export type { SyncAction } from './decide'

export type SyncResult =
  | { status: 'disabled' }
  | { status: 'noop' }
  | { status: 'pushed' }
  | { status: 'pulled' }
  | { status: 'conflict' }
  | { status: 'error'; error: string }

const AUTO_SYNC_DEBOUNCE_MS = 1500

let syncing = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function getLastDump(): string | null {
  return store.get('syncLastDump') ?? null
}

function setLastDump(dump: string): void {
  store.set('syncLastDump', dump)
}

export function getLastSyncedAt(): number | null {
  return store.get('syncLastSyncedAt') ?? null
}

function setLastSyncedAt(time: number): void {
  store.set('syncLastSyncedAt', time)
}

function isLocalEmpty(): boolean {
  const db = getConnection()
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM feeds').get() as unknown as {
    count: number
  }
  return count === 0
}

function notifyRenderer(result: SyncResult): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('sync:status', result)
    }
  }
}

export async function runSync(): Promise<SyncResult> {
  if (syncing) return { status: 'noop' }
  const settings = getSettings()
  if (settings.sync.provider === 'none') return { status: 'disabled' }

  const provider = createSyncProvider(settings.sync)
  if (!provider) return { status: 'disabled' }

  syncing = true
  try {
    const local = serializeSnapshot(getConnection())
    const remote = await provider.pull()

    let result: SyncResult
    const action = decideSync(local, remote, getLastDump(), isLocalEmpty())
    switch (action.type) {
      case 'noop':
        // 无传输；顺带把 last 对齐到本机当前状态（覆盖 remote===local 但 last 落后的窗口）
        setLastDump(local)
        setLastSyncedAt(Date.now())
        result = { status: 'noop' }
        break
      case 'push':
        await provider.push(local)
        setLastDump(local)
        setLastSyncedAt(Date.now())
        result = { status: 'pushed' }
        break
      case 'pull':
        applySnapshot(getConnection(), parseSnapshot(action.remote))
        // last 记录「应用后本机实际状态」的序列化结果，吸收格式演进等一次性漂移
        setLastDump(serializeSnapshot(getConnection()))
        setLastSyncedAt(Date.now())
        result = { status: 'pulled' }
        break
      case 'conflict':
        result = { status: 'conflict' }
        break
    }

    notifyRenderer(result)
    return result
  } catch (e) {
    const result: SyncResult = { status: 'error', error: (e as Error).message }
    notifyRenderer(result)
    return result
  } finally {
    syncing = false
  }
}

export async function resolveConflict(choice: 'local' | 'remote'): Promise<SyncResult> {
  if (syncing) return { status: 'noop' }
  const settings = getSettings()
  if (settings.sync.provider === 'none') return { status: 'disabled' }

  const provider = createSyncProvider(settings.sync)
  if (!provider) return { status: 'disabled' }

  syncing = true
  try {
    let result: SyncResult
    if (choice === 'local') {
      const local = serializeSnapshot(getConnection())
      await provider.push(local)
      setLastDump(local)
      setLastSyncedAt(Date.now())
      result = { status: 'pushed' }
    } else {
      const remote = await provider.pull()
      if (remote === null) {
        result = { status: 'error', error: '远端数据不存在，请稍后重试' }
      } else {
        applySnapshot(getConnection(), parseSnapshot(remote))
        setLastDump(serializeSnapshot(getConnection()))
        setLastSyncedAt(Date.now())
        result = { status: 'pulled' }
      }
    }

    notifyRenderer(result)
    return result
  } catch (e) {
    const result: SyncResult = { status: 'error', error: (e as Error).message }
    notifyRenderer(result)
    return result
  } finally {
    syncing = false
  }
}

export function scheduleSync(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    if (syncing) {
      scheduleSync()
      return
    }
    void runSync()
  }, AUTO_SYNC_DEBOUNCE_MS)
}
