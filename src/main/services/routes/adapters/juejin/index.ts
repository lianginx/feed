import { normalizeUrl } from '@main/services/routes/core/extract'
import type { ParsedArticle, ParsedFeed } from '@main/services/rss'
import type { AdapterParseContext, FeedAdapter } from '@main/services/routes/core/types'

/**
 * 掘金适配器——「参考 RSSHub 的 juejin/user/posts 与 juejin/trending 路由设计，实现自写」。
 *
 * 掘金无官方公开 API，走 web 端内部接口：无需注册、无需 API Key、无需登录；
 * 列表接口均为 POST + JSON body 传参（框架 httpMethod/buildBody 支持）。
 */

/** 文章条目结构（列表接口与推荐 feed 同构，按需声明字段） */
interface JuejinArticleItem {
  article_id?: string
  article_info?: {
    title?: string
    brief_content?: string
    cover_image?: string
    ctime?: number
  }
  author_user_info?: { user_name?: string; avatar_large?: string }
}

interface JuejinResponse<T> {
  err_no?: number
  err_msg?: string
  data?: T
}

function parseUserId(params: Record<string, string>): string {
  const raw = (params.user_id ?? '').trim()
  if (/^\d+$/.test(raw)) return raw
  return raw.match(/juejin\.cn\/user\/(\d+)/)?.[1] ?? raw
}

/** 作者名/头像取自条目自带的 author_user_info，无需额外请求 */
function mapArticleItem(item: JuejinArticleItem, guidPrefix: string): ParsedArticle | undefined {
  const info = item.article_info ?? {}
  const title = (info.title ?? '').trim()
  if (!item.article_id && !title) return undefined
  const brief = (info.brief_content ?? '').trim()
  return {
    guid: `${guidPrefix}-${item.article_id ?? title ?? brief}`,
    title: title || '(无标题)',
    link: item.article_id ? `https://juejin.cn/post/${item.article_id}` : undefined,
    summary: brief || undefined,
    contentSnippet: brief || undefined,
    coverImage: info.cover_image ? normalizeUrl(info.cover_image) : undefined,
    pubDate: info.ctime ? new Date(info.ctime * 1000).toISOString() : undefined,
    author: item.author_user_info?.user_name?.trim() || undefined
  }
}

/** 公共外壳校验；空列表抛错而不静默入库空订阅 */
function parseArticleList(raw: string, emptyHint: string): unknown[] {
  let json: JuejinResponse<unknown>
  try {
    json = JSON.parse(raw) as JuejinResponse<unknown>
  } catch {
    // 被反爬/风控拦截时接口常返回 HTML 或空内容，JSON.parse 抛错
    throw new Error('掘金接口返回异常，可能被风控')
  }
  if (typeof json.err_no === 'number' && json.err_no !== 0) {
    throw new Error(`掘金接口异常：${json.err_msg || `错误码 ${json.err_no}`}`)
  }
  const articles = Array.isArray(json.data) ? json.data : []
  if (articles.length === 0) {
    throw new Error(emptyHint)
  }
  return articles
}

export const juejinUserPosts: FeedAdapter = {
  id: 'juejin-user-posts',
  name: '掘金专栏',
  description: '掘金用户发布的文章（公开接口，无需登录）',
  domains: ['juejin.cn'],
  params: [
    {
      key: 'user_id',
      label: '用户 ID',
      required: true,
      placeholder: '如 3456599838764552',
      description: '个人主页地址 juejin.cn/user/ 后面的那串数字，也支持直接粘贴主页地址'
    }
  ],
  needsBrowser: false,
  headers: { 'Content-Type': 'application/json' },
  httpMethod: 'POST',
  siteUrl: (params) => `https://juejin.cn/user/${parseUserId(params)}/posts`,
  buildUrl: () => 'https://api.juejin.cn/content_api/v1/article/query_list',
  buildBody: (params) =>
    JSON.stringify({ user_id: parseUserId(params), cursor: '0', limit: 20, sort_type: 2 }),
  async parse(raw: string, ctx: AdapterParseContext): Promise<ParsedFeed> {
    const articles = parseArticleList(
      raw,
      '未获取到文章列表，请确认用户 ID 或稍后重试'
    ) as JuejinArticleItem[]

    const authorName = articles[0]?.author_user_info?.user_name?.trim() || ''
    const authorAvatar = articles[0]?.author_user_info?.avatar_large
      ? normalizeUrl(articles[0].author_user_info.avatar_large)
      : undefined

    const items = articles
      .map((it) => mapArticleItem(it, 'juejin'))
      .filter((it): it is ParsedArticle => it !== undefined)

    return {
      title: authorName ? `${authorName} 的掘金专栏` : '掘金专栏',
      description: '掘金用户文章',
      link: `https://juejin.cn/user/${parseUserId(ctx.params)}/posts`,
      image: authorAvatar ? { url: authorAvatar } : undefined,
      items
    }
  }
}

/** 推荐 feed 无今日档，仅本周/本月/历史三档（RSSHub 同参数） */
const HOT_SORT_TYPES = { weekly: 7, monthly: 30, historical: 0 } as const

export const juejinHot: FeedAdapter = {
  id: 'juejin-hot',
  name: '掘金热榜',
  description: '掘金最热文章（本周/本月/历史）',
  domains: ['juejin.cn'],
  params: [
    {
      key: 'since',
      label: '周期',
      type: 'select',
      options: [
        { label: '本周最热', value: 'weekly' },
        { label: '本月最热', value: 'monthly' },
        { label: '历史最热', value: 'historical' }
      ]
    }
  ],
  needsBrowser: false,
  headers: { 'Content-Type': 'application/json' },
  httpMethod: 'POST',
  siteUrl: 'https://juejin.cn/hot/articles',
  buildUrl: () => 'https://api.juejin.cn/recommend_api/v1/article/recommend_all_feed',
  buildBody: (params) =>
    JSON.stringify({
      cursor: '0',
      id_type: 2,
      limit: 20,
      sort_type:
        HOT_SORT_TYPES[params.since as keyof typeof HOT_SORT_TYPES] ?? HOT_SORT_TYPES.weekly
    }),
  async parse(raw: string, ctx: AdapterParseContext): Promise<ParsedFeed> {
    // 推荐 feed 混有沸点等非文章条目，仅 item_type===2 为文章
    const entries = parseArticleList(raw, '未获取到热榜内容，请稍后重试')
    const items = entries
      .map((entry) => entry as { item_type?: number; item_info?: JuejinArticleItem })
      .filter((entry) => entry.item_type === 2 && entry.item_info)
      .map((entry) => mapArticleItem(entry.item_info as JuejinArticleItem, 'juejin-hot'))
      .filter((it): it is ParsedArticle => it !== undefined)

    const sinceLabel =
      { weekly: '本周', monthly: '本月', historical: '历史' }[
        ctx.params.since as keyof typeof HOT_SORT_TYPES
      ] ?? '本周'

    return {
      title: `掘金热榜 · ${sinceLabel}`,
      description: '掘金最热文章',
      link: 'https://juejin.cn/hot/articles',
      items
    }
  }
}
