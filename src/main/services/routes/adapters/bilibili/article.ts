import * as cheerio from 'cheerio'
import { fetchWithTimeout, BROWSER_USER_AGENT } from '../../../http'
import type { ParsedArticle, ParsedFeed } from '../../../rss'
import type { AdapterParseContext, FeedAdapter } from '../../core/types'

/** B 站 opus 专栏 feed 返回的条目结构（按需声明） */
interface BiliOpusItem {
  content?: string
  jump_url?: string
  opus_id?: string | number
  cover?: { url?: string }
}

/** 补全协议头：//xxx 与 http:// 都转 https://（项目 CSP 的 img-src 只放行 https） */
function normalizeUrl(url: string): string {
  if (url.startsWith('//')) return 'https:' + url
  if (url.startsWith('http://')) return 'https://' + url.slice(7)
  return url
}

/** 取 content 第一行作为标题（专栏列表接口无 title 字段） */
function extractTitle(content: string): string {
  const firstLine = content.split('\n').find((line) => line.trim())
  return (firstLine ?? content).trim().slice(0, 60) || '(无标题)'
}

/** 解析 B 站 opus 页时间文本（'2019年11月11日 08:50'）为 ISO */
function parseBiliDateZh(text: string): string | undefined {
  const m = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})/)
  if (!m) return undefined
  const [, y, mo, d, h, mi] = m
  return new Date(
    `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi}:00+08:00`
  ).toISOString()
}

/** 抓 opus 详情页拿发布时间与完整正文（RSSHub 同方案：列表接口无时间，逐篇抓页面） */
async function fetchOpusDetail(url: string): Promise<{ pubDate?: string; content?: string }> {
  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT, Referer: 'https://space.bilibili.com/' }
    })
    if (!res.ok) return {}
    const $ = cheerio.load(await res.text())
    const pubText = $('.opus-module-author__pub__text').text().replace('编辑于 ', '').trim()
    const content = $('.opus-module-content').html()
    return {
      pubDate: pubText ? parseBiliDateZh(pubText) : undefined,
      content: content ? String(content).trim() : undefined
    }
  } catch {
    return {}
  }
}

/** 调用户卡片接口拿 UP 主名/简介/头像（x/web-interface/card 匿名可用；x/space/acc/info 易被限流 -799） */
async function fetchUpInfo(uid: string): Promise<{ name?: string; sign?: string; face?: string }> {
  try {
    const res = await fetchWithTimeout(
      `https://api.bilibili.com/x/web-interface/card?mid=${encodeURIComponent(uid)}`,
      {
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          Referer: 'https://space.bilibili.com/'
        }
      }
    )
    if (!res.ok) return {}
    const json = (await res.json()) as {
      code?: number
      data?: { card?: { name?: string; sign?: string; face?: string } }
    }
    if (json.code !== 0) return {}
    return json.data?.card ?? {}
  } catch {
    return {}
  }
}

/**
 * B 站 UP 主专栏（图文）。
 * 纯 HTTP：调官方公开 opus/feed/space 接口 + Referer，无需登录、无需浏览器。
 * UP 主名/头像经 fetchMeta 调 x/web-interface/card 补充；
 * 逐篇抓 opus 详情页补发布时间与完整正文（RSSHub 同方案）。
 * （参考 RSSHub /bilibili/user/article 设计，实现自写）
 */
export const bilibiliUserArticle: FeedAdapter = {
  id: 'bilibili-user-article',
  name: 'B 站 UP 主专栏',
  description: 'B 站 UP 主图文（官方公开 API，无需登录）',
  domains: ['bilibili.com'],
  params: [{ key: 'uid', label: 'UP 主 ID', required: true, placeholder: '如 928915' }],
  needsBrowser: false,
  headers: { Referer: 'https://space.bilibili.com/' },
  buildUrl: (params) =>
    `https://api.bilibili.com/x/polymer/web-dynamic/v1/opus/feed/space?host_mid=${params.uid ?? ''}&page=1`,
  async fetchMeta(params) {
    const info = await fetchUpInfo(params.uid ?? '')
    return {
      title: info.name ? `${info.name} 的专栏` : undefined,
      description: info.sign || undefined,
      imageUrl: info.face ? normalizeUrl(info.face) : undefined
    }
  },
  async parse(raw: string, ctx: AdapterParseContext): Promise<ParsedFeed> {
    const json = JSON.parse(raw) as { data?: { items?: BiliOpusItem[] } }
    const items: ParsedArticle[] = []
    for (const item of json?.data?.items ?? []) {
      const content = (item.content ?? '').trim()
      const url = item.jump_url ? normalizeUrl(item.jump_url) : undefined
      const cover = item.cover?.url ? normalizeUrl(item.cover.url) : undefined
      // 逐篇抓详情页补发布时间与完整正文（RSSHub 同方案；串行+失败跳过，避免并发限流）
      const detail = url ? await fetchOpusDetail(url) : {}
      const detailContent =
        detail.content || (cover ? `<img src="${cover}" />\n\n${content}` : content)
      items.push({
        guid: `bilibili-${item.opus_id ?? item.jump_url ?? content}`,
        title: extractTitle(content),
        link: url,
        summary: content || undefined,
        content: detailContent || undefined,
        contentSnippet: content || undefined,
        coverImage: cover,
        pubDate: detail.pubDate
      })
    }
    const uid = ctx.params.uid ?? ''
    return {
      title: 'B 站 UP 主专栏',
      description: 'B 站 UP 主图文',
      link: `https://space.bilibili.com/${uid}/`,
      items
    }
  }
}
