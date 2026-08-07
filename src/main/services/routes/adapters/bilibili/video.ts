import * as cheerio from 'cheerio'
import type { ParsedArticle, ParsedFeed } from '../../../rss'
import type { AdapterParseContext, FeedAdapter } from '../../core/types'

/** 补全协议头：//xxx → https://xxx */
function normalizeUrl(url: string): string {
  return url.startsWith('//') ? 'https:' + url : url
}

/**
 * B 站 UP 主投稿视频。
 * 需要浏览器：视频列表接口 x/space/wbi/arc/search 有 wbi 签名 + 鼠标轨迹风控，
 * 由真实 Chromium 渲染空间页后从 DOM 提取视频卡片。
 * 登录态（cookieDomain）由上层配置注入；未配置也能抓公开 UP 主列表。
 * （参考 RSSHub bilibili/video 需浏览器内核的设计，实现自写）
 */
export const bilibiliUserVideo: FeedAdapter = {
  id: 'bilibili-user-video',
  name: 'B 站 UP 主视频',
  description: 'B 站 UP 主投稿视频（需浏览器渲染，反爬/签名站）',
  domains: ['bilibili.com'],
  params: [{ key: 'uid', label: 'UP 主 ID', required: true, placeholder: '如 928915' }],
  needsBrowser: true,
  cookieDomain: '.bilibili.com',
  buildUrl: (params) => `https://space.bilibili.com/${params.uid ?? ''}/video`,
  async parse(raw: string, ctx: AdapterParseContext): Promise<ParsedFeed> {
    const $ = cheerio.load(raw)
    const items: ParsedArticle[] = []
    const seen = new Set<string>()
    $('a[href*="/video/BV"]').each((_, el) => {
      const $a = $(el)
      const href = $a.attr('href')
      const title = ($a.attr('title') || $a.text() || '').trim()
      if (!href || !title) return
      const url = normalizeUrl(href)
      if (seen.has(url)) return
      seen.add(url)
      const bvid = url.match(/BV[0-9A-Za-z]+/)?.[0]
      items.push({
        guid: `bilibili-${bvid ?? url}`,
        title,
        link: url,
        summary: title
      })
    })
    const uid = ctx.params.uid ?? ''
    return {
      title: 'B 站 UP 主视频',
      description: 'B 站 UP 主投稿视频',
      link: `https://space.bilibili.com/${uid}/video`,
      items
    }
  }
}
