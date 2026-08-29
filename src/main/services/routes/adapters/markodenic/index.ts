import * as cheerio from 'cheerio'
import type { ParsedArticle, ParsedFeed } from '@main/services/rss'
import type { FeedAdapter } from '@main/services/routes/core/types'

const NEWSLETTER_URL = 'https://markodenic.tech/newsletter/'
const MONTHS = new Map([
  ['Jan', 0],
  ['Feb', 1],
  ['Mar', 2],
  ['Apr', 3],
  ['May', 4],
  ['Jun', 5],
  ['Jul', 6],
  ['Aug', 7],
  ['Sep', 8],
  ['Oct', 9],
  ['Nov', 10],
  ['Dec', 11]
])

function absoluteUrl(href: string, base: string): string | undefined {
  try {
    const url = new URL(href, base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

function parseDate(text: string): string | undefined {
  const match = text.match(/^([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})$/)
  if (!match) return undefined
  const month = MONTHS.get(match[1])
  if (month === undefined) return undefined
  const year = Number(match[3])
  const day = Number(match[2])
  const date = new Date(Date.UTC(year, month, day, 12))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    return undefined
  }
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

export const markodenicNewsletterAdapter: FeedAdapter = {
  id: 'markodenic-newsletter',
  name: 'Marko Denic Newsletter',
  description: 'Marko Denic 的 Web 开发技巧与资源',
  domains: ['markodenic.tech'],
  params: [],
  needsBrowser: false,
  siteUrl: NEWSLETTER_URL,
  buildUrl: () => NEWSLETTER_URL,
  async parse(raw: string, ctx): Promise<ParsedFeed> {
    const $ = cheerio.load(raw)
    const items: ParsedArticle[] = []
    const seen = new Set<string>()

    $('.issues-section .issue-item').each((_, element) => {
      const issue = $(element)
      const href = issue.attr('href')
      const link = href ? absoluteUrl(href, ctx.url) : undefined
      const title = issue.find('h3').first().text().trim()
      if (!link || !title || seen.has(link)) return
      seen.add(link)

      const summary = issue.find('p').first().text().replace(/\s+/g, ' ').trim()
      const contentHtml = issue.find('p').first().html()?.trim()
      const dateText = issue.find('.issue-item__meta').first().text().trim()

      items.push({
        guid: link,
        title,
        link,
        content: contentHtml ? `<p>${contentHtml}</p>` : undefined,
        contentSnippet: summary || undefined,
        summary: summary || undefined,
        pubDate: parseDate(dateText),
        author: 'Marko Denic'
      })
    })

    if (items.length === 0) {
      throw new Error('Marko Denic Newsletter 页面未找到文章，可能已改版')
    }

    const imageSrc = $('header .nav-logo img').first().attr('src')
    const imageUrl = imageSrc ? absoluteUrl(imageSrc, ctx.url) : undefined
    return {
      title: 'Marko Denic Newsletter',
      description: 'Real-life web dev tips & resources, directly to your inbox.',
      link: NEWSLETTER_URL,
      image: imageUrl ? { url: imageUrl } : undefined,
      items
    }
  }
}
