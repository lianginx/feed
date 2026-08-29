import type { ParsedArticle, ParsedFeed } from '@main/services/rss'
import type { FeedAdapter } from '@main/services/routes/core/types'

/**
 * 知乎热榜适配器。
 *
 * 知乎反爬严格（RSSHub 同类路由已标记 strict anti-crawling）：匿名直连常被 403/风控，
 * 走 HTTP + 登录 Cookie（z_c0），登录基建复用 B 站的「用浏览器登录」通道
 * （cookieDomain/loginUrl 声明后自动出现在设置页）。
 */

/** 热榜接口返回的条目结构（按需声明字段） */
interface ZhihuHotItem {
  target?: {
    id?: number | string
    title?: string
    excerpt?: string
    url?: string
    question?: { id?: number | string }
  }
  detail_text?: string
}

interface ZhihuHotResponse {
  data?: ZhihuHotItem[]
  error?: { code?: number; message?: string }
}

/** api 链接 → web 页面链接：回答需拼 question id，专栏在 zhuanlan 域名下 */
function toWebUrl(target: NonNullable<ZhihuHotItem['target']>): string | undefined {
  const url = target.url ?? ''
  const qid = target.question?.id
  const aid = url.match(/answers\/(\d+)/)?.[1]
  if (qid && aid) return `https://www.zhihu.com/question/${qid}/answer/${aid}`
  if (/questions\/\d+/.test(url)) return url.replace('://api.zhihu.com', '://www.zhihu.com')
  const pinId = url.match(/pins\/(\d+)/)?.[1]
  if (pinId) return `https://www.zhihu.com/pin/${pinId}`
  const articleId = url.match(/articles\/(\d+)/)?.[1]
  if (articleId) return `https://zhuanlan.zhihu.com/p/${articleId}`
  return undefined
}

export const zhihuHotAdapter: FeedAdapter = {
  id: 'zhihu-hot',
  name: '知乎热榜',
  description: '知乎全站热榜（建议在设置里用浏览器登录知乎，未登录可能被风控）',
  domains: ['zhihu.com'],
  params: [],
  needsBrowser: false,
  cookieDomain: '.zhihu.com',
  loginUrl: 'https://www.zhihu.com/signin?next=%2Fhot',
  loginCookieNames: ['z_c0'],
  // 只注入登录态相关 cookie：完整浏览器 cookie 含大量指纹类字段，与抓取环境不符反而易被风控
  injectCookieNames: ['z_c0', 'd_c0'],
  headers: { Referer: 'https://www.zhihu.com/hot' },
  siteUrl: 'https://www.zhihu.com/hot',
  buildUrl: () => 'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50',
  async parse(raw: string): Promise<ParsedFeed> {
    let json: ZhihuHotResponse
    try {
      json = JSON.parse(raw) as ZhihuHotResponse
    } catch {
      // 被风控拦截时接口常返回 HTML 验证页，JSON.parse 抛错
      throw new Error('知乎接口返回异常，可能被风控，试试在设置里用浏览器登录知乎')
    }
    if (json.error?.code !== undefined) {
      throw new Error(`知乎接口异常：${json.error.message || `错误码 ${json.error.code}`}`)
    }
    const entries = Array.isArray(json.data) ? json.data : []
    if (entries.length === 0) {
      throw new Error('未获取到热榜内容，可能被风控，试试在设置里用浏览器登录知乎')
    }

    const items: ParsedArticle[] = []
    for (const entry of entries) {
      const target = entry.target
      if (!target) continue
      const title = (target.title ?? '').trim()
      const link = toWebUrl(target)
      if (!title || !link) continue
      const excerpt = (target.excerpt ?? '').trim()
      const hotText = (entry.detail_text ?? '').trim()
      const summary = [hotText && `🔥 ${hotText}`, excerpt].filter(Boolean).join('\n')
      items.push({
        guid: `zhihu-hot-${target.id ?? link}`,
        title,
        link,
        summary: summary || undefined,
        contentSnippet: summary || undefined,
        content: excerpt ? `<p>${excerpt}</p>` : undefined,
        contentComplete: Boolean(excerpt)
      })
    }
    if (items.length === 0) {
      throw new Error('未解析到热榜条目，可能页面已改版')
    }

    return {
      title: '知乎热榜',
      description: '知乎全站热榜',
      link: 'https://www.zhihu.com/hot',
      items
    }
  }
}
