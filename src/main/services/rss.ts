import Parser from 'rss-parser'

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Feed/1.0 (RSS Reader)'
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
    items: (feed.items || []).map((item) => ({
      guid: item.guid || item.link || item.title || '',
      title: item.title || '(无标题)',
      link: item.link,
      content: item.content,
      contentSnippet: item.contentSnippet,
      summary: item.summary || item.contentSnippet,
      pubDate: item.pubDate || item.isoDate,
      author: item.creator || item.author
    }))
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
