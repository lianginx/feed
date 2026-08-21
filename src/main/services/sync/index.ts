import { BrowserWindow } from 'electron'
import store, { getSettings } from '@main/config'
import { getConnection, toSafeNumber } from '@main/database/connection'
import { withTransaction } from '@main/database/transaction'
import { createSyncProvider } from './providers'

export interface SyncSnapshot {
  version: 1
  updatedAt: number
  categories: { name: string; sortOrder: number }[]
  feeds: SyncFeed[]
}

export interface SyncFeed {
  url: string
  title: string
  siteUrl: string | null
  category: string | null
  sortOrder: number
  customTitle: number
  adapterId?: string | null
  adapterParams?: string | null
}

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

function setLastDump(dump: string | null): void {
  if (dump === null) store.delete('syncLastDump')
  else store.set('syncLastDump', dump)
}

export function getLastSyncedAt(): number | null {
  return store.get('syncLastSyncedAt') ?? null
}

function setLastSyncedAt(time: number): void {
  store.set('syncLastSyncedAt', time)
}

interface CategoryRow {
  id: number
  name: string
  sort_order: number
}

interface FeedRow {
  url: string
  title: string
  site_url: string | null
  category_id: number | null
  sort_order: number
  custom_title: number
  adapter_id: string | null
  adapter_params: string | null
}

function serializeSnapshot(): string {
  const db = getConnection()
  const cats = db
    .prepare('SELECT id, name, sort_order FROM categories ORDER BY sort_order ASC, id ASC')
    .all() as unknown as CategoryRow[]
  const catNameById = new Map<number, string>(cats.map((c) => [c.id, c.name]))
  const feeds = db
    .prepare(
      'SELECT url, title, site_url, category_id, sort_order, custom_title, adapter_id, adapter_params FROM feeds ORDER BY sort_order ASC, id ASC'
    )
    .all() as unknown as FeedRow[]

  const snapshot: SyncSnapshot = {
    version: 1,
    updatedAt: Date.now(),
    categories: cats.map((c) => ({ name: c.name, sortOrder: c.sort_order })),
    feeds: feeds.map((f) => ({
      url: f.url,
      title: f.title,
      siteUrl: f.site_url,
      category: f.category_id != null ? (catNameById.get(f.category_id) ?? null) : null,
      sortOrder: f.sort_order,
      customTitle: f.custom_title,
      adapterId: f.adapter_id,
      adapterParams: f.adapter_params
    }))
  }
  return JSON.stringify(snapshot)
}

function parseSnapshot(raw: string): SyncSnapshot {
  const parsed = JSON.parse(raw) as SyncSnapshot
  if (parsed.version !== 1 || !Array.isArray(parsed.categories) || !Array.isArray(parsed.feeds)) {
    throw new Error('同步数据格式不正确')
  }
  return parsed
}

function isLocalEmpty(): boolean {
  const db = getConnection()
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM feeds').get() as unknown as {
    count: number
  }
  return count === 0
}

function applySnapshot(snapshot: SyncSnapshot): void {
  const db = getConnection()
  withTransaction(db, () => {
    const catNameToId = new Map<string, number>()
    for (const c of snapshot.categories) {
      const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(c.name) as
        { id: number } | undefined
      if (existing) {
        db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?').run(
          c.sortOrder,
          existing.id
        )
        catNameToId.set(c.name, existing.id)
      } else {
        const r = db
          .prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)')
          .run(c.name, c.sortOrder)
        catNameToId.set(c.name, toSafeNumber(r.lastInsertRowid))
      }
    }

    const localFeeds = db.prepare('SELECT * FROM feeds').all() as unknown as (FeedRow & {
      id: number
    })[]
    const snapshotByUrl = new Map(snapshot.feeds.map((f) => [f.url, f]))
    for (const local of localFeeds) {
      const target = snapshotByUrl.get(local.url)
      if (!target) {
        db.prepare('DELETE FROM articles WHERE feed_id = ?').run(local.id)
        db.prepare('DELETE FROM feeds WHERE id = ?').run(local.id)
      } else {
        db.prepare(
          'UPDATE feeds SET title = ?, site_url = ?, sort_order = ?, custom_title = ?, adapter_id = ?, adapter_params = ? WHERE id = ?'
        ).run(
          target.title,
          target.siteUrl,
          target.sortOrder,
          target.customTitle,
          target.adapterId !== undefined ? target.adapterId : local.adapter_id,
          target.adapterParams !== undefined ? target.adapterParams : local.adapter_params,
          local.id
        )
      }
    }

    const localUrlSet = new Set(localFeeds.map((f) => f.url))
    const insertFeed = db.prepare(
      'INSERT INTO feeds (url, title, site_url, category_id, sort_order, custom_title, adapter_id, adapter_params) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    for (const f of snapshot.feeds) {
      if (localUrlSet.has(f.url)) continue
      const catId = f.category ? (catNameToId.get(f.category) ?? null) : null
      insertFeed.run(
        f.url,
        f.title,
        f.siteUrl,
        catId,
        f.sortOrder,
        f.customTitle,
        f.adapterId ?? null,
        f.adapterParams ?? null
      )
    }

    const setCategory = db.prepare('UPDATE feeds SET category_id = ? WHERE url = ?')
    for (const f of snapshot.feeds) {
      const catId = f.category ? (catNameToId.get(f.category) ?? null) : null
      setCategory.run(catId, f.url)
    }

    const snapshotCatNames = new Set(snapshot.categories.map((c) => c.name))
    const localCats = db.prepare('SELECT id, name FROM categories').all() as unknown as {
      id: number
      name: string
    }[]
    for (const c of localCats) {
      if (!snapshotCatNames.has(c.name)) {
        db.prepare('DELETE FROM categories WHERE id = ?').run(c.id)
      }
    }
  })
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
    const local = serializeSnapshot()
    const remote = await provider.pull()
    const last = getLastDump()

    let result: SyncResult

    if (remote === null) {
      await provider.push(local)
      setLastDump(local)
      setLastSyncedAt(Date.now())
      result = { status: 'pushed' }
    } else if (remote === last) {
      if (local === last) {
        result = { status: 'noop' }
      } else {
        await provider.push(local)
        setLastDump(local)
        setLastSyncedAt(Date.now())
        result = { status: 'pushed' }
      }
    } else {
      if (last === null && isLocalEmpty()) {
        applySnapshot(parseSnapshot(remote))
        setLastDump(remote)
        setLastSyncedAt(Date.now())
        result = { status: 'pulled' }
      } else if (local === last) {
        applySnapshot(parseSnapshot(remote))
        setLastDump(remote)
        setLastSyncedAt(Date.now())
        result = { status: 'pulled' }
      } else {
        result = { status: 'conflict' }
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
      const local = serializeSnapshot()
      await provider.push(local)
      setLastDump(local)
      setLastSyncedAt(Date.now())
      result = { status: 'pushed' }
    } else {
      const remote = await provider.pull()
      if (remote === null) {
        result = { status: 'error', error: '远端数据不存在，请稍后重试' }
      } else {
        applySnapshot(parseSnapshot(remote))
        setLastDump(remote)
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
