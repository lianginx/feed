import { getConnection } from '../database/connection'
import { parseFeed, type ParsedFeed } from './rss'
import { resolveAndCacheFavicon } from './favicon'
import { scheduleBadgeUpdate } from './badge'
import { getMainWindow } from '../app/window'
import DOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

const purifyWindow = new JSDOM('').window
const purify = DOMPurify(purifyWindow as unknown as Window & typeof globalThis)

/** 最大请求次数（含首次），超过才判定失败 */
const MAX_RETRIES = 3
/** 重试间隔（毫秒） */
const RETRY_DELAY_MS = 2000

/** 暂停指定毫秒（基于 setTimeout，不阻塞主进程）。 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 拉取并解析订阅源，失败自动重试。
 * 最多尝试 MAX_RETRIES 次，每次失败间隔 RETRY_DELAY_MS 后重试，
 * 全部失败才抛出最后一次错误。
 */
async function fetchWithRetry(url: string): Promise<ParsedFeed> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await parseFeed(url)
    } catch (e) {
      lastError = e
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS)
      }
    }
  }
  throw lastError
}

export interface RefreshResult {
  feedId: number
  success: boolean
  error?: string
  inserted: number
  updated: number
}

/**
 * 刷新所有订阅源（并发执行，通知逻辑在 refreshSingleFeed 内部）。
 */
export async function refreshAllFeeds(): Promise<void> {
  const db = getConnection()
  const feeds = db.prepare('SELECT id FROM feeds').all() as { id: number }[]

  await Promise.allSettled(feeds.map((feed) => refreshSingleFeed(feed.id)))
}

/**
 * 刷新单个订阅源：拉取 RSS → 更新 feed 元信息 → 缓存 favicon → 同步文章。
 */
export async function refreshSingleFeed(feedId: number): Promise<RefreshResult> {
  const db = getConnection()
  const feed = db.prepare('SELECT * FROM feeds WHERE id = ?').get(feedId) as
    | {
        id: number
        url: string
        title: string
        custom_title: number
        error_count: number
        favicon_url: string | null
      }
    | undefined

  if (!feed) {
    return { feedId, success: false, error: '订阅源不存在', inserted: 0, updated: 0 }
  }

  // 通知前端：开始刷新
  const win = getMainWindow()
  win?.webContents.send('feeds:refresh-progress', { feedId, status: 'fetching' })

  try {
    // 拉取 RSS（失败自动重试，最多 3 次，全部失败才进入 catch）
    const parsed = await fetchWithRetry(feed.url)

    // 更新 feed 信息（自定义标题时不覆盖 title）
    if (feed.custom_title) {
      db.prepare(
        `UPDATE feeds SET description = ?, site_url = ?, last_updated = strftime('%s','now'), last_error = NULL, error_count = 0
         WHERE id = ?`
      ).run(parsed.description || null, parsed.link || null, feedId)
    } else {
      db.prepare(
        `UPDATE feeds SET title = ?, description = ?, site_url = ?, last_updated = strftime('%s','now'), last_error = NULL, error_count = 0
         WHERE id = ?`
      ).run(parsed.title, parsed.description || null, parsed.link || null, feedId)
    }

    // 缓存 favicon：已有则跳过，避免每次定时刷新都重复拉取站点首页/图标；
    // 手动「刷新图标」（feeds:refreshFavicon）仍会强制重新下载
    if (!feed.favicon_url) {
      try {
        const siteUrl = parsed.link || feed.url
        const localUrl = await resolveAndCacheFavicon(feedId, siteUrl, parsed.image?.url)
        if (localUrl) {
          db.prepare('UPDATE feeds SET favicon_url = ? WHERE id = ?').run(localUrl, feedId)
        }
      } catch {
        // favicon 刷新失败不影响同步
      }
    }

    // 同步文章（去重 + 更新已有）
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
        // 无效（无法解析）的发布时间回退为当前时间，避免 NaN 落库导致按时间排序异常
        const parsedTime = item.pubDate ? new Date(item.pubDate).getTime() : NaN
        const publishedAt = Number.isFinite(parsedTime)
          ? Math.floor(parsedTime / 1000)
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

    // 触发徽标更新
    scheduleBadgeUpdate()

    // 通知前端：刷新完成
    win?.webContents.send('feeds:refresh-progress', {
      feedId,
      status: 'complete',
      inserted,
      updated
    })

    return { feedId, success: true, inserted, updated }
  } catch (e) {
    db.prepare(
      "UPDATE feeds SET last_error = ?, error_count = error_count + 1, last_updated = strftime('%s','now') WHERE id = ?"
    ).run((e as Error).message, feedId)

    // 通知前端：刷新失败
    win?.webContents.send('feeds:refresh-progress', {
      feedId,
      status: 'error',
      error: (e as Error).message
    })

    return { feedId, success: false, error: (e as Error).message, inserted: 0, updated: 0 }
  }
}
