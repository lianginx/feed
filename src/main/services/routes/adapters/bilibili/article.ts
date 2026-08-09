import * as cheerio from 'cheerio'
import { fetchWithTimeout, BROWSER_USER_AGENT } from '../../../http'
import { normalizeUrl } from '../../core/extract'
import type { ParsedArticle, ParsedFeed } from '../../../rss'
import type { AdapterParseContext, FeedAdapter } from '../../core/types'

/** B 站 opus 专栏 feed 返回的条目结构（按需声明） */
interface BiliOpusItem {
  content?: string
  jump_url?: string
  opus_id?: string | number
  cover?: { url?: string }
}

/**
 * 去掉 B 站图床地址的缩放/转码参数后缀（如 @264w_264h_1e_1c.avif、@120w_120h_1c），
 * 取原图地址。不硬编码后缀：@ 起全部截断，无 @ 原样返回，兼容各类尺寸参数。
 */
function stripImageScale(url: string): string {
  const i = url.indexOf('@')
  return i === -1 ? url : url.slice(0, i)
}

/** B 站正文在 span 内用 \n 分段，转 <br> 保留换行（HTML 渲染默认折叠空白） */
function newlineToBr(text: string): string {
  return text.replace(/\r?\n/g, '<br>')
}

/** B 站接口业务错误码 → 友好提示（风控/限流等常见场景，避免静默返回空订阅） */
function bilibiliApiError(code: number, message?: string): Error {
  const reasons: Record<number, string> = {
    [-101]: '账号未登录',
    [-352]: '触发风控校验',
    [-412]: '请求被拦截',
    [-799]: '请求过于频繁'
  }
  const reason = reasons[code] ?? (message || `错误码 ${code}`)
  return new Error(`B 站接口异常：${reason}`)
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

/**
 * 提取 opus 正文为 HTML，兼容两种发布形式：
 * - 图文动态：单个 <p><span> 内用 \n 分段，图片（bili-album 相册）在末尾；
 * - 专栏文章：多个 <p> 段落正常排版，图片（opus-para-pic）穿插在段落之间。
 * 统一按 .opus-module-content 的直接子节点顺序输出 <p> 段落与 <img> 配图。
 */
function extractOpusBody($: cheerio.CheerioAPI): string {
  const parts: string[] = []
  // 同图经 i0/i1 多节点 CDN 返回，以路径去重
  const seen = new Set<string>()
  const pushPic = (src: string): void => {
    const clean = normalizeUrl(stripImageScale(src))
    const key = clean.replace(/^https?:\/\/[^/]+/, '')
    if (seen.has(key)) return
    seen.add(key)
    parts.push(`<img src="${clean}" />`)
  }
  $('.opus-module-content')
    .children()
    .each((_, el) => {
      const $el = $(el)
      if ($el.is('img')) {
        const src = $el.attr('src')
        if (src) pushPic(src)
        return
      }
      if ($el.is('.opus-para-pic')) {
        $el.find('img').each((_, img) => {
          const src = $(img).attr('src')
          if (src) pushPic(src)
        })
        return
      }
      // 段落 / 文本节点：span 内 \n 转 <br> 保留换行
      const text = $el.text().trim()
      if (text) parts.push(`<p>${newlineToBr(text)}</p>`)
    })
  return parts.join('')
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
    const content = extractOpusBody($)
    return {
      pubDate: pubText ? parseBiliDateZh(pubText) : undefined,
      content: content || undefined
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
    let json: { code?: number; message?: string; data?: { items?: BiliOpusItem[] } }
    try {
      json = JSON.parse(raw) as {
        code?: number
        message?: string
        data?: { items?: BiliOpusItem[] }
      }
    } catch {
      // 被反爬/风控拦截时接口常返回 HTML 或空内容，JSON.parse 抛错
      throw new Error('B 站接口返回异常，可能被风控')
    }
    // B 站接口业务错误码（风控 -412 / 限流 -799 等）：抛友好错误而非静默返回空订阅
    if (typeof json.code === 'number' && json.code !== 0) {
      throw bilibiliApiError(json.code, json.message)
    }
    const items: ParsedArticle[] = []
    for (const item of json?.data?.items ?? []) {
      const content = (item.content ?? '').trim()
      const url = item.jump_url ? normalizeUrl(item.jump_url) : undefined
      const cover = item.cover?.url ? normalizeUrl(stripImageScale(item.cover.url)) : undefined
      // 逐篇抓详情页补发布时间与完整正文（RSSHub 同方案；串行+失败跳过，避免并发限流）
      const detail = url ? await fetchOpusDetail(url) : {}
      items.push({
        guid: `bilibili-${item.opus_id ?? item.jump_url ?? content}`,
        title: extractTitle(content),
        link: url,
        // 列表 content 仅作简介/搜索摘要，正文与发布日期必须来自详情页（不做兜底）
        summary: content || undefined,
        contentSnippet: content || undefined,
        content: detail.content,
        contentComplete: Boolean(detail.content),
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
