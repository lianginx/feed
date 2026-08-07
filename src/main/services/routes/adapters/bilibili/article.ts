import type { ParsedArticle, ParsedFeed } from '../../../rss'
import type { FeedAdapter } from '../../core/types'

/** B 站 opus 专栏 feed 返回的条目结构（按需声明） */
interface BiliOpusItem {
  content?: string
  jump_url?: string
  opus_id?: string | number
  cover?: { url?: string }
}

/** 补全协议头：//xxx → https://xxx */
function normalizeUrl(url: string): string {
  return url.startsWith('//') ? 'https:' + url : url
}

/** 取 content 第一行作为标题（专栏列表接口无 title 字段） */
function extractTitle(content: string): string {
  const firstLine = content.split('\n').find((line) => line.trim())
  return (firstLine ?? content).trim().slice(0, 60) || '(无标题)'
}

/**
 * B 站 UP 主专栏（图文）。
 * 纯 HTTP：调官方公开 opus/feed/space 接口 + Referer，无需登录、无需浏览器。
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
  async parse(raw: string): Promise<ParsedFeed> {
    const json = JSON.parse(raw) as { data?: { items?: BiliOpusItem[] } }
    const items = (json?.data?.items ?? []).map((item): ParsedArticle => {
      const content = (item.content ?? '').trim()
      return {
        guid: `bilibili-${item.opus_id ?? item.jump_url ?? content}`,
        title: extractTitle(content),
        link: item.jump_url ? normalizeUrl(item.jump_url) : undefined,
        summary: content || undefined,
        contentSnippet: content || undefined,
        coverImage: item.cover?.url
      }
    })
    return {
      title: 'B 站 UP 主专栏',
      description: 'B 站 UP 主图文',
      link: 'https://space.bilibili.com/',
      items
    }
  }
}
