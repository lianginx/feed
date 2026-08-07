import * as cheerio from 'cheerio'
import type { ParsedArticle, ParsedFeed } from '../../../rss'
import type { AdapterParseContext, FeedAdapter } from '../../core/types'

/** 补全协议头：//xxx → https://xxx */
function normalizeUrl(url: string): string {
  return url.startsWith('//') ? 'https:' + url : url
}

/**
 * 解析 B 站卡片日期文本为 ISO 时间。
 * 实测 B 站空间页分级显示：刚刚 / x分钟前 / x小时前 / 昨天 / MM-DD(当年) / YYYY-MM-DD(往年)。
 * 相对时间基于 now（默认当前时间）反推；跨年 MM-DD（1 月看到 12-30 属去年）自动校正。
 * 无法识别返回 undefined。
 */
export function parseBiliDate(text: string, now: Date = new Date()): string | undefined {
  const t = text.trim()
  const nowMs = now.getTime()

  // 相对时间：刚刚 / x分钟前 / x小时前 / 昨天
  if (t === '刚刚') {
    return new Date(nowMs).toISOString()
  }
  let m = t.match(/^(\d+)\s*分钟前$/)
  if (m) return new Date(nowMs - Number(m[1]) * 60_000).toISOString()
  m = t.match(/^(\d+)\s*小时前$/)
  if (m) return new Date(nowMs - Number(m[1]) * 3_600_000).toISOString()
  if (t === '昨天') {
    return new Date(nowMs - 86_400_000).toISOString()
  }

  // 往年 YYYY-MM-DD
  const withYear = t.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (withYear) {
    return new Date(`${withYear[1]}-${withYear[2]}-${withYear[3]}T00:00:00+08:00`).toISOString()
  }

  // 当年 MM-DD（含跨年校正：MM-DD 只会是过去日期，若落在未来则属去年）
  const monthDay = t.match(/^(\d{2})-(\d{2})$/)
  if (monthDay) {
    const year = now.getFullYear()
    const parsed = new Date(`${year}-${monthDay[1]}-${monthDay[2]}T00:00:00+08:00`)
    if (parsed.getTime() > nowMs) {
      return new Date(`${year - 1}-${monthDay[1]}-${monthDay[2]}T00:00:00+08:00`).toISOString()
    }
    return parsed.toISOString()
  }

  return undefined
}

/**
 * 页面内提取脚本：以 .bili-video-card 为视频卡片容器，精确提取标题/链接/封面/播放量/时长/日期；
 * 模拟滚动触发懒加载直到数量稳定；再提取 UP 主名（.nickname）/简介（.sign）/头像（.upinfo-avatar img）。
 * 结果为主进程收到的 JSON 对象，不再 cheerio 解析整页大 HTML（避免 SIGSEGV）。
 * 注意：B 站空间页渲染不稳定（偶发被反爬/空壳），能拿到多少取决于站点正常渲染；登录态更稳。
 */
const EXTRACT_VIDEO_CARDS = `(async () => {
  const deadline = Date.now() + 15000
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const collect = () => Array.from(document.querySelectorAll('.bili-video-card'))
    .map((card) => {
      const titleEl = card.querySelector('.bili-video-card__title a')
      const title = titleEl ? (titleEl.getAttribute('title') || titleEl.textContent || '').trim() : ''
      const href = titleEl ? titleEl.getAttribute('href') : ''
      if (!title || !href) return null
      const url = href.startsWith('//') ? 'https:' + href : href
      const img = card.querySelector('.bili-cover-card img')
      const cover = img ? (img.getAttribute('src') || '') : ''
      const stats = Array.from(card.querySelectorAll('.bili-cover-card__stat span')).map((s) => (s.textContent || '').trim())
      const sub = card.querySelector('.bili-video-card__subtitle span')
      return {
        title,
        url,
        cover,
        playCount: stats[0] || '',
        duration: stats[2] || '',
        dateText: sub ? (sub.textContent || '').trim() : ''
      }
    })
    .filter((x) => x !== null)
  let items = collect()
  let last = items.length
  let stable = 0
  while (Date.now() < deadline) {
    const se = document.scrollingElement || document.documentElement
    window.scrollTo(0, se.scrollHeight)
    se.scrollTop = se.scrollHeight
    document.body.scrollTop = document.body.scrollHeight
    await wait(700)
    items = collect()
    if (items.length === last) {
      if (++stable >= 3) break
    } else {
      stable = 0
    }
    last = items.length
  }
  const nameEl = document.querySelector('.upinfo-detail .nickname')
  const signEl = document.querySelector('.upinfo-detail .sign')
  const avatarImg = document.querySelector('.upinfo-avatar img')
  return {
    upName: nameEl ? (nameEl.textContent || '').trim() : (document.title || '').replace(/投稿视频.*$/, '').trim(),
    upSign: signEl ? (signEl.textContent || '').trim() : '',
    avatar: avatarImg ? (avatarImg.getAttribute('src') || '') : '',
    items
  }
})()`

