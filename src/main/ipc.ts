import { ipcMain, dialog, nativeTheme, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { getConnection } from './database/connection'
import { getSettings, updateSettings, type AppSettings } from './config'
import { startScheduler } from './services/scheduler'
import { parseFeed, validateFeed } from './services/rss'
import { resolveFavicon } from './services/favicon'
import DOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import opml from 'opml'

// 创建 DOMPurify 实例（服务端使用 JSDOM）
const purifyWindow = new JSDOM('').window
const purify = DOMPurify(purifyWindow as unknown as Window & typeof globalThis)

// ==================== 工具函数 ====================

function success<T>(data: T): { success: true; data: T } {
  return { success: true as const, data }
}

function error(msg: string): { success: false; error: string } {
  return { success: false as const, error: msg }
}

// ==================== Feeds ====================

function registerFeedHandlers(): void {
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

        // 获取 favicon
        let faviconUrl: string | null = null
        try {
          const feedData = await parseFeed(params.url)
          faviconUrl = await resolveFavicon(feedData.link || null, feedData.image?.url)
        } catch {
          /* favicon 获取失败不影响添加 */
        }

        const result = db
          .prepare('INSERT INTO feeds (url, title, category_id, favicon_url) VALUES (?, ?, ?, ?)')
          .run(params.url, title, params.categoryId || null, faviconUrl)

        return success({ id: result.lastInsertRowid })
      } catch (e) {
        return error((e as Error).message)
      }
    }
  )

  ipcMain.handle(
    'feeds:update',
    async (_event, id: number, data: { title?: string; categoryId?: number }) => {
      try {
        const db = getConnection()
        const fields: string[] = []
        const values: (string | number | null)[] = []

        if (data.title !== undefined) {
          fields.push('title = ?')
          values.push(data.title)
        }
        if (data.categoryId !== undefined) {
          fields.push('category_id = ?')
          values.push(data.categoryId)
        }

        if (fields.length === 0) return success({ id })

        values.push(id)
        db.prepare(`UPDATE feeds SET ${fields.join(', ')} WHERE id = ?`).run(...values)
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
        return success({ updated: feeds.length })
      } catch (e) {
        return error((e as Error).message)
      }
    }
  )
}

// ==================== Categories ====================

