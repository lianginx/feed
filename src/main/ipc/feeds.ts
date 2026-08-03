import { ipcMain } from 'electron'
import { getConnection } from '../database/connection'
import { parseFeed, validateFeed } from '../services/rss'
import { resolveAndCacheFavicon, refreshFeedFavicon } from '../services/favicon'
import { refreshSingleFeed } from '../services/refresher'
import { scheduleSync } from '../services/sync'
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
        // 先验证 URL
        const validation = await validateFeed(params.url)
        if (!validation.valid) {
          return error(validation.error || '无法解析此订阅源')
        }

        const db = getConnection()
        const title = params.title || validation.title || params.url

        // 先插入订阅源，获取 id
        const result = db
          .prepare('INSERT INTO feeds (url, title, category_id) VALUES (?, ?, ?)')
          .run(params.url, title, params.categoryId || null)

        const feedId = result.lastInsertRowid as number

        // 再解析 favicon 并缓存到本地
        try {
          const feedData = await parseFeed(params.url)
          const localUrl = await resolveAndCacheFavicon(
            feedId,
            feedData.link || null,
            feedData.image?.url
          )
          if (localUrl) {
            db.prepare('UPDATE feeds SET favicon_url = ? WHERE id = ?').run(localUrl, feedId)
          }
        } catch {
          /* favicon 获取失败不影响添加 */
        }

        // 订阅列表已变更，防抖触发自动同步
        scheduleSync()

        return success({ id: feedId })
      } catch (e) {
        return error((e as Error).message)
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
        // 删除关联的文章（包括 FTS 索引）
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

  ipcMain.handle('feeds:refresh', async (_event, feedId: number) => {
    try {
      const result = await refreshSingleFeed(feedId)
      if (result.success) {
        return success(result)
      } else {
        return error(result.error || '刷新失败')
      }
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('feeds:parseUrl', async (_event, url: string) => {
    try {
      const parsed = await parseFeed(url)
      return success(parsed)
    } catch (e) {
      return error((e as Error).message)
    }
  })
}
