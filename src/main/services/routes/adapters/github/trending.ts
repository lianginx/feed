import * as cheerio from 'cheerio'
import type { ParsedArticle, ParsedFeed } from '@main/services/rss'
import type { FeedAdapter } from '@main/services/routes/core/types'

/**
 * GitHub Trending 热榜。
 * 无官方 API，解析 trending 页 HTML；页面结构多年稳定（article.Box-row），RSSHub 同方案。
 */

function extractRepo(href: string | undefined): string {
  const m = (href ?? '').match(/^\/([\w.-]+\/[\w.-]+)/)
  return m ? m[1] : ''
}

/** trending 页本身是人看的 HTML 页面，抓取地址即站点首页（按语言/周期） */
function trendingPageUrl(params: Record<string, string>): string {
  const lang = (params.language ?? '').trim()
  const since = params.since || 'daily'
  const query = new URLSearchParams({ since })
  return `https://github.com/trending/${encodeURIComponent(lang)}?${query}`
}

export const githubTrending: FeedAdapter = {
  id: 'github-trending',
  name: 'GitHub Trending',
  description: 'GitHub 每日热门仓库（可选语言与周期）',
  domains: ['github.com'],
  params: [
    { key: 'language', label: '语言', placeholder: '如 rust，留空为全部语言' },
    {
      key: 'since',
      label: '周期',
      type: 'select',
      options: [
        { label: '今日', value: 'daily' },
        { label: '本周', value: 'weekly' },
        { label: '本月', value: 'monthly' }
      ]
    }
  ],
  needsBrowser: false,
  siteUrl: trendingPageUrl,
  buildUrl: trendingPageUrl,
  async parse(raw, ctx): Promise<ParsedFeed> {
    const $ = cheerio.load(raw)
    const items: ParsedArticle[] = []
    const seen = new Set<string>()
    $('article.Box-row').each((_, el) => {
      const $card = $(el)
      const repo = extractRepo($card.find('h2 a').attr('href'))
      if (!repo || seen.has(repo)) return
      seen.add(repo)
      const description = $card.find('p').first().text().trim()
      const $star = $card
        .find('a')
        .filter((_, a) => $(a).find('.octicon-star').length > 0)
        .first()
      const stars = (
        $star.length ? $star.text() : $card.find('a[href$="/stargazers"]').first().text()
      )
        .replace(/,/g, '')
        .trim()
      const $delta = $card
        .find('span')
        .filter((_, s) => /stars?\s+(today|this week|this month)/i.test($(s).text()))
        .first()
      const delta = $delta.text().replace(/,/g, '').trim()
      const summaryParts = [description, stars && `★ ${stars}`, delta].filter(Boolean)
      items.push({
        guid: `github-trending-${repo}`,
        title: repo,
        link: `https://github.com/${repo}`,
        summary: summaryParts.join(' · ') || undefined,
        contentSnippet: summaryParts.join(' · ') || undefined,
        content: description ? `<p>${$card.find('p').first().html() ?? ''}</p>` : undefined,
        contentComplete: Boolean(description)
      })
    })
    const lang = (ctx.params.language ?? '').trim()
    const sinceLabel = { daily: '今日', weekly: '本周', monthly: '本月' }[
      ctx.params.since || 'daily'
    ]
    return {
      title: `${[lang, sinceLabel, 'GitHub Trending'].filter(Boolean).join(' · ')}`,
      description: 'GitHub 热门仓库',
      link: 'https://github.com/trending',
      items
    }
  }
}
