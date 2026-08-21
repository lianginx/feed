import * as cheerio from 'cheerio'
import { extname } from 'path'
import { createHash } from 'crypto'
import { getCacheFile, listCacheFiles, writeCacheFile } from './cache'
import { getConnection } from '@main/database/connection'

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

function extFromUrl(url: string): string {
  const parsed = new URL(url)
  const ext = extname(parsed.pathname).toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'].includes(ext)) {
    return ext === '.jpeg' ? '.jpg' : ext
  }
  return '.ico'
}

function isImageContentType(contentType: string | null): boolean {
  if (!contentType) return true
  const t = contentType.split(';')[0].trim().toLowerCase()
  return !t.startsWith('text/html') && !t.startsWith('text/plain')
}

function urlNameForSource(sourceUrl: string): string {
  return Buffer.from(sourceUrl, 'utf8').toString('base64url')
}

export function fileNameForSource(sourceUrl: string): string {
  return createHash('sha1').update(sourceUrl).digest('hex').slice(0, 24)
}

export function parseFaviconName(name: string): { sourceUrl: string; ext: string } | undefined {
  const m = name.match(/^([A-Za-z0-9_-]+)\.(png|jpg|jpeg|gif|svg|webp|ico)$/)
  if (!m) return undefined
  try {
    const decoded = Buffer.from(m[1], 'base64url').toString('utf8')
    if (/^https?:\/\//i.test(decoded)) return { sourceUrl: decoded, ext: m[2] }
  } catch {
    void 0
  }
  return undefined
}

async function tryDownloadFaviconTo(
  faviconUrl: string,
  fileKey: string,
  urlName: string,
  urlPrefix: string
): Promise<string | null> {
  let ext = '.ico'
  let headOk = false
  try {
    const headRes = await fetch(faviconUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) })
    if (headRes.ok) {
      headOk = true
      ext = extFromContentType(headRes.headers.get('content-type'))
    }
  } catch {
    void 0
  }
  if (!headOk) ext = extFromUrl(faviconUrl)

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

function duckduckgoFaviconFallback(baseUrl: URL): string | null {
  try {
    return `https://icons.duckduckgo.com/ip3/${baseUrl.hostname}.ico`
  } catch {
    return null
  }
}

async function buildFaviconCandidates(
  siteUrl: string | null,
  feedImageUrl?: string
): Promise<string[]> {
  const candidates: string[] = []

  if (feedImageUrl) candidates.push(feedImageUrl)

  if (!siteUrl) return candidates

  let baseUrl: URL
  try {
    baseUrl = new URL(siteUrl)
  } catch {
    return candidates
  }

  try {
    const htmlFavicon = await fetchHtmlFavicon(baseUrl)
    if (htmlFavicon) candidates.push(htmlFavicon)
  } catch {
    void 0
  }

  candidates.push(`${baseUrl.protocol}//${baseUrl.hostname}/favicon.ico`)

  const fallback = duckduckgoFaviconFallback(baseUrl)
  if (fallback) candidates.push(fallback)

  return candidates
}

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

export function updateFavicon(feedId: number, faviconUrl: string | null): void {
  const db = getConnection()
  db.prepare('UPDATE feeds SET favicon_url = ? WHERE id = ?').run(faviconUrl, feedId)
}

export async function refreshFeedFavicon(feedId: number): Promise<string | null> {
  const db = getConnection()
  const feed = db
    .prepare('SELECT url, site_url, favicon_url FROM feeds WHERE id = ?')
    .get(feedId) as unknown as
    { url: string; site_url: string | null; favicon_url: string | null } | undefined
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

export function getFavicon(feedId: number): string | null {
  const db = getConnection()
  const feed = db.prepare('SELECT favicon_url FROM feeds WHERE id = ?').get(feedId) as
    { favicon_url: string | null } | undefined
  return feed?.favicon_url || null
}

export function getAdapterFaviconCached(adapterId: string): string | null {
  const found = listCacheFiles('favicon').find(
    (e) =>
      e.name.startsWith(`routes/${adapterId}.`) && /\.(png|jpg|jpeg|gif|svg|webp|ico)$/.test(e.name)
  )
  return found ? `favicon://routes/${found.name.slice('routes/'.length)}` : null
}

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
