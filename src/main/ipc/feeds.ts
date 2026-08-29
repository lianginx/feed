import { ipcMain } from 'electron'
import { getMainWindow } from '@main/app/window'
import { createAddFeedWindow, closeAddFeedWindow, getAddFeedWindow } from '@main/app/addFeedWindow'
import { getConnection, toSafeNumber } from '@main/database/connection'
import { withTransaction } from '@main/database/transaction'
import { toFriendlyFeedError } from '@main/services/rss'
import { refreshFeedFavicon } from '@main/services/favicon'
import { refreshSingleFeed } from '@main/services/refresher'
import { getAdapter, listAdapters, resolveAdapterSiteUrl } from '@main/services/routes'
import { scheduleSync } from '@main/services/sync'
import type { FeedAdapter } from '@main/services/routes/core/types'
import { canonicalAdapterParams } from '@shared/lib/adapterParams'
import { success, error } from './util'

function sendAddResult(data: { success: boolean; error?: string }) {
  const win = getAddFeedWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('feeds:add-result', data)
  }
}

function notifyFeedAdded(feedId: number) {
  getMainWindow()?.webContents.send('feeds:changed', { feedId })
  closeAddFeedWindow()
}

/** 适配器订阅的存储 URL：buildUrl 之外追加非空参数片段，保证不同参数（如热榜周期）URL 唯一 */
function adapterStorageUrl(adapter: FeedAdapter, params: Record<string, string>): string {
  const entries = Object.keys(params)
    .filter((key) => (params[key] ?? '').trim() !== '')
    .sort()
    .map((key) => `${key}=${encodeURIComponent(params[key])}`)
  const base = adapter.buildUrl(params)
  return entries.length ? `${base}#${entries.join('&')}` : base
}

/** 同适配器下是否已存在参数完全一致的订阅（与存储 URL 的新旧格式无关） */
function hasSameAdapterFeed(
  db: ReturnType<typeof getConnection>,
  adapterId: string,
  params: Record<string, string>
): boolean {
  const canonical = canonicalAdapterParams(params)
  const rows = db
    .prepare('SELECT adapter_params FROM feeds WHERE adapter_id = ?')
    .all(adapterId) as { adapter_params: string | null }[]
  return rows.some((row) => {
    try {
      return canonicalAdapterParams(JSON.parse(row.adapter_params ?? '{}')) === canonical
    } catch {
      return false
    }
  })
}

async function addRss(params: { url: string; title?: string; categoryId?: number }) {
  try {
    const db = getConnection()
    const existing = db.prepare('SELECT id FROM feeds WHERE url = ?').get(params.url)
    if (existing) {
      sendAddResult({ success: false, error: '该订阅源已存在' })
      return
    }
    const customTitle = params.title?.trim() ? 1 : 0
    const title = params.title?.trim() || params.url
    const feedId = toSafeNumber(
      db
        .prepare('INSERT INTO feeds (url, title, custom_title, category_id) VALUES (?, ?, ?, ?)')
        .run(params.url, title, customTitle, params.categoryId || null).lastInsertRowid
    )

    void refreshSingleFeed(feedId)
    scheduleSync()
    notifyFeedAdded(feedId)
  } catch (e) {
    sendAddResult({ success: false, error: toFriendlyFeedError(e) })
  }
}

