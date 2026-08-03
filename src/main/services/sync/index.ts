import store, { getSettings } from '../../config'
import { getConnection } from '../../database/connection'
import { getMainWindow } from '../../app/window'
import { createSyncProvider } from './providers'

/** 同步快照的 JSON 结构（版本 1） */
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
  category: string | null // 分类名（跨设备用名称关联，而非本地自增 id）
  sortOrder: number
  customTitle: number
}

/** 一次同步的结果 */
export type SyncResult =
  | { status: 'disabled' } // 未配置同步
  | { status: 'noop' } // 本地与远端均无变化
  | { status: 'pushed' } // 已推送本地到远端
  | { status: 'pulled' } // 已从远端拉取到本地
  | { status: 'conflict' } // 本地与远端都有改动，需要用户选择
  | { status: 'error'; error: string }

/** 防抖自动同步的延迟（毫秒） */
const AUTO_SYNC_DEBOUNCE_MS = 1500

let syncing = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// ---------- 同步内部状态（持久化到 electron-store，不暴露给配置 UI） ----------

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

// ---------- 序列化 / 应用快照 ----------

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
}

/** 把当前本地订阅列表序列化为规范化快照字符串 */
function serializeSnapshot(): string {
  const db = getConnection()
  const cats = db
    .prepare('SELECT id, name, sort_order FROM categories ORDER BY sort_order ASC, id ASC')
    .all() as CategoryRow[]
  const catNameById = new Map<number, string>(cats.map((c) => [c.id, c.name]))
  const feeds = db
    .prepare(
      'SELECT url, title, site_url, category_id, sort_order, custom_title FROM feeds ORDER BY sort_order ASC, id ASC'
    )
    .all() as FeedRow[]

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
      customTitle: f.custom_title
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
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM feeds').get() as { count: number }
  return count === 0
}

/**
 * 把远端快照应用到本地数据库。
 * 采用「按 url / 分类名对账」而非清空重插：
 * - 远端新增的订阅/分类 → 插入
 * - 远端修改的元数据（标题/分类/排序/自定义标题）→ 更新，保留本地 id 与已抓取文章
 * - 本地有而远端没有的订阅/分类 → 删除（同步删除操作）
 */
function applySnapshot(snapshot: SyncSnapshot): void {
  const db = getConnection()

  db.transaction(() => {
    // 1. 按名称 upsert 分类，建立 name -> id 映射
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
        catNameToId.set(c.name, r.lastInsertRowid as number)
      }
    }

    // 2. 处理本地订阅：远端不存在的删除，存在的先更新元数据（不含分类，稍后统一处理）
    const localFeeds = db.prepare('SELECT * FROM feeds').all() as (FeedRow & { id: number })[]
    const snapshotByUrl = new Map(snapshot.feeds.map((f) => [f.url, f]))
    for (const local of localFeeds) {
      const target = snapshotByUrl.get(local.url)
      if (!target) {
        // 远端已删除该订阅 → 本地也删除（连带文章）
        db.prepare('DELETE FROM articles WHERE feed_id = ?').run(local.id)
        db.prepare('DELETE FROM feeds WHERE id = ?').run(local.id)
      } else {
        db.prepare(
          'UPDATE feeds SET title = ?, site_url = ?, sort_order = ?, custom_title = ? WHERE id = ?'
        ).run(target.title, target.siteUrl, target.sortOrder, target.customTitle, local.id)
      }
    }

    // 3. 插入远端有而本地没有的订阅
    const localUrlSet = new Set(localFeeds.map((f) => f.url))
    const insertFeed = db.prepare(
      'INSERT INTO feeds (url, title, site_url, category_id, sort_order, custom_title) VALUES (?, ?, ?, ?, ?, ?)'
    )
    for (const f of snapshot.feeds) {
      if (localUrlSet.has(f.url)) continue
      const catId = f.category ? (catNameToId.get(f.category) ?? null) : null
      insertFeed.run(f.url, f.title, f.siteUrl, catId, f.sortOrder, f.customTitle)
    }

    // 4. 更新已有订阅的分类归属（可能有跨设备分类变动）
    const setCategory = db.prepare('UPDATE feeds SET category_id = ? WHERE url = ?')
    for (const f of snapshot.feeds) {
      const catId = f.category ? (catNameToId.get(f.category) ?? null) : null
      setCategory.run(catId, f.url)
    }

    // 5. 删除本地存在但远端快照中没有的分类
    const snapshotCatNames = new Set(snapshot.categories.map((c) => c.name))
    const localCats = db.prepare('SELECT id, name FROM categories').all() as {
      id: number
      name: string
    }[]
    for (const c of localCats) {
      if (!snapshotCatNames.has(c.name)) {
        db.prepare('DELETE FROM categories WHERE id = ?').run(c.id)
      }
    }
  })()
}

// ---------- 通知渲染进程 ----------

function notifyRenderer(result: SyncResult): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('sync:status', result)
  }
}

// ---------- 同步主流程 ----------

/**
 * 执行一次同步（启动 / 定时 / 手动 / 变更防抖 共用）。
 * 策略：整体替换 + 推送前冲突检测（详见设计讨论）。
 */
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
      // 远端不存在（首次同步或远端被清空）→ 推送本地
      await provider.push(local)
      setLastDump(local)
      setLastSyncedAt(Date.now())
      result = { status: 'pushed' }
    } else if (remote === last) {
      // 远端自上次同步后没有变化
      if (local === last) {
        result = { status: 'noop' }
      } else {
        await provider.push(local)
        setLastDump(local)
        setLastSyncedAt(Date.now())
        result = { status: 'pushed' }
      }
    } else {
      // 远端变了
      if (last === null && isLocalEmpty()) {
        // 首次同步 + 本地为空 → 直接采纳远端
        applySnapshot(parseSnapshot(remote))
        setLastDump(remote)
        setLastSyncedAt(Date.now())
        result = { status: 'pulled' }
      } else if (local === last) {
        // 本地没改 → 采纳远端
        applySnapshot(parseSnapshot(remote))
        setLastDump(remote)
        setLastSyncedAt(Date.now())
        result = { status: 'pulled' }
      } else {
        // 本地与远端都有改动 → 冲突，等待用户选择
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

/**
 * 冲突发生后，由用户选择以哪一方为准。
 * - 'local'：以本地为准，推送本地覆盖远端
 * - 'remote'：以远端为准，应用远端到本地
 */
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

/**
 * 订阅源/分类发生变更后，防抖触发一次自动同步。
 * 无论一次性改了多少条，都只会在最后一次变更后短暂延迟触发一次。
 * 若触发时恰有同步正在执行（启动/定时/手动），则延迟到其结束后再触发，
 * 避免本次变更被 runSync 的 syncing 保护静默丢弃。
 */
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