function registerCategoryHandlers(): void {
  ipcMain.handle('categories:list', async () => {
    try {
      const db = getConnection()
      const categories = db
        .prepare(
          `
        SELECT c.*,
          (SELECT COUNT(*) FROM feeds WHERE category_id = c.id) as feed_count
        FROM categories c
        ORDER BY c.sort_order ASC, c.id ASC
      `
        )
        .all()
      return success(categories)
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('categories:add', async (_event, name: string) => {
    try {
      const db = getConnection()
      const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name)
      return success({ id: result.lastInsertRowid })
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('categories:update', async (_event, id: number, name: string) => {
    try {
      const db = getConnection()
      db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, id)
      return success({ id })
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('categories:delete', async (_event, id: number) => {
    try {
      const db = getConnection()
      let feedCount = 0
      db.transaction(() => {
        // 查出该分类下所有订阅源 ID
        const feedIds: { id: number }[] = db
          .prepare('SELECT id FROM feeds WHERE category_id = ?')
          .all(id) as { id: number }[]
        feedCount = feedIds.length

        if (feedCount > 0) {
          // 批量删除这些订阅源下的所有文章
          const placeholders = feedIds.map(() => '?').join(',')
          db.prepare(`DELETE FROM articles WHERE feed_id IN (${placeholders})`).run(
            ...feedIds.map((f) => f.id)
          )
          // 批量删除这些订阅源
          db.prepare(`DELETE FROM feeds WHERE id IN (${placeholders})`).run(
            ...feedIds.map((f) => f.id)
          )
        }

        // 删除分类本身
        db.prepare('DELETE FROM categories WHERE id = ?').run(id)
      })()
      return success({ id, feedCount })
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('categories:markAllRead', async (_event, categoryId: number) => {
    try {
      const db = getConnection()
      db.prepare(
        'UPDATE articles SET is_read = 1 WHERE is_read = 0 AND feed_id IN (SELECT id FROM feeds WHERE category_id = ?)'
      ).run(categoryId)
      return success({ ok: true })
    } catch (e) {
      return error((e as Error).message)
    }
  })
}

// ==================== Articles ====================

export interface ArticleListParams {
  feedId?: number
  filter?: 'all' | 'unread' | 'starred'
  cursor?: { publishedAt: number; id: number }
  limit?: number
}

function registerArticleHandlers(): void {
  ipcMain.handle('articles:list', async (_event, params: ArticleListParams) => {
    try {
      const db = getConnection()
      const limit = params.limit || 50
      const conditions: string[] = []
      const queryParams: Record<string, number | string> = { limit: limit + 1 } // 多取一条判断是否有更多

      if (params.feedId !== undefined) {
        conditions.push('a.feed_id = @feedId')
        queryParams.feedId = params.feedId
      }

      if (params.filter === 'unread') {
        conditions.push('a.is_read = 0')
      } else if (params.filter === 'starred') {
        conditions.push('a.is_starred = 1')
      }

      if (params.cursor) {
        conditions.push(
          '(a.published_at < @cursorPub OR (a.published_at = @cursorPub AND a.id < @cursorId))'
        )
        queryParams.cursorPub = params.cursor.publishedAt
        queryParams.cursorId = params.cursor.id
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
        LIMIT @limit
      `
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .all(queryParams) as any[]

      const hasMore = articles.length > limit
      if (hasMore) articles.pop()

      return success({ articles, hasMore })
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

// ==================== Sync ====================

function registerSyncHandlers(): void {
  ipcMain.handle('sync:refreshFeed', async (_event, feedId: number) => {
    try {
      const db = getConnection()
      const feed = db.prepare('SELECT * FROM feeds WHERE id = ?').get(feedId) as
        { id: number; url: string; title: string; error_count: number } | undefined
      if (!feed) return error('订阅源不存在')

      const parsed = await parseFeed(feed.url)

      // 更新 feed 信息
      db.prepare(
        `
        UPDATE feeds SET title = ?, description = ?, site_url = ?, last_updated = strftime('%s','now'), last_error = NULL, error_count = 0
        WHERE id = ?
      `
      ).run(parsed.title, parsed.description || null, parsed.link || null, feedId)

      // 插入文章（去重）
      const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO articles (feed_id, guid, title, url, author, content, summary, published_at, cover_image)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const updateStmt = db.prepare(`
        UPDATE articles SET title = ?, content = ?, author = ?, published_at = ?, cover_image = ?
        WHERE feed_id = ? AND guid = ?
      `)

      let inserted = 0
      let updated = 0

      db.transaction(() => {
        for (const item of parsed.items) {
          if (!item.guid) continue

          const content = item.content || item.contentSnippet || ''
          const sanitizedContent = purify.sanitize(content)
          const publishedAt = item.pubDate
            ? Math.floor(new Date(item.pubDate).getTime() / 1000)
            : Math.floor(Date.now() / 1000)

          const existing = db
            .prepare('SELECT id FROM articles WHERE feed_id = ? AND guid = ?')
            .get(feedId, item.guid)

          if (existing) {
            updateStmt.run(
              item.title,
              sanitizedContent,
              item.author || null,
              publishedAt,
              item.coverImage || null,
              feedId,
              item.guid
            )
            updated++
          } else {
            insertStmt.run(
              feedId,
              item.guid,
              item.title,
              item.link || null,
              item.author || null,
              sanitizedContent,
              item.summary || null,
              publishedAt,
              item.coverImage || null
            )
            inserted++
          }
        }
      })()

      return success({ inserted, updated })
    } catch (e) {
      // 记录错误
      const db = getConnection()
      const feed = db.prepare('SELECT error_count FROM feeds WHERE id = ?').get(feedId) as
        { error_count: number } | undefined
      if (feed) {
        db.prepare(
          "UPDATE feeds SET last_error = ?, error_count = error_count + 1, last_updated = strftime('%s','now') WHERE id = ?"
        ).run((e as Error).message, feedId)
      }
      return error((e as Error).message)
    }
  })

  ipcMain.handle('sync:refreshAll', async () => {
    try {
      const db = getConnection()
      const feeds = db.prepare('SELECT id FROM feeds').all() as { id: number }[]

      const results: { feedId: number; success: boolean; error?: string }[] = []
      for (const feed of feeds) {
        try {
          // 跳过连续错误 ≥5 的 feed
          const feedInfo = db.prepare('SELECT error_count FROM feeds WHERE id = ?').get(feed.id) as
            { error_count: number } | undefined
          if (feedInfo && feedInfo.error_count >= 5) {
            results.push({ feedId: feed.id, success: false, error: '已暂停（连续错误 ≥5 次）' })
            continue
          }

          const parsed = await parseFeed(
            (db.prepare('SELECT url FROM feeds WHERE id = ?').get(feed.id) as { url: string }).url
          )

          db.prepare(
            "UPDATE feeds SET last_updated = strftime('%s','now'), last_error = NULL, error_count = 0 WHERE id = ?"
          ).run(feed.id)

          const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO articles (feed_id, guid, title, url, author, content, summary, published_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `)

          db.transaction(() => {
            for (const item of parsed.items) {
              if (!item.guid) continue
              const content = item.content || item.contentSnippet || ''
              const sanitizedContent = purify.sanitize(content)
              const publishedAt = item.pubDate
                ? Math.floor(new Date(item.pubDate).getTime() / 1000)
                : Math.floor(Date.now() / 1000)

              insertStmt.run(
                feed.id,
                item.guid,
                item.title,
                item.link || null,
                item.author || null,
                sanitizedContent,
                item.summary || null,
                publishedAt
              )
            }
          })()

          results.push({ feedId: feed.id, success: true })
        } catch (e) {
          db.prepare(
            'UPDATE feeds SET last_error = ?, error_count = error_count + 1 WHERE id = ?'
          ).run((e as Error).message, feed.id)
          results.push({ feedId: feed.id, success: false, error: (e as Error).message })
        }
      }

      return success(results)
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('sync:refreshCategory', async (_event, categoryId: number) => {
    try {
      const db = getConnection()
      const feeds = db
        .prepare('SELECT id, url FROM feeds WHERE category_id = ?')
        .all(categoryId) as {
        id: number
        url: string
      }[]

      const results: { feedId: number; success: boolean; error?: string }[] = []
      for (const feed of feeds) {
        try {
          const feedInfo = db.prepare('SELECT error_count FROM feeds WHERE id = ?').get(feed.id) as
            { error_count: number } | undefined
          if (feedInfo && feedInfo.error_count >= 5) {
            results.push({ feedId: feed.id, success: false, error: '已暂停（连续错误 ≥5 次）' })
            continue
          }

          const parsed = await parseFeed(feed.url)

          db.prepare(
            "UPDATE feeds SET last_updated = strftime('%s','now'), last_error = NULL, error_count = 0 WHERE id = ?"
          ).run(feed.id)

          const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO articles (feed_id, guid, title, url, author, content, summary, published_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `)

          db.transaction(() => {
            for (const item of parsed.items) {
              if (!item.guid) continue
              const content = item.content || item.contentSnippet || ''
              const sanitizedContent = purify.sanitize(content)
              const publishedAt = item.pubDate
                ? Math.floor(new Date(item.pubDate).getTime() / 1000)
                : Math.floor(Date.now() / 1000)

              insertStmt.run(
                feed.id,
                item.guid,
                item.title,
                item.link || null,
                item.author || null,
                sanitizedContent,
                item.summary || null,
                publishedAt
              )
            }
          })()

          results.push({ feedId: feed.id, success: true })
        } catch (e) {
          db.prepare(
            'UPDATE feeds SET last_error = ?, error_count = error_count + 1 WHERE id = ?'
          ).run((e as Error).message, feed.id)
          results.push({ feedId: feed.id, success: false, error: (e as Error).message })
        }
      }

      return success(results)
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('sync:parseFeed', async (_event, url: string) => {
    try {
      const parsed = await parseFeed(url)
      return success(parsed)
    } catch (e) {
      return error((e as Error).message)
    }
  })
}

// ==================== Config ====================

function registerConfigHandlers(): void {
  ipcMain.handle('config:get', async () => {
    try {
      return success(getSettings())
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('config:update', async (_event, settings: Partial<AppSettings>) => {
    try {
      const updated = updateSettings(settings)
      // 主题变更：同步到原生窗口
      if (settings.theme !== undefined) {
        nativeTheme.themeSource = settings.theme
        const wins = BrowserWindow.getAllWindows()
        if (wins.length > 0) {
          const isDark =
            settings.theme === 'dark' ||
            (settings.theme === 'system' && nativeTheme.shouldUseDarkColors)
          wins[0].setBackgroundColor(isDark ? '#0a0a0a' : '#fafafa')
        }
      }
      // 如果更新了刷新间隔，重启调度器
      if (settings.updateInterval !== undefined) {
        startScheduler()
      }
      return success(updated)
    } catch (e) {
      return error((e as Error).message)
    }
  })
}

// ==================== OPML ====================

function registerOpmlHandlers(): void {
  ipcMain.handle('opml:import', async (_event, opmlContent: string) => {
    try {
      const feedUrls: { title?: string; url: string }[] = []

      // 解析 OPML
      const parsedOpml = await opml.parse(opmlContent)
      for (const outline of parsedOpml.children || []) {
        if (outline.xmlUrl) {
          feedUrls.push({ title: outline.title || outline.text, url: outline.xmlUrl })
        }
        if (outline.children) {
          for (const child of outline.children) {
            if (child.xmlUrl) {
              feedUrls.push({ title: child.title || child.text, url: child.xmlUrl })
            }
          }
        }
      }

      // 逐个添加
      const db = getConnection()
      let added = 0
      let skipped = 0

      for (const feedUrl of feedUrls) {
        const existing = db.prepare('SELECT id FROM feeds WHERE url = ?').get(feedUrl.url)
        if (existing) {
          skipped++
          continue
        }

        try {
          const validation = await validateFeed(feedUrl.url)
          if (!validation.valid) {
            skipped++
            continue
          }

          db.prepare('INSERT INTO feeds (url, title) VALUES (?, ?)').run(
            feedUrl.url,
            feedUrl.title || validation.title || feedUrl.url
          )
          added++
        } catch {
          skipped++
        }
      }

      return success({ total: feedUrls.length, added, skipped })
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('opml:export', async () => {
    try {
      const db = getConnection()
      const feeds = db
        .prepare(
          `
        SELECT f.*, c.name as category_name
        FROM feeds f
        LEFT JOIN categories c ON f.category_id = c.id
        ORDER BY f.id ASC
      `
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .all() as any[]

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const outlines: any[] = []

      for (const feed of feeds) {
        outlines.push({
          title: feed.title,
          text: feed.title,
          xmlUrl: feed.url,
          htmlUrl: feed.site_url || undefined
        })
      }

      const opmlData = opml.stringify({
        title: 'Feed 订阅源导出',
        children: outlines
      })

      return success(opmlData)
    } catch (e) {
      return error((e as Error).message)
    }
  })

  // 打开 OPML 文件并导入
  ipcMain.handle('opml:importFromFile', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: '导入 OPML',
        filters: [{ name: 'OPML', extensions: ['opml', 'xml'] }],
        properties: ['openFile']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return success({ canceled: true })
      }

      const content = readFileSync(result.filePaths[0], 'utf-8')

      const feedUrls: { title?: string; url: string }[] = []
      const parsedOpml = await opml.parse(content)
      for (const outline of parsedOpml.children || []) {
        if (outline.xmlUrl) {
          feedUrls.push({ title: outline.title || outline.text, url: outline.xmlUrl })
        }
        if (outline.children) {
          for (const child of outline.children) {
            if (child.xmlUrl) {
              feedUrls.push({ title: child.title || child.text, url: child.xmlUrl })
            }
          }
        }
      }

      const db = getConnection()
      let added = 0
      let skipped = 0

      for (const feedUrl of feedUrls) {
        const existing = db.prepare('SELECT id FROM feeds WHERE url = ?').get(feedUrl.url)
        if (existing) {
          skipped++
          continue
        }

        try {
          const validation = await validateFeed(feedUrl.url)
          if (!validation.valid) {
            skipped++
            continue
          }

          db.prepare('INSERT INTO feeds (url, title) VALUES (?, ?)').run(
            feedUrl.url,
            feedUrl.title || validation.title || feedUrl.url
          )
          added++
        } catch {
          skipped++
        }
      }

      return success({ canceled: false, total: feedUrls.length, added, skipped })
    } catch (e) {
      return error((e as Error).message)
    }
  })

  // 导出 OPML 到文件
  ipcMain.handle('opml:exportToFile', async () => {
    try {
      const db = getConnection()
      const feeds = db
        .prepare(
          `
        SELECT f.*, c.name as category_name
        FROM feeds f
        LEFT JOIN categories c ON f.category_id = c.id
        ORDER BY f.id ASC
      `
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .all() as any[]

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const outlines: any[] = []

      for (const feed of feeds) {
        outlines.push({
          title: feed.title,
          text: feed.title,
          xmlUrl: feed.url,
          htmlUrl: feed.site_url || undefined
        })
      }

      const opmlData = opml.stringify({
        title: 'Feed 订阅源导出',
        children: outlines
      })

      const saveResult = await dialog.showSaveDialog({
        title: '导出 OPML',
        defaultPath: 'feed-subscriptions.opml',
        filters: [{ name: 'OPML', extensions: ['opml', 'xml'] }]
      })

      if (saveResult.canceled || !saveResult.filePath) {
        return success({ canceled: true })
      }

      writeFileSync(saveResult.filePath, opmlData, 'utf-8')
      return success({ canceled: false, filePath: saveResult.filePath })
    } catch (e) {
      return error((e as Error).message)
    }
  })
}

// ==================== 注册所有处理器 ====================

export function registerAllHandlers(): void {
  registerFeedHandlers()
  registerCategoryHandlers()
  registerArticleHandlers()
  registerSyncHandlers()
  registerConfigHandlers()
  registerOpmlHandlers()
}
