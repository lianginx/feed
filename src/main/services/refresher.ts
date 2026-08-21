import { getConnection } from '@main/database/connection'
import { parseFeed, toFriendlyFeedError, type ParsedFeed } from './rss'
import { normalizeContentImages } from './contentImages'
import { getAdapter, runAdapter } from './routes'
import { getCookiesForAdapter } from './siteCookies'
import { getCacheFile } from './cache'
import { fileNameForSource, parseFaviconName, resolveAndCacheFavicon } from './favicon'
import { scheduleBadgeUpdate } from './badge'
import { getMainWindow } from '@main/app/window'

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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

export interface ParsedFeedPersistContext {
  url: string
  custom_title: number
  favicon_url: string | null
}

export async function persistParsedFeed(
  feedId: number,
  feed: ParsedFeedPersistContext,
  parsed: ParsedFeed
): Promise<{ inserted: number; updated: number }> {
  const db = getConnection()

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

  const imageUrl = parsed.image?.url ?? null
  const currentName = feed.favicon_url?.startsWith('favicon://')
    ? feed.favicon_url.slice('favicon://'.length)
    : undefined
  const currentParsed = currentName ? parseFaviconName(currentName) : undefined
  const currentFileKey = currentParsed
    ? `${fileNameForSource(currentParsed.sourceUrl)}.${currentParsed.ext}`
    : undefined
  const fileOk = currentFileKey ? getCacheFile('favicon', currentFileKey) !== undefined : false
  const sourceOk =
    currentParsed !== undefined && (!imageUrl || currentParsed.sourceUrl === imageUrl)
  if (!fileOk || !sourceOk) {
    try {
      const siteUrl = parsed.link || feed.url
      const localUrl = await resolveAndCacheFavicon(siteUrl, imageUrl ?? undefined)
      if (localUrl && localUrl !== feed.favicon_url) {
        db.prepare('UPDATE feeds SET favicon_url = ? WHERE id = ?').run(localUrl, feedId)
      }
    } catch {
      void 0
    }
  }

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO articles (feed_id, guid, title, url, author, content, summary, published_at, cover_image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const updateStmt = db.prepare(`
    UPDATE articles SET title = ?, content = ?, author = ?, published_at = ?, cover_image = ?
    WHERE feed_id = ? AND guid = ?
  `)
  const selectStmt = db.prepare(
    'SELECT id, content, published_at FROM articles WHERE feed_id = ? AND guid = ?'
  )

  let inserted = 0
  let updated = 0

  db.exec('BEGIN')
  try {
    for (const item of parsed.items) {
      if (!item.guid) continue

      const degraded = item.contentComplete === false
      const rawContent = degraded ? '' : item.content || item.contentSnippet || ''
      const sanitizedContent = degraded ? '' : normalizeContentImages(rawContent)
      const parsedTime = item.pubDate ? new Date(item.pubDate).getTime() : NaN
      const publishedAt = Number.isFinite(parsedTime)
        ? Math.floor(parsedTime / 1000)
        : Math.floor(Date.now() / 1000)

      const existing = selectStmt.get(feedId, item.guid) as
        { id: number; content: string; published_at: number | null } | undefined

      if (existing) {
        const effectiveContent = degraded && existing.content ? existing.content : sanitizedContent
        const effectivePublishedAt = Number.isFinite(parsedTime)
          ? Math.floor(parsedTime / 1000)
          : (existing.published_at ?? Math.floor(Date.now() / 1000))
        updateStmt.run(
          item.title,
          effectiveContent,
          item.author || null,
          effectivePublishedAt,
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
    db.exec('COMMIT')
  } catch (e) {
    try {
      db.exec('ROLLBACK')
    } catch {
      void 0
    }
    throw e
  }

  scheduleBadgeUpdate()
  return { inserted, updated }
}

export function refreshAllFeeds(): void {
  const db = getConnection()
  const feeds = db.prepare('SELECT id FROM feeds').all() as unknown as { id: number }[]
  feeds.forEach((feed) => refreshSingleFeed(feed.id))
}

const refreshing = new Set<number>()

export function refreshSingleFeed(feedId: number) {
  if (refreshing.has(feedId)) return
  refreshing.add(feedId)
  refreshFeed(feedId)
    .catch((e) => console.error(`[refresher] feed ${feedId} 刷新异常:`, e))
    .finally(() => refreshing.delete(feedId))
}

async function refreshFeed(feedId: number): Promise<void> {
  const db = getConnection()
  const win = getMainWindow()

  try {
    const feed = db.prepare('SELECT * FROM feeds WHERE id = ?').get(feedId) as
      | {
          id: number
          url: string
          title: string
          custom_title: number
          error_count: number
          favicon_url: string | null
          adapter_id: string | null
          adapter_params: string | null
        }
      | undefined

    if (!feed) return

    win?.webContents.send('feeds:refresh-progress', { feedId, status: 'fetching' })

    let parsed: ParsedFeed
    if (feed.adapter_id) {
      const adapter = getAdapter(feed.adapter_id)
      if (!adapter) {
        throw new Error('适配器不存在或已失效')
      }
      const params = (JSON.parse(feed.adapter_params ?? '{}') as Record<string, string>) || {}
      const cookies = getCookiesForAdapter(adapter)
      const result = await runAdapter(adapter, params, { cookies })
      parsed = result.feed
      const meta = await adapter.fetchMeta?.(params, parsed)
      if (meta) {
        parsed = {
          ...parsed,
          title: meta.title ?? parsed.title,
          description: meta.description ?? parsed.description,
          image: meta.imageUrl ? { url: meta.imageUrl } : parsed.image
        }
      }
    } else {
      parsed = await fetchWithRetry(feed.url)
    }

    const { inserted, updated } = await persistParsedFeed(feedId, feed, parsed)

    win?.webContents.send('feeds:refresh-progress', {
      feedId,
      status: 'complete',
      inserted,
      updated
    })
  } catch (e) {
    const friendlyError = toFriendlyFeedError(e)
    console.error(`[refresher] feed ${feedId} 刷新失败:`, e)

    db.prepare(
      "UPDATE feeds SET last_error = ?, error_count = error_count + 1, last_updated = strftime('%s','now') WHERE id = ?"
    ).run(friendlyError, feedId)

    win?.webContents.send('feeds:refresh-progress', {
      feedId,
      status: 'error',
      error: friendlyError
    })
  }
}
