import { ipcMain } from 'electron'
import { getMainWindow } from '@main/app/window'
import { createAddFeedWindow, closeAddFeedWindow } from '@main/app/addFeedWindow'
import { getConnection } from '@main/database/connection'
import { parseFeed, validateFeed, toFriendlyFeedError } from '@main/services/rss'
import { resolveAndCacheFavicon, refreshFeedFavicon } from '@main/services/favicon'
import { refreshSingleFeed, persistParsedFeed } from '@main/services/refresher'
import { getAdapter, listAdapters, runAdapter } from '@main/services/routes'
import { getCookiesForAdapter } from '@main/services/siteCookies'
import { scheduleSync } from '@main/services/sync'
import { success, error } from './util'

export function registerFeedHandlers(): void {
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
    async (_event, params: { url: string; title?: string; categoryId?: number }) => {
      try {
        const validation = await validateFeed(params.url)
        if (!validation.valid) {
          return error(validation.error || '无法解析此订阅源')
        }

        const db = getConnection()
        const title = params.title || validation.title || params.url

        const result = db
          .prepare('INSERT INTO feeds (url, title, category_id) VALUES (?, ?, ?)')
          .run(params.url, title, params.categoryId || null)

        const feedId = result.lastInsertRowid as number

        try {
          const feedData = await parseFeed(params.url)
          const localUrl = await resolveAndCacheFavicon(feedData.link || null, feedData.image?.url)
          if (localUrl) {
            db.prepare('UPDATE feeds SET favicon_url = ? WHERE id = ?').run(localUrl, feedId)
          }
        } catch {
          void 0
        }

        scheduleSync()

        return success({ id: feedId })
      } catch (e) {
        return error((e as Error).message)
      }
    }
  )

  ipcMain.handle('feeds:listAdapters', async () => {
    try {
      const adapters = listAdapters().map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        domains: a.domains,
        params: a.params,
        needsBrowser: a.needsBrowser ?? false,
        cookieDomain: a.cookieDomain,
        loginUrl: a.loginUrl,
        loginCookieNames: a.loginCookieNames
      }))
      return success(adapters)
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle(
    'feeds:addAdapter',
    async (
      _event,
      input: {
        adapterId: string
        params: Record<string, string>
        title?: string
        categoryId?: number
      }
    ) => {
      try {
        const adapter = getAdapter(input.adapterId)
        if (!adapter) {
          return error('适配器不存在')
        }
        for (const p of adapter.params) {
          if (p.required && !(input.params[p.key] ?? '').trim()) {
            return error(`请填写「${p.label}」`)
          }
        }

        const cookies = getCookiesForAdapter(adapter)
        const result = await runAdapter(adapter, input.params, { cookies })
        let parsed = result.feed
        const meta = await adapter.fetchMeta?.(input.params, parsed)
        if (meta) {
          parsed = {
            ...parsed,
            title: meta.title ?? parsed.title,
            description: meta.description ?? parsed.description,
            image: meta.imageUrl ? { url: meta.imageUrl } : parsed.image
          }
        }

        const db = getConnection()
        const title = input.title || parsed.title || adapter.name
        const feedId = db
          .prepare(
            `INSERT INTO feeds (url, title, site_url, category_id, adapter_id, adapter_params)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(
            result.url,
            title,
            parsed.link || null,
            input.categoryId || null,
            adapter.id,
            JSON.stringify(input.params)
          ).lastInsertRowid as number

        await persistParsedFeed(
          feedId,
          { url: result.url, custom_title: 0, favicon_url: null },
          parsed
        )

        scheduleSync()
        return success({ id: feedId })
      } catch (e) {
        return error(toFriendlyFeedError(e))
      }
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
      db.transaction(() => {
        db.prepare('DELETE FROM articles WHERE feed_id = ?').run(id)
        db.prepare('DELETE FROM feeds WHERE id = ?').run(id)
      })()
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
        const stmt = db.prepare('UPDATE feeds SET sort_order = ? WHERE id = ?')
        db.transaction(() => {
          for (const feed of feeds) {
            stmt.run(feed.sort_order, feed.id)
          }
        })()
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

  ipcMain.handle('feeds:notifyAdded', async (_event, feedId?: number) => {
    closeAddFeedWindow()
    getMainWindow()?.webContents.send('feeds:changed', { feedId: feedId ?? undefined })
    return success(true)
  })
}
