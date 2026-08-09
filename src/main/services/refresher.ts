import { getConnection } from '../database/connection'
import { parseFeed, toFriendlyFeedError, type ParsedFeed } from './rss'
import { normalizeContentImages } from './contentImages'
import { getAdapter, runAdapter } from './routes'
import { getCookiesForAdapter } from './siteCookies'
import { getCacheFile } from './cache'
import { fileNameForSource, parseFaviconName, resolveAndCacheFavicon } from './favicon'
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

/** 持久化所需的最小 feed 字段（refreshSingleFeed 的 feed 记录与 addAdapter 的 INSERT 结果都满足） */
export interface ParsedFeedPersistContext {
  url: string
  custom_title: number
  favicon_url: string | null
}

/**
 * 用解析结果更新 feed 元信息 + 缓存 favicon + 同步文章入库。
 * refreshSingleFeed 与 feeds:addAdapter 共用：添加适配站点时直接用验证抓取的结果入库，避免二次抓取（减风控风险）。
 */
export async function persistParsedFeed(
  feedId: number,
  feed: ParsedFeedPersistContext,
  parsed: ParsedFeed
): Promise<{ inserted: number; updated: number }> {
  const db = getConnection()

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

  // 缓存 favicon：内容寻址（favicon_url = favicon://{base64url(源URL)}.{ext}）。
  // 本地文件存在且源未变化（与当前解析出的 feed 图像一致）则跳过；
  // 否则重新解析并以新格式覆盖（旧格式/缺失/源变化都会在此升级或重建）。
  const imageUrl = parsed.image?.url ?? null
  const currentName = feed.favicon_url?.startsWith('favicon://')
    ? feed.favicon_url.slice('favicon://'.length)
    : undefined
  const currentParsed = currentName ? parseFaviconName(currentName) : undefined
  // 磁盘文件为定长 hash 命名，按解码出的源计算实际文件名
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
  const selectStmt = db.prepare(
    'SELECT id, content, published_at FROM articles WHERE feed_id = ? AND guid = ?'
  )

  let inserted = 0
  let updated = 0

  db.transaction(() => {
    for (const item of parsed.items) {
      if (!item.guid) continue

      // 详情未提取到正文（contentComplete=false）时不用 contentSnippet/列表摘要兜底，
      // 避免刷新把劣质内容覆盖成已入库的完整正文
      const degraded = item.contentComplete === false
      const rawContent = degraded ? '' : item.content || item.contentSnippet || ''
      const sanitizedContent = normalizeContentImages(purify.sanitize(rawContent))
      // 无效（无法解析）的发布时间回退为当前时间，避免 NaN 落库导致按时间排序异常
      const parsedTime = item.pubDate ? new Date(item.pubDate).getTime() : NaN
      const publishedAt = Number.isFinite(parsedTime)
        ? Math.floor(parsedTime / 1000)
        : Math.floor(Date.now() / 1000)

      const existing = selectStmt.get(feedId, item.guid) as
        { id: number; content: string; published_at: number | null } | undefined

      if (existing) {
        // 详情抓取失败（正文缺失）时不覆盖已抓到的完整正文
        const effectiveContent = degraded && existing.content ? existing.content : sanitizedContent
        // 发布时间缺失时不回退为当前时间，保留原有日期（对所有订阅源生效：
        // 缺失日期用 now 填充会让旧文章排序时"看起来最新"，且刷新会不断改写真实日期）
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
  })()

  // 触发徽标更新
  scheduleBadgeUpdate()
  return { inserted, updated }
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
        adapter_id: string | null
        adapter_params: string | null
      }
    | undefined

  if (!feed) {
    return { feedId, success: false, error: '订阅源不存在', inserted: 0, updated: 0 }
  }

  // 通知前端：开始刷新
  const win = getMainWindow()
  win?.webContents.send('feeds:refresh-progress', { feedId, status: 'fetching' })

  try {
    // 适配器源：走 runAdapter（注入站点登录 cookie）；RSS 源：XML 解析（失败自动重试）
    let parsed: ParsedFeed
    if (feed.adapter_id) {
      const adapter = getAdapter(feed.adapter_id)
      if (!adapter) {
        throw new Error('适配器不存在或已失效')
      }
      const params = (JSON.parse(feed.adapter_params ?? '{}') as Record<string, string>) || {}
      const cookies = getCookiesForAdapter(adapter)
      // 专栏等适配器会在 parse 内逐篇抓详情页补发布时间/完整正文（与添加时一致）
      const result = await runAdapter(adapter, params, { cookies })
      parsed = result.feed
      // 适配器补充 UP 主等 feed 级元信息（标题/简介/头像）
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

    // 更新 feed 元信息 + favicon + 入库（与 addAdapter 共用，避免重复抓取）
    const { inserted, updated } = await persistParsedFeed(feedId, feed, parsed)

    // 通知前端：刷新完成
    win?.webContents.send('feeds:refresh-progress', {
      feedId,
      status: 'complete',
      inserted,
      updated
    })

    return { feedId, success: true, inserted, updated }
  } catch (e) {
    const friendlyError = toFriendlyFeedError(e)
    // 原始技术细节记录到日志，供排查
    console.error(`[refresher] feed ${feedId} 刷新失败:`, e)

    db.prepare(
      "UPDATE feeds SET last_error = ?, error_count = error_count + 1, last_updated = strftime('%s','now') WHERE id = ?"
    ).run(friendlyError, feedId)

    // 通知前端：刷新失败
    win?.webContents.send('feeds:refresh-progress', {
      feedId,
      status: 'error',
      error: friendlyError
    })

    return { feedId, success: false, error: friendlyError, inserted: 0, updated: 0 }
  }
}
