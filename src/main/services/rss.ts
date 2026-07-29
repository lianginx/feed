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
    const message = error instanceof Error ? error.message : '解析失败'
    return { valid: false, error: message }
  }
}
