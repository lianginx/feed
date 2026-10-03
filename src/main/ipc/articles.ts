import { ipcMain } from 'electron'
import { getConnection } from '@main/database/connection'
import { getSettings } from '@main/config'
import { queryArticleList, type ArticleListTranslateOptions } from '@main/services/articleList'
import { success, error } from './util'
import { scheduleBadgeUpdate } from '@main/services/badge'
import type { ArticleListParams } from '@shared/types/articles'

/** 列表译文查询选项：仅在开启「列表显示译文」且已配置翻译服务时启用 */
function currentTranslateOptions(): ArticleListTranslateOptions | null {
  const { translate } = getSettings()
  if (!translate.showInList || translate.provider === 'none') return null
  return { provider: translate.provider, targetLang: translate.targetLang }
}

export function registerArticleHandlers(): void {
  ipcMain.handle('articles:list', async (_event, params: ArticleListParams) => {
    try {
      return success(queryArticleList(getConnection(), params, currentTranslateOptions()))
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('articles:get', async (_event, id: number) => {
    try {
      const db = getConnection()
      const article = db
        .prepare(
          `
        SELECT a.*, f.title as feed_title, f.site_url, f.favicon_url
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

  ipcMain.handle('articles:toggleRead', async (_event, id: number) => {
    try {
      const db = getConnection()
      db.prepare(
        'UPDATE articles SET is_read = CASE WHEN is_read = 1 THEN 0 ELSE 1 END WHERE id = ?'
      ).run(id)
      const article = db.prepare('SELECT is_read FROM articles WHERE id = ?').get(id) as unknown as
        { is_read: number } | undefined
      if (!article) return error('文章不存在')
      scheduleBadgeUpdate()
      return success({ id, is_read: article.is_read })
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle(
    'articles:markAllRead',
    async (_event, feedId?: number, isStar?: boolean, isToday?: boolean) => {
      try {
        const db = getConnection()
        if (isToday) {
          const now = new Date()
          const todayStart =
            new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000
          db.prepare('UPDATE articles SET is_read = 1 WHERE is_read = 0 AND published_at >= ?').run(
            todayStart
          )
        } else if (isStar) {
          db.prepare('UPDATE articles SET is_read = 1 WHERE is_read = 0 AND is_starred = 1').run()
        } else if (feedId) {
          db.prepare('UPDATE articles SET is_read = 1 WHERE feed_id = ? AND is_read = 0').run(
            feedId
          )
        } else {
          db.prepare('UPDATE articles SET is_read = 1 WHERE is_read = 0').run()
        }
        scheduleBadgeUpdate()
        return success({ ok: true })
      } catch (e) {
        return error((e as Error).message)
      }
    }
  )

  ipcMain.handle('articles:toggleStar', async (_event, id: number) => {
    try {
      const db = getConnection()
      db.prepare(
        'UPDATE articles SET is_starred = CASE WHEN is_starred = 1 THEN 0 ELSE 1 END WHERE id = ?'
      ).run(id)
      const article = db
        .prepare('SELECT is_starred FROM articles WHERE id = ?')
        .get(id) as unknown as { is_starred: number } | undefined
      if (!article) return error('文章不存在')
      return success({ id, is_starred: article.is_starred })
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
