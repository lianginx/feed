import { getSettings } from '../config'
import { getConnection } from '../database/connection'
import { parseFeed } from './rss'
import DOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

const purifyWindow = new JSDOM('').window
const purify = DOMPurify(purifyWindow as unknown as Window & typeof globalThis)

let timer: ReturnType<typeof setInterval> | null = null

/**
 * 启动定时刷新。
 */
export function startScheduler(): void {
  stopScheduler()

  const settings = getSettings()
  const intervalMs = settings.updateInterval * 60 * 1000

  timer = setInterval(refreshAllFeeds, intervalMs)
}

/**
 * 停止定时刷新。
 */
export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/**
 * 刷新所有订阅源。
 */
async function refreshAllFeeds(): Promise<void> {
  const db = getConnection()
  const feeds = db.prepare('SELECT id FROM feeds').all() as { id: number }[]

  for (const feed of feeds) {
    try {
      const feedInfo = db.prepare('SELECT error_count FROM feeds WHERE id = ?').get(feed.id) as
        { error_count: number } | undefined
      if (feedInfo && feedInfo.error_count >= 5) continue

      const feedRow = db.prepare('SELECT url FROM feeds WHERE id = ?').get(feed.id) as {
        url: string
      }
      const parsed = await parseFeed(feedRow.url)

      db.prepare(
        "UPDATE feeds SET last_updated = strftime('%s','now'), last_error = NULL, error_count = 0 WHERE id = ?"
      ).run(feed.id)

      const insertStmt = db.prepare(
        `INSERT OR IGNORE INTO articles (feed_id, guid, title, url, author, content, summary, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )

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
    } catch {
      db.prepare('UPDATE feeds SET error_count = error_count + 1 WHERE id = ?').run(feed.id)
    }
  }
}
