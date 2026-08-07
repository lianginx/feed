import type { ParsedArticle, ParsedFeed } from '../../../rss'
import type { FeedAdapter } from '../../core/types'

/**
 * V2EX 热帖适配器——「参考 RSSHub 的 V2EX 路由设计，自写实现」。
 *
 * 设计借鉴（AGPL 允许借鉴思路，不复制代码）：
 * - 元数据声明式：路由类型 → API 路径 + 标题（对应 RSSHub 的 typeMap 思路）
 * - 抓取走 V2EX 官方公开 JSON API，无需登录、无需浏览器
 * 实现全部自写。
 */

/** V2EX 官方公开 JSON API 返回的主题结构（按需声明字段） */
interface V2exTopic {
  id: number
  title: string
  url: string
  content: string
  content_rendered: string
  created: number
  member: { username: string }
}

/** 将 V2EX 主题映射为项目统一结构 ParsedArticle */
function mapArticle(topic: V2exTopic): ParsedArticle {
  return {
    guid: `v2ex-${topic.id}`,
    title: topic.title,
    link: topic.url,
    // 正文用渲染后的 HTML；V2EX 无封面图
    content: topic.content_rendered || undefined,
    // 摘要用纯文本 content
    contentSnippet: topic.content,
    summary: topic.content,
    pubDate: new Date(topic.created * 1000).toISOString(),
    author: topic.member.username
  }
}

/**
 * V2EX 热帖适配器。
 * 纯 HTTP（needsBrowser: false）、无参数、无登录需求。
 */
export const v2exAdapter: FeedAdapter = {
  id: 'v2ex-hot',
  name: 'V2EX 热帖',
  description: 'V2EX 最热主题',
  domains: ['v2ex.com'],
  params: [],
  needsBrowser: false,
  buildUrl: () => 'https://www.v2ex.com/api/topics/hot.json',
  // V2EX 无需上下文（无参数/无分页），只消费 raw 即可
  async parse(raw: string): Promise<ParsedFeed> {
    const topics = JSON.parse(raw) as V2exTopic[]
    return {
      title: 'V2EX - 最热主题',
      description: 'V2EX - 最热主题',
      link: 'https://www.v2ex.com',
      items: topics.map(mapArticle)
    }
  }
}
