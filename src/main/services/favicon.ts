import * as cheerio from 'cheerio'
import { extname } from 'path'
import { createHash } from 'crypto'
import { getCacheFile, listCacheFiles, writeCacheFile } from './cache'
import { getConnection } from '@main/database/connection'

/**
 * favicon 缓存采用「内容寻址」：
 * - favicon_url = favicon://{base64url(源URL)}.{ext}：源 URL 可逆内嵌，缺失时可忠实重建（如频道头像）
 * - 磁盘文件 = {sha1(源URL)前24位hex}.{ext}：定长命名，避免长 URL 的 base64 超过文件名长度上限
 * 同一源的多个订阅共享同一缓存文件。
 */

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

/** favicon_url 中使用的源名字（base64url，可逆解码回源 URL） */
function urlNameForSource(sourceUrl: string): string {
  return Buffer.from(sourceUrl, 'utf8').toString('base64url')
}

/** 磁盘文件名（定长 hash，避免长 URL 的 base64 超过文件名字长上限） */
export function fileNameForSource(sourceUrl: string): string {
  return createHash('sha1').update(sourceUrl).digest('hex').slice(0, 24)
}

/**
 * 解析 favicon 缓存名（favicon:// 之后的部分）。
 * 新格式：{base64url(源URL)}.{ext}；解码结果必须是 http(s) URL 才视为有效源。
 */
export function parseFaviconName(name: string): { sourceUrl: string; ext: string } | undefined {
  const m = name.match(/^([A-Za-z0-9_-]+)\.(png|jpg|jpeg|gif|svg|webp|ico)$/)
  if (!m) return undefined
  try {
    const decoded = Buffer.from(m[1], 'base64url').toString('utf8')
    if (/^https?:\/\//i.test(decoded)) return { sourceUrl: decoded, ext: m[2] }
  } catch {
    // 忽略解码失败
  }
  return undefined
}

/**
 * 尝试下载单个 favicon 候选并缓存到本地（统一缓存 favicon 命名空间）。
 * fileKey 为磁盘文件名（不含扩展名）；urlName 为 favicon_url 中使用的名字；
 * 内容寻址时 fileKey=hash、urlName=base64；内置路由两者同为 routes/{adapterId}。
 * 成功返回本地协议 URL，失败返回 null。命中缓存则跳过下载。
 */
async function tryDownloadFaviconTo(
  faviconUrl: string,
  fileKey: string,
  urlName: string,
  urlPrefix: string
): Promise<string | null> {
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

  // 内容寻址：文件存在即代表该源已缓存，跳过下载
  if (getCacheFile('favicon', `${fileKey}${ext}`)) {
    return `${urlPrefix}${urlName}${ext}`
  }

  try {
    const response = await fetch(faviconUrl, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return null
    if (!isImageContentType(response.headers.get('content-type'))) return null

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length === 0) return null

    writeCacheFile('favicon', `${fileKey}${ext}`, buffer)
    return `${urlPrefix}${urlName}${ext}`
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

  // 第 1 层：feed 自带的 image（可能是 logo/OG 图/频道头像，下载阶段会校验有效性）
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
 * 解析并缓存订阅源 favicon，逐个尝试候选 URL（内容寻址）。
 * 返回最终的本地 favicon URL（favicon://{base64url(源URL)}.{ext}）；全部失败返回 null。
 */
export async function resolveAndCacheFavicon(
  siteUrl: string | null,
  feedImageUrl?: string
): Promise<string | null> {
  const candidates = await buildFaviconCandidates(siteUrl, feedImageUrl)
  for (const url of candidates) {
    const result = await tryDownloadFaviconTo(
      url,
      fileNameForSource(url),
      urlNameForSource(url),
      'favicon://'
    )
    if (result) return result
  }
  return null
}

/**
 * 按源 URL 确保 favicon 已缓存：文件（hash 命名）存在直接命中；
 * 缺失时按源重新下载（自愈），并写回 hash 命名的缓存文件。
 */
export async function ensureCachedFaviconBySource(
  sourceUrl: string,
  fileKey: string
): Promise<boolean> {
  if (getCacheFile('favicon', fileKey)) return true
  try {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return false
    if (!isImageContentType(response.headers.get('content-type'))) return false
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length === 0) return false
    writeCacheFile('favicon', fileKey, buffer)
    return true
  } catch {
    return false
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
 * 刷新订阅源 favicon：
 * - 新格式（源已内嵌）：按源重新获取，忠实重建（如频道头像）；
 * - 旧/未知格式：按站点重新解析并升级为新格式。
 */
export async function refreshFeedFavicon(feedId: number): Promise<string | null> {
  const db = getConnection()
  const feed = db
    .prepare('SELECT url, site_url, favicon_url FROM feeds WHERE id = ?')
    .get(feedId) as { url: string; site_url: string | null; favicon_url: string | null } | undefined
  if (!feed) return null

  const name = feed.favicon_url?.startsWith('favicon://')
    ? feed.favicon_url.slice('favicon://'.length)
    : undefined
  const parsed = name ? parseFaviconName(name) : undefined
  if (parsed) {
    const fileKey = `${fileNameForSource(parsed.sourceUrl)}.${parsed.ext}`
    await ensureCachedFaviconBySource(parsed.sourceUrl, fileKey)
    return feed.favicon_url
  }

  const siteUrl = feed.site_url || feed.url
  const finalUrl = await resolveAndCacheFavicon(siteUrl)
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

/**
 * 查找内置路由 favicon 的本地缓存（favicon://routes/{adapterId}.ext）。
 * 命中返回本地协议 URL，未命中返回 null。
 */
export function getAdapterFaviconCached(adapterId: string): string | null {
  const found = listCacheFiles('favicon').find(
    (e) =>
      e.name.startsWith(`routes/${adapterId}.`) && /\.(png|jpg|jpeg|gif|svg|webp|ico)$/.test(e.name)
  )
  return found ? `favicon://routes/${found.name.slice('routes/'.length)}` : null
}

/**
 * 解析并缓存内置路由的 favicon，逐个域名尝试候选 URL（不依赖 feedId）。
 * 已有本地缓存则直接返回（避免每次打开窗口都重新联网抓取远程源站）；
 * 返回 favicon://routes/{adapterId}.ext；全部失败返回 null。
 */
export async function resolveAndCacheAdapterFavicon(
  adapterId: string,
  domains: string[]
): Promise<string | null> {
  const cached = getAdapterFaviconCached(adapterId)
  if (cached) return cached

  for (const domain of domains) {
    const candidates = await buildFaviconCandidates(`https://${domain}`)
    for (const url of candidates) {
      const result = await tryDownloadFaviconTo(
        url,
        `routes/${adapterId}`,
        adapterId,
        'favicon://routes/'
      )
      if (result) return result
    }
  }
  return null
}