async function addAdapterSource(input: {
  adapterId: string
  params: Record<string, string>
  title?: string
  categoryId?: number
}) {
  try {
    const adapter = getAdapter(input.adapterId)
    if (!adapter) {
      sendAddResult({ success: false, error: '适配器不存在' })
      return
    }
    for (const p of adapter.params) {
      if (p.required && !(input.params[p.key] ?? '').trim()) {
        sendAddResult({ success: false, error: `请填写「${p.label}」` })
        return
      }
    }

    const db = getConnection()
    // 判重按「适配器 + 参数」而非 URL：参数可能不在 URL 上（如掘金热榜的周期在 POST body）
    if (hasSameAdapterFeed(db, adapter.id, input.params)) {
      sendAddResult({ success: false, error: '该订阅源已存在' })
      return
    }
    const url = adapterStorageUrl(adapter, input.params)
    const customTitle = input.title?.trim() ? 1 : 0
    // 初始标题用适配器名兜底：首刷成功后会被 parsed title 覆盖，失败时也不至于露出原始 URL
    const title = input.title?.trim() || adapter.name
    // site_url 用适配器声明的站点首页：首刷失败时侧边栏「打开站点」也不会落到抓取用的 API 地址
    const siteUrl = resolveAdapterSiteUrl(adapter, input.params) ?? null
    const feedId = toSafeNumber(
      db
        .prepare(
          `INSERT INTO feeds (url, title, custom_title, category_id, site_url, adapter_id, adapter_params)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          url,
          title,
          customTitle,
          input.categoryId || null,
          siteUrl,
          adapter.id,
          JSON.stringify(input.params)
        ).lastInsertRowid
    )

    void refreshSingleFeed(feedId)
    scheduleSync()
    notifyFeedAdded(feedId)
  } catch (e) {
    sendAddResult({ success: false, error: toFriendlyFeedError(e) })
  }
}

export function registerFeedHandlers() {
  ipcMain.handle('feeds:list', async () => {
    try {
      const db = getConnection()
      const feeds = db
        .prepare(
          `
        SELECT f.*, c.name as category_name,
          (SELECT COUNT(*) FROM articles WHERE feed_id = f.id AND is_read = 0) as unread_count
        FROM feeds f
        LEFT JOIN categories c ON f.category_id = c.id
        ORDER BY f.sort_order ASC, f.id ASC
      `
        )
        .all()
      return success(feeds)
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle(
    'feeds:add',
    (_event, params: { url: string; title?: string; categoryId?: number }) => {
      addRss(params)
      return success(true)
    }
  )

  ipcMain.handle('feeds:listAdapters', async () => {
    try {
      const db = getConnection()
      // 已添加的参数组合按 adapter_id 分组带返，渲染层据此做添加前的前置校验
      const rows = db
        .prepare('SELECT adapter_id, adapter_params FROM feeds WHERE adapter_id IS NOT NULL')
        .all() as { adapter_id: string; adapter_params: string | null }[]
      const addedByAdapter = new Map<string, Record<string, string>[]>()
      for (const row of rows) {
        try {
          const list = addedByAdapter.get(row.adapter_id) ?? []
          list.push(JSON.parse(row.adapter_params ?? '{}'))
          addedByAdapter.set(row.adapter_id, list)
        } catch {
          // 参数 JSON 损坏的行不参与前置校验
        }
      }
      const adapters = listAdapters().map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        domains: a.domains,
        params: a.params,
        needsBrowser: a.needsBrowser ?? false,
        cookieDomain: a.cookieDomain,
        loginUrl: a.loginUrl,
        loginCookieNames: a.loginCookieNames,
        addedParams: addedByAdapter.get(a.id) ?? []
      }))
      return success(adapters)
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle(
    'feeds:addAdapter',
    (
      _event,
      input: {
        adapterId: string
        params: Record<string, string>
        title?: string
        categoryId?: number
      }
    ) => {
      addAdapterSource(input)
      return success(true)
    }
  )

  ipcMain.handle(
    'feeds:update',
    async (
      _event,
      id: number,
      data: { title?: string; url?: string; categoryId?: number | null; customTitle?: number }
    ) => {
      try {
        const db = getConnection()
        const fields: string[] = []
        const values: (string | number | null)[] = []

        if (data.title !== undefined) {
          fields.push('title = ?')
          values.push(data.title)
        }
        if (data.url !== undefined) {
          fields.push('url = ?')
          values.push(data.url)
        }
        if (data.categoryId !== undefined) {
          fields.push('category_id = ?')
          values.push(data.categoryId)
        }
        if (data.customTitle !== undefined) {
          fields.push('custom_title = ?')
          values.push(data.customTitle)
        }

        if (fields.length === 0) return success({ id })

        values.push(id)
        db.prepare(`UPDATE feeds SET ${fields.join(', ')} WHERE id = ?`).run(...values)
        scheduleSync()
        return success({ id })
      } catch (e) {
        return error((e as Error).message)
      }
    }
  )

  ipcMain.handle('feeds:delete', async (_event, id: number) => {
    try {
      const db = getConnection()
      withTransaction(db, () => {
        db.prepare('DELETE FROM articles WHERE feed_id = ?').run(id)
        db.prepare('DELETE FROM feeds WHERE id = ?').run(id)
      })
      scheduleSync()
      return success({ id })
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle(
    'feeds:updateSortOrder',
    async (_event, feeds: { id: number; sort_order: number }[]) => {
      try {
        const db = getConnection()
        withTransaction(db, () => {
          const stmt = db.prepare('UPDATE feeds SET sort_order = ? WHERE id = ?')
          for (const feed of feeds) {
            stmt.run(feed.sort_order, feed.id)
          }
        })
        scheduleSync()
        return success({ updated: feeds.length })
      } catch (e) {
        return error((e as Error).message)
      }
    }
  )

  ipcMain.handle('feeds:refreshFavicon', async (_event, id: number) => {
    try {
      const faviconUrl = await refreshFeedFavicon(id)
      return success({ id, favicon_url: faviconUrl })
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('feeds:refresh', (_event, feedId: number) => {
    refreshSingleFeed(feedId)
    return success(true)
  })

  ipcMain.handle('feeds:openAddFeedWindow', async () => {
    createAddFeedWindow()
    return success(true)
  })
}