/**
 * B 站 UP 主投稿视频。
 * 需要浏览器：视频列表接口 x/space/wbi/arc/search 有 wbi 签名 + 鼠标轨迹风控，
 * 由真实 Chromium 渲染空间页后，用 browserExtract 在渲染进程直接提取视频卡片。
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
  loginUrl: 'https://passport.bilibili.com/login',
  loginCookieNames: ['SESSDATA'],
  // 只注入登录态 cookie：buvid3/buvid_fp 等浏览器指纹 cookie 与抓取环境指纹不匹配，
  // 会被 B 站风控导致视频列表接口返回空；让页面 JS 自行通过 /x/frontend/finger/spi_v2 生成更稳。
  injectCookieNames: ['SESSDATA', 'bili_jct', 'DedeUserID'],
  browserExtract: EXTRACT_VIDEO_CARDS,
  buildUrl: (params) => `https://space.bilibili.com/${params.uid ?? ''}/video`,
  async parse(raw: string, ctx: AdapterParseContext): Promise<ParsedFeed> {
    const items: ParsedArticle[] = []
    const seen = new Set<string>()
    let upName = ''
    let upSign = ''
    let avatar = ''

    const push = (
      title: string,
      url: string,
      extra?: { cover?: string; dateText?: string; playCount?: string; duration?: string }
    ): void => {
      if (!url || !title || seen.has(url)) return
      seen.add(url)
      const bvid = url.match(/BV[0-9A-Za-z]+/)?.[0]
      items.push({
        guid: `bilibili-${bvid ?? url}`,
        title,
        link: url,
        summary: extra?.duration ? `时长 ${extra.duration}` : title,
        content: extra?.cover ? `<img src="${normalizeUrl(extra.cover)}" />` : undefined,
        coverImage: extra?.cover ? normalizeUrl(extra.cover) : undefined,
        pubDate: extra?.dateText ? parseBiliDate(extra.dateText) : undefined
      })
    }

    const trimmed = raw.trim()
    if (trimmed.startsWith('{')) {
      // 页面内提取路径：raw 是 browserExtract 脚本返回的 JSON 对象 { upName, upSign, avatar, items }
      let data: {
        upName?: string
        upSign?: string
        avatar?: string
        items?: Array<{
          title?: string
          url?: string
          cover?: string
          dateText?: string
          playCount?: string
          duration?: string
        }>
      }
      try {
        data = JSON.parse(trimmed)
      } catch {
        // 提取脚本返回非 JSON（异常页面）：抛友好错误而非静默入库空订阅
        throw new Error('B 站页面渲染异常，可能被风控')
      }
      upName = (data.upName ?? '').trim()
      upSign = (data.upSign ?? '').trim()
      avatar = (data.avatar ?? '').trim()
      for (const it of data.items ?? []) {
        push((it.title ?? '').trim(), normalizeUrl(it.url ?? ''), it)
      }
      // 拿不到任何视频卡片：要么视频列表接口被风控返回空，要么该 UP 主确实无视频。
      // 两种情况入库空订阅都无意义，抛错提示（而非静默刷新成功）。
      // 注意不能只看「upName/upSign 也为空」：反爬页面的 document.title 仍可能给出 upName。
      if (items.length === 0) {
        throw new Error('未提取到视频列表，可能被风控')
      }
    } else if (raw.length <= 100_000) {
      // 兼容兜底：解析 HTML（本地 fixture / 小片段）。
      // 真实大 HTML 走页面内提取，不会进到这里（避免 cheerio 深度递归崩溃）。
      const $ = cheerio.load(raw)
      $('a[href*="/video/BV"]').each((_, el) => {
        const $a = $(el)
        const href = $a.attr('href')
        const title = ($a.attr('title') || $a.text() || '').trim()
        if (!href) return
        push(title, normalizeUrl(href))
      })
      // 小片段兜底也拿不到任何视频卡片：抛错而非静默入库空订阅
      if (items.length === 0) {
        throw new Error('未提取到视频列表，可能被风控')
      }
    }

    const uid = ctx.params.uid ?? ''
    return {
      title: upName ? `${upName} 的视频` : 'B 站 UP 主视频',
      description: upSign || 'B 站 UP 主投稿视频',
      link: `https://space.bilibili.com/${uid}/video`,
      image: avatar ? { url: normalizeUrl(avatar) } : undefined,
      items
    }
  }
}
