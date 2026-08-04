import Parser from 'rss-parser'
import { extractCoverImage } from './cover'

type CustomItem = {
  creator?: string
  author?: string
  enclosure?: { url?: string; type?: string }
  'media:thumbnail'?: { $?: { url?: string } }
  'media:content'?: { $?: { url?: string; medium?: string; type?: string } }
}

const parser = new Parser<Record<string, unknown>, CustomItem>({
  timeout: 15000,
  headers: {
    'User-Agent': 'Feed/1.0 (RSS Reader)'
  },
  customFields: {
    item: [
      ['media:thumbnail', 'media:thumbnail', { keepArray: false }],
      ['media:content', 'media:content', { keepArray: false }]
    ]
  }
})

export interface ParsedFeed {
  title: string
  description?: string
  link?: string
  image?: { url?: string; title?: string }
  items: ParsedArticle[]
}

export interface ParsedArticle {
  guid: string
  title: string
  link?: string
  content?: string
  contentSnippet?: string
  summary?: string
  pubDate?: string
  author?: string
  coverImage?: string
}

/**
 * 将订阅源拉取/解析错误转换为友好提示文本。
 * 原始技术细节（错误 code/message）会记录到日志，供排查使用。
 */
export function toFriendlyFeedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const code =
    error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined

  // 域名解析失败
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return '域名解析失败，请检查订阅源地址是否正确'
  }
  // 连接被拒绝
  if (code === 'ECONNREFUSED') {
    return '连接被拒绝，网站可能已下线或屏蔽了访问'
  }
  // 连接被重置/中断
  if (code === 'ECONNRESET' || /socket hang up/i.test(message)) {
    return '网络连接被中断，请检查网络后重试'
  }
  // 网络不可达/离线
  if (code === 'ENETUNREACH' || code === 'EHOSTUNREACH' || code === 'ENETDOWN') {
    return '网络不可达，请检查网络连接'
  }
  // TLS/证书错误
  if (
    code === 'CERT_HAS_EXPIRED' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    /certificate|TLS|SSL/i.test(message)
  ) {
    return '网站证书校验失败，可能存在安全风险'
  }
  // 超时
  if (code === 'ETIMEDOUT' || /timed out|timeout|timeout of/i.test(message)) {
    return '请求超时，请检查网络或稍后重试'
  }
  // HTTP 状态码错误
  const statusMatch = message.match(/Status code (\d+)/)
  if (statusMatch) {
    const status = Number(statusMatch[1])
    if (status >= 500) {
      return '服务器暂时不可用（' + status + '），请稍后重试'
    }
    return '订阅源地址可能已失效（' + status + '），请检查地址是否正确'
  }
  // XML/解析错误
  if (/parse|XML|Feed not recognized|Unable to parse/i.test(message)) {
    return '内容解析失败，可能不是有效的 RSS 订阅源'
  }

  // 兜底：保留原始信息（含 code）以便定位问题
  return '刷新失败：' + message
}

/**
 * 解析 RSS/Atom 订阅源。
 */
export async function parseFeed(url: string): Promise<ParsedFeed> {
  const feed = await parser.parseURL(url)

  return {
    title: feed.title || url,
    description: feed.description,
    link: feed.link,
    image: feed.image ? { url: feed.image.url, title: feed.image.title } : undefined,
    items: (feed.items || []).map((item) => {
      const parsedItem = {
        guid: item.guid || item.link || item.title || '',
        title: item.title || '(无标题)',
        link: item.link,
        content: item.content,
        contentSnippet: item.contentSnippet,
        summary: item.summary || item.contentSnippet,
        pubDate: item.pubDate || item.isoDate,
        author: item.creator || item.author,
        coverImage: undefined as string | undefined
      }
      parsedItem.coverImage = extractCoverImage(item as CustomItem)
      return parsedItem
    })
  }
}

/**
 * 验证 URL 是否为有效的 RSS/Atom 订阅源。
 */
export async function validateFeed(
  url: string
): Promise<{ valid: boolean; title?: string; error?: string }> {
  try {
    const feed = await parseFeed(url)
    return { valid: true, title: feed.title }
  } catch (error) {
    return { valid: false, error: toFriendlyFeedError(error) }
  }
}
