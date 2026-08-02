import * as cheerio from 'cheerio'
import { app } from 'electron'
import { join, extname } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { getConnection } from '../database/connection'

let faviconDir: string | null = null

/**
 * 获取 favicon 缓存目录，按需创建。
 */
export function getFaviconDir(): string {
  if (faviconDir) return faviconDir
  faviconDir = join(app.getPath('userData'), 'favicons')
  if (!existsSync(faviconDir)) {
    mkdirSync(faviconDir, { recursive: true })
  }
  return faviconDir
}

/**
 * 从 Content-Type 推断文件扩展名。
 */
function extFromContentType(contentType: string | null): string {
  if (!contentType) return '.ico'
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'image/webp': '.webp',
    'image/x-icon': '.ico',
    'image/vnd.microsoft.icon': '.ico'
  }
  const normalized = contentType.split(';')[0].trim().toLowerCase()
  return map[normalized] || '.ico'
}

/**
 * 从 URL 推断文件扩展名（兜底）。
 */
function extFromUrl(url: string): string {
  const parsed = new URL(url)
  const ext = extname(parsed.pathname).toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'].includes(ext)) {
    return ext === '.jpeg' ? '.jpg' : ext
  }
  return '.ico'
}

/**
 * 判断响应内容是否为可用的图片（排除 HTML/纯文本等错误页）。
 */
function isImageContentType(contentType: string | null): boolean {
  if (!contentType) return true
  const t = contentType.split(';')[0].trim().toLowerCase()
  return !t.startsWith('text/html') && !t.startsWith('text/plain')
}

/**
 * 尝试下载单个 favicon 候选并缓存到本地。
 * 成功返回本地协议 URL（favicon://{feedId}.ext），失败返回 null。
 */
async function tryDownloadFavicon(faviconUrl: string, feedId: number): Promise<string | null> {
  const dir = getFaviconDir()

  // 先 HEAD 拿 Content-Type 推断扩展名
  let ext = '.ico'
  let headOk = false
  try {
    const headRes = await fetch(faviconUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) })
    if (headRes.ok) {
      headOk = true
      ext = extFromContentType(headRes.headers.get('content-type'))
    }
  } catch {
    // HEAD 请求失败，忽略
  }
  // HEAD 非 ok（如 405）时按 URL 推断扩展名，避免 SVG 被存成 .ico
  if (!headOk) ext = extFromUrl(faviconUrl)

  const fileName = `${feedId}${ext}`
  const filePath = join(dir, fileName)

  try {
    const response = await fetch(faviconUrl, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return null
    if (!isImageContentType(response.headers.get('content-type'))) return null

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length === 0) return null

    writeFileSync(filePath, buffer)
    return `favicon://${fileName}`
  } catch {
    return null
  }
}

/**
 * 使用 DuckDuckGo 的 favicon 服务作为兜底方案（国内可达、免 key）。
 */
function duckduckgoFaviconFallback(baseUrl: URL): string | null {
  try {
    return `https://icons.duckduckgo.com/ip3/${baseUrl.hostname}.ico`
  } catch {
    return null
  }
}

/**
 * 构造 favicon 候选 URL 列表（按优先级，逐个尝试下载）。
 * 层级：feed.image → HTML link → /favicon.ico → DuckDuckGo 服务
 */
async function buildFaviconCandidates(
  siteUrl: string | null,
  feedImageUrl?: string
): Promise<string[]> {
  const candidates: string[] = []

  // 第 1 层：feed 自带的 image（可能是 logo/OG 图，下载阶段会校验有效性）
  if (feedImageUrl) candidates.push(feedImageUrl)

  if (!siteUrl) return candidates

  let baseUrl: URL
  try {
    baseUrl = new URL(siteUrl)
  } catch {
    return candidates
  }

  // 第 2 层：从 HTML 中解析 <link rel="icon"> 标签（使用 cheerio）
  try {
    const htmlFavicon = await fetchHtmlFavicon(baseUrl)
    if (htmlFavicon) candidates.push(htmlFavicon)
  } catch {
    // 忽略 HTML 解析失败
  }

  // 第 3 层：直接取 /favicon.ico
  candidates.push(`${baseUrl.protocol}//${baseUrl.hostname}/favicon.ico`)

  // 第 4 层：DuckDuckGo favicon 服务兜底
  const fallback = duckduckgoFaviconFallback(baseUrl)
  if (fallback) candidates.push(fallback)

  return candidates
}

/**
 * 解析并缓存订阅源的 favicon，逐个尝试候选 URL。
 * 返回最终的本地 favicon URL（favicon://{feedId}.ext）；全部失败返回 null。
 */
export async function resolveAndCacheFavicon(
  feedId: number,
  siteUrl: string | null,
  feedImageUrl?: string
): Promise<string | null> {
  const candidates = await buildFaviconCandidates(siteUrl, feedImageUrl)
  for (const url of candidates) {
    const result = await tryDownloadFavicon(url, feedId)
    if (result) return result
  }
  return null
}

/**
 * 从 HTML 页面中解析 favicon URL（使用 cheerio）。
 */
async function fetchHtmlFavicon(baseUrl: URL): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(baseUrl.origin, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml'
      },
      redirect: 'follow'
    })

    if (!response.ok) return null

    const html = await response.text()
    const $ = cheerio.load(html)

    const selectors = [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
      'link[rel="apple-touch-icon-precomposed"]',
      'link[rel*="icon"]'
    ]

    for (const selector of selectors) {
      const href = $(selector).attr('href')
      if (href) {
        try {
          return new URL(href, baseUrl.origin).href
        } catch {
          continue
        }
      }
    }

    return null
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * 更新指定订阅源的 favicon_url（数据库）。
 */
export function updateFavicon(feedId: number, faviconUrl: string | null): void {
  const db = getConnection()
  db.prepare('UPDATE feeds SET favicon_url = ? WHERE id = ?').run(faviconUrl, feedId)
}

/**
 * 解析并缓存订阅源的 favicon，更新数据库。
 * 返回最终的 favicon URL（本地协议或远程兜底）。
 */
export async function refreshFeedFavicon(feedId: number): Promise<string | null> {
  const db = getConnection()
  const feed = db.prepare('SELECT url, site_url FROM feeds WHERE id = ?').get(feedId) as
    { url: string; site_url: string | null } | undefined
  if (!feed) return null

  const siteUrl = feed.site_url || feed.url
  const finalUrl = await resolveAndCacheFavicon(feedId, siteUrl)
  updateFavicon(feedId, finalUrl)
  return finalUrl
}

/**
 * 获取订阅源的 favicon URL。
 */
export function getFavicon(feedId: number): string | null {
  const db = getConnection()
  const feed = db.prepare('SELECT favicon_url FROM feeds WHERE id = ?').get(feedId) as
    { favicon_url: string | null } | undefined
  return feed?.favicon_url || null
}
