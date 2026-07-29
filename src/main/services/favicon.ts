import * as cheerio from 'cheerio'
import { app } from 'electron'
import { join, extname } from 'path'
import { existsSync, mkdirSync, createWriteStream } from 'fs'
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
 * 下载 favicon 并缓存到本地。
 * 返回本地协议 URL（favicon://{feedId}.ext），下载失败则返回远程 URL 的 data URI 兜底或 null。
 */
export async function downloadAndCacheFavicon(
  faviconUrl: string | null,
  feedId: number
): Promise<string | null> {
  if (!faviconUrl) return null

  const dir = getFaviconDir()

  // 先尝试 HEAD 请求获取 Content-Type
  let ext = '.ico'
  try {
    const headRes = await fetch(faviconUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) })
    if (headRes.ok) {
      ext = extFromContentType(headRes.headers.get('content-type'))
    }
  } catch {
    ext = extFromUrl(faviconUrl)
  }

  const fileName = `${feedId}${ext}`
  const filePath = join(dir, fileName)

  try {
    const response = await fetch(faviconUrl, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return faviconUrl // 回退到远程 URL

    const buffer = Buffer.from(await response.arrayBuffer())
    createWriteStream(filePath).write(buffer)

    return `favicon://${fileName}`
  } catch {
    // 下载失败，返回远程 URL 作为兜底
    return faviconUrl
  }
}

/**
 * 多层降级解析 favicon URL。
 * 层级：feed.image → HTML link → /favicon.ico → Google 服务 → null
 */
export async function resolveFavicon(
  siteUrl: string | null,
  feedImageUrl?: string
): Promise<string | null> {
  // 第 1 层：feed 自带的图片
  if (feedImageUrl) return feedImageUrl

  if (!siteUrl) return null

  let baseUrl: URL
  try {
    baseUrl = new URL(siteUrl)
  } catch {
    return null
  }

  try {
    // 第 2 层：从 HTML 中解析 <link rel="icon"> 标签（使用 cheerio）
    const htmlFavicon = await fetchHtmlFavicon(baseUrl)
    if (htmlFavicon) return htmlFavicon
  } catch {
    // 忽略 HTML 解析失败
  }

  // 第 3 层：直接取 /favicon.ico
  const icoUrl = `${baseUrl.protocol}//${baseUrl.hostname}/favicon.ico`
  try {
    const res = await fetch(icoUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) })
    if (res.ok) return icoUrl
  } catch {
    // 忽略 HEAD 请求失败
  }

  // 第 4 层：Google favicon 服务兜底
  return googleFaviconFallback(baseUrl)
}

/**
 * 使用 Google 的 favicon 服务作为兜底方案。
 */
function googleFaviconFallback(baseUrl: URL): string | null {
  try {
    const domain = baseUrl.hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
  } catch {
    return null
  }
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
  const remoteUrl = await resolveFavicon(siteUrl)
  const finalUrl = await downloadAndCacheFavicon(remoteUrl, feedId)
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
