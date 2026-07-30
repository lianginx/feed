import { ipcMain } from 'electron'
import { getConnection } from '../database/connection'
import { success, error } from './util'
import { scheduleBadgeUpdate } from '../services/badge'

export function registerArticleHandlers(): void {
  ipcMain.handle(
    'articles:list',
    async (
      _event,
      params: { feedId?: number; categoryId?: number; filter?: 'all' | 'unread' | 'starred' }
    ) => {
      try {
        const db = getConnection()
        const conditions: string[] = []
        const queryParams: Record<string, number | string> = {}

        if (params.feedId !== undefined) {
          conditions.push('a.feed_id = @feedId')
          queryParams.feedId = params.feedId
        } else if (params.categoryId !== undefined) {
          conditions.push('f.category_id = @categoryId')
          queryParams.categoryId = params.categoryId
        }

        if (params.filter === 'unread') {
          conditions.push('a.is_read = 0')
        } else if (params.filter === 'starred') {
          conditions.push('a.is_starred = 1')
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

        const articles = db
          .prepare(
            `
        SELECT a.id, a.feed_id, a.title, a.author, a.summary, a.published_at, a.is_read, a.is_starred, a.url, a.cover_image,
          f.title as feed_title, f.favicon_url
        FROM articles a
        JOIN feeds f ON a.feed_id = f.id
        ${whereClause}
        ORDER BY a.published_at DESC, a.id DESC
        LIMIT 500
      `
          )
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .all(queryParams) as any[]

        return success({ articles })
      } catch (e) {
        return error((e as Error).message)
      }
    }
  )

  ipcMain.handle('articles:get', async (_event, id: number) => {
    try {
      const db = getConnection()
      const article = db
        .prepare(
          `
        SELECT a.*, f.title as feed_title, f.site_url
        FROM articles a
        JOIN feeds f ON a.feed_id = f.id
        WHERE a.id = ?
      `
        )
        .get(id)
      return success(article)
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('articles:markRead', async (_event, id: number) => {
    try {
      const db = getConnection()
      db.prepare('UPDATE articles SET is_read = 1 WHERE id = ?').run(id)
      scheduleBadgeUpdate()
      return success({ id })
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('articles:markAllRead', async (_event, feedId?: number) => {
    try {
      const db = getConnection()
      if (feedId) {
        db.prepare('UPDATE articles SET is_read = 1 WHERE feed_id = ? AND is_read = 0').run(feedId)
      } else {
        db.prepare('UPDATE articles SET is_read = 1 WHERE is_read = 0').run()
      }
      scheduleBadgeUpdate()
      return success({ ok: true })
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('articles:toggleStar', async (_event, id: number) => {
    try {
      const db = getConnection()
      db.prepare(
        'UPDATE articles SET is_starred = CASE WHEN is_starred = 1 THEN 0 ELSE 1 END WHERE id = ?'
      ).run(id)
      const article = db.prepare('SELECT is_starred FROM articles WHERE id = ?').get(id) as {
        is_starred: number
      }
      return success({ id, is_starred: article.is_starred })
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('articles:search', async (_event, query: string) => {
    try {
      const db = getConnection()
      const articles = db
        .prepare(
          `
        SELECT a.id, a.feed_id, a.title, a.author, a.summary, a.published_at, a.is_read, a.is_starred, a.url, a.cover_image,
          f.title as feed_title, f.favicon_url
        FROM articles_fts fts
        JOIN articles a ON fts.rowid = a.id
        JOIN feeds f ON a.feed_id = f.id
        WHERE articles_fts MATCH @query
        ORDER BY a.published_at DESC
        LIMIT 100
      `
        )
        .all({ query })
      return success(articles)
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('articles:getUnreadCounts', async () => {
    try {
      const db = getConnection()
      const counts = db
        .prepare(
          `
        SELECT feed_id, COUNT(*) as count
        FROM articles
        WHERE is_read = 0
        GROUP BY feed_id
      `
        )
        .all()
      return success(counts)
    } catch (e) {
      return error((e as Error).message)
    }
  })
}
