import { getConnection } from '../database/connection'

/**
 * 多层降级获取 favicon URL。
 * 层级：feed.image → HTML link → /favicon.ico → null
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
    // 第 2 层：尝试从 HTML 中解析 <link rel="icon"> 标签
    const htmlFavicon = await fetchHtmlFavicon(baseUrl)
    if (htmlFavicon) return htmlFavicon
  } catch {
    // 忽略 HTML 解析失败
  }

  // 第 3 层：直接取 /favicon.ico
  return `${baseUrl.protocol}//${baseUrl.hostname}/favicon.ico`
}

/**
 * 从 HTML 页面中解析 favicon URL。
 * 查找 <link rel="icon">、<link rel="shortcut icon">、<link rel="apple-touch-icon"> 等标签。
 */
async function fetchHtmlFavicon(baseUrl: URL): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch(`${baseUrl.protocol}//${baseUrl.hostname}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Feed/1.0',
        Accept: 'text/html'
      }
    })

    if (!response.ok) return null

    const html = await response.text()

    // 解析 <link rel="icon" href="..."> 或 <link rel="shortcut icon" href="...">
    const iconMatch = html.match(
      /<link[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["'][^>]*>/i
    )
    // 也尝试 href 在 rel 前面的情况
    const iconMatch2 = html.match(
      /<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*>/i
    )

    const href = iconMatch?.[1] || iconMatch2?.[1]
    if (!href) return null

    // 处理相对路径
    try {
      return new URL(href, baseUrl.origin).href
    } catch {
      return null
    }
  } finally {
    clearTimeout(timeout)
  }
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
