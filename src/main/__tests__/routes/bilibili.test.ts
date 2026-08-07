import { describe, it, expect, vi } from 'vitest'
import { bilibiliUserArticle, bilibiliUserVideo } from '../../services/routes/adapters/bilibili'

// 专栏适配器 parse 会联网抓 opus 详情页（补发布时间/正文），单测 mock 网络
vi.mock('../../services/http', () => ({
  fetchWithTimeout: vi.fn(async (url: string) => {
    if (url.includes('/x/web-interface/card')) {
      return {
        ok: true,
        json: async () => ({
          code: 0,
          data: { card: { name: '卢诗翰', sign: '', face: '//i0.hdslb.com/bfs/face/x.jpg' } }
        })
      }
    }
    if (url.includes('/opus/')) {
      return {
        ok: true,
        text: async () =>
          '<div class="opus-module-author__pub__text">2026年08月06日 19:07</div>' +
          '<div class="opus-module-content"><p>详情正文</p><img src="//i0.hdslb.com/detail.jpg"></div>'
      }
    }
    return { ok: false }
  }),
  BROWSER_USER_AGENT: 'Mozilla/5.0 (Mock)'
}))

/** 模拟 opus/feed/space 接口返回（真实结构） */
const ARTICLE_FIXTURE = JSON.stringify({
  data: {
    items: [
      {
        content: '第一行是标题\n后面是正文内容',
        jump_url: '//www.bilibili.com/opus/1233411644167553046',
        opus_id: '1233411644167553046',
        cover: { url: 'http://i0.hdslb.com/bfs/xxx.jpg' }
      },
      {
        content: '第二篇专栏摘要',
        jump_url: '//www.bilibili.com/opus/999',
        opus_id: '999'
      }
    ]
  }
})

/** 模拟空间视频页渲染后的 HTML（含 BV 链接 + 重复项） */
const VIDEO_FIXTURE = `<html><body>
  <a href="//www.bilibili.com/video/BV1xX411c7cH/" title="视频A" class="card"></a>
  <a href="//www.bilibili.com/video/BV1RoMf6mEra/" title="视频B" class="card"></a>
  <a href="//www.bilibili.com/video/BV1xX411c7cH/" title="重复项"></a>
</body></html>`

describe('bilibili 用户专栏适配器', () => {
  it('buildUrl 带 uid', () => {
    expect(bilibiliUserArticle.buildUrl({ uid: '928915' })).toContain('host_mid=928915')
    expect(bilibiliUserArticle.needsBrowser).toBe(false)
  })

  it('parse 解析 opus JSON 并补全协议头（封面 http→https，符合 CSP）', async () => {
    const feed = await bilibiliUserArticle.parse(ARTICLE_FIXTURE, {
      params: { uid: '928915' },
      url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/opus/feed/space?host_mid=928915'
    })

    expect(feed.items).toHaveLength(2)
    const first = feed.items[0]
    expect(first.guid).toBe('bilibili-1233411644167553046')
    expect(first.title).toBe('第一行是标题')
    expect(first.link).toBe('https://www.bilibili.com/opus/1233411644167553046')
    expect(first.coverImage).toBe('https://i0.hdslb.com/bfs/xxx.jpg')
    // enrich 逐篇抓详情页：content 用详情页完整正文，而非封面兜底
    expect(first.content).toContain('详情正文')
    // 详情页时间 '2026年08月06日 19:07' 解析为 ISO
    expect(first.pubDate).toBe(new Date('2026-08-06T19:07:00+08:00').toISOString())
  })

  it('声明 fetchMeta（补 UP 主名/头像）', () => {
    expect(typeof bilibiliUserArticle.fetchMeta).toBe('function')
  })
})

describe('bilibili 用户视频适配器', () => {
  it('声明需要浏览器与 cookie 域', () => {
    expect(bilibiliUserVideo.needsBrowser).toBe(true)
    expect(bilibiliUserVideo.cookieDomain).toBe('.bilibili.com')
  })

  it('声明 browserExtract（渲染进程内提取，主进程不解析整页大 HTML）', () => {
    expect(bilibiliUserVideo.browserExtract).toBeTruthy()
    expect(bilibiliUserVideo.browserExtract).toContain('.bili-video-card')
  })

  it('parse 从渲染 HTML 提取视频卡片并去重', async () => {
    const feed = await bilibiliUserVideo.parse(VIDEO_FIXTURE, {
      params: { uid: '928915' },
      url: 'https://space.bilibili.com/928915/video'
    })

    expect(feed.items).toHaveLength(2)
    expect(feed.link).toBe('https://space.bilibili.com/928915/video')

    const first = feed.items[0]
    expect(first.guid).toBe('bilibili-BV1xX411c7cH')
    expect(first.title).toBe('视频A')
    expect(first.link).toBe('https://www.bilibili.com/video/BV1xX411c7cH/')
  })

  it('parse 支持页面内提取的 JSON 对象（UP 主信息 + 封面/日期/播放量）', async () => {
    const data = JSON.stringify({
      upName: '卢诗翰',
      upSign: '',
      avatar: '//i1.hdslb.com/bfs/face/xxx.jpg@120w_120h_1c',
      items: [
        {
          title: '视频A',
          url: '//www.bilibili.com/video/BV1xX411c7cH/',
          cover: '//i0.hdslb.com/bfs/archive/a.jpg',
          dateText: '07-26',
          playCount: '14.6万',
          duration: '07:19'
        },
        {
          title: '视频B',
          url: 'https://www.bilibili.com/video/BV1RoMf6mEra/',
          dateText: '2025-12-01'
        }
      ]
    })
    const feed = await bilibiliUserVideo.parse(data, {
      params: { uid: '928915' },
      url: 'https://space.bilibili.com/928915/video'
    })

    expect(feed.title).toBe('卢诗翰 的视频')
    expect(feed.image?.url).toBe('https://i1.hdslb.com/bfs/face/xxx.jpg@120w_120h_1c')
    expect(feed.items).toHaveLength(2)

    const first = feed.items[0]
    expect(first.guid).toBe('bilibili-BV1xX411c7cH')
    expect(first.title).toBe('视频A')
    expect(first.link).toBe('https://www.bilibili.com/video/BV1xX411c7cH/')
    expect(first.coverImage).toBe('https://i0.hdslb.com/bfs/archive/a.jpg')
    // 摘要只保留时长，不含播放量
    expect(first.summary).toBe('时长 07:19')
    // 封面以 <img> 写入内容
    expect(first.content).toContain('<img src="https://i0.hdslb.com/bfs/archive/a.jpg"')
    // '07-26' 补当前年份
    expect(first.pubDate).toBe(
      new Date(`${new Date().getFullYear()}-07-26T00:00:00+08:00`).toISOString()
    )

    const second = feed.items[1]
    // 带年份日期直接用
    expect(second.pubDate).toBe(new Date('2025-12-01T00:00:00+08:00').toISOString())
    expect(second.coverImage).toBeUndefined()
  })

  it('parse 对超大 HTML 兜底返回空而不 cheerio（防御崩溃）', async () => {
    const feed = await bilibiliUserVideo.parse(`<html>${'x'.repeat(200_000)}</html>`, {
      params: { uid: '928915' },
      url: 'https://space.bilibili.com/928915/video'
    })
    expect(feed.items).toHaveLength(0)
  })
})
