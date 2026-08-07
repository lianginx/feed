import { describe, it, expect, vi } from 'vitest'
import { bilibiliUserArticle, bilibiliUserVideo } from '../../services/routes/adapters/bilibili'
import { fetchWithTimeout } from '../../services/http'

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
          '<div class="opus-module-content opus-paragraph-children">' +
          '<p><span>详情第一行\n详情第二行</span></p>' +
          '<div class="opus-para-pic"><div class="bili-album"><div class="bili-album__preview grid2">' +
          '<div class="bili-album__preview__picture"><img src="//i0.hdslb.com/bfs/new_dyn/a.png@264w_264h_1e_1c.avif"></div>' +
          '<div class="bili-album__preview__picture"><img src="//i0.hdslb.com/bfs/new_dyn/b.png@264w_264h_1e_1c.avif"></div>' +
          '</div></div></div></div>'
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
        cover: { url: 'http://i0.hdslb.com/bfs/xxx.jpg@100w_100h_1c' }
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
    // 封面去缩放后缀取原图
    expect(first.coverImage).toBe('https://i0.hdslb.com/bfs/xxx.jpg')
    // 详情页抓取成功，正文完整
    expect(first.contentComplete).toBe(true)
    // enrich 逐篇抓详情页：content 用详情页完整正文，而非封面兜底
    expect(first.content).toContain('详情第一行')
    // span 内的 \n 转 <br> 保留换行（HTML 渲染默认折叠空白）
    expect(first.content).toContain('详情第一行<br>详情第二行')
    // 正文配图去重并去掉 @ 缩放后缀取原图
    expect(first.content).toContain('<img src="https://i0.hdslb.com/bfs/new_dyn/a.png" />')
    expect(first.content).toContain('<img src="https://i0.hdslb.com/bfs/new_dyn/b.png" />')
    expect(first.content).not.toContain('@264w_264h_1e_1c')
    // 详情页时间 '2026年08月06日 19:07' 解析为 ISO
    expect(first.pubDate).toBe(new Date('2026-08-06T19:07:00+08:00').toISOString())
  })

  it('专栏文章（多 p 段落穿插图片）按顺序保留段落与配图位置', async () => {
    const COLUMN_HTML =
      '<div class="opus-module-author__pub__text">2026年08月06日 19:07</div>' +
      '<div class="opus-module-content opus-paragraph-children">' +
      '<p><span>第一段文字</span></p>' +
      '<div class="opus-para-pic center"><div class="opus-pic-view"><div class="bili-dyn-pic">' +
      '<div class="bili-dyn-pic__img"><img src="//i1.hdslb.com/bfs/new_dyn/mid.png@1192w.webp"></div>' +
      '</div></div></div>' +
      '<p><span>第二段文字</span></p>' +
      '</div>'
    vi.mocked(fetchWithTimeout).mockImplementationOnce(
      async () => ({ ok: true, text: async () => COLUMN_HTML }) as Response
    )
    const feed = await bilibiliUserArticle.parse(
      JSON.stringify({
        data: {
          items: [
            {
              content: '专栏标题\n正文',
              jump_url: '//www.bilibili.com/opus/column1',
              opus_id: 'column1'
            }
          ]
        }
      }),
      {
        params: { uid: '928915' },
        url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/opus/feed/space?host_mid=928915'
      }
    )
    const content = feed.items[0].content ?? ''
    // 段落与配图按原文顺序输出，缩放后缀被去掉
    expect(content.indexOf('<p>第一段文字</p>')).toBeGreaterThan(-1)
    expect(content.indexOf('<p>第二段文字</p>')).toBeGreaterThan(-1)
    expect(content.indexOf('<p>第一段文字</p>')).toBeLessThan(
      content.indexOf('<img src="https://i1.hdslb.com/bfs/new_dyn/mid.png" />')
    )
    expect(content.indexOf('<img src="https://i1.hdslb.com/bfs/new_dyn/mid.png" />')).toBeLessThan(
      content.indexOf('<p>第二段文字</p>')
    )
    expect(content).not.toContain('@1192w')
  })

  it('详情页抓取失败时正文不落兜底（content 缺失），列表 content 仍作摘要', async () => {
    vi.mocked(fetchWithTimeout).mockImplementationOnce(async () => ({ ok: false }) as Response)
    const feed = await bilibiliUserArticle.parse(
      JSON.stringify({
        data: {
          items: [
            {
              content: '标题行\n正文一行\n正文二行',
              jump_url: '//www.bilibili.com/opus/1',
              opus_id: '1'
            }
          ]
        }
      }),
      {
        params: { uid: '928915' },
        url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/opus/feed/space?host_mid=928915'
      }
    )
    // 详情抓取失败：正文不拿列表内容兜底
    expect(feed.items[0].content).toBeUndefined()
    expect(feed.items[0].contentComplete).toBe(false)
    // 列表 content 作为摘要/搜索文本保留
    expect(feed.items[0].summary).toBe('标题行\n正文一行\n正文二行')
    expect(feed.items[0].contentSnippet).toBe('标题行\n正文一行\n正文二行')
  })

  it('parse 接口返回风控/限流错误码时抛友好错误（不静默入库空订阅）', async () => {
    await expect(
      bilibiliUserArticle.parse(JSON.stringify({ code: -412, message: '请求被拦截' }), {
        params: { uid: '928915' },
        url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/opus/feed/space?host_mid=928915'
      })
    ).rejects.toThrow('请求被拦截')

    await expect(
      bilibiliUserArticle.parse(JSON.stringify({ code: -799, message: '请求被拦截' }), {
        params: { uid: '928915' },
        url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/opus/feed/space?host_mid=928915'
      })
    ).rejects.toThrow('过于频繁')
  })

  it('parse 接口返回非 JSON（反爬 HTML）时抛友好错误', async () => {
    await expect(
      bilibiliUserArticle.parse('<html>验证页面</html>', {
        params: { uid: '928915' },
        url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/opus/feed/space?host_mid=928915'
      })
    ).rejects.toThrow('B 站接口返回异常')
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

  it('声明注入 cookie 白名单（过滤 buvid 指纹 cookie）', () => {
    // 只注入登录态 cookie：buvid3/buvid_fp 等指纹 cookie 与抓取环境不匹配会被 B 站风控
    expect(bilibiliUserVideo.injectCookieNames).toEqual(['SESSDATA', 'bili_jct', 'DedeUserID'])
  })

  it('parse 页面提取 JSON 无 UP 主信息且无卡片时抛错（避免静默入库空订阅）', async () => {
    await expect(
      bilibiliUserVideo.parse(JSON.stringify({ upName: '', upSign: '', avatar: '', items: [] }), {
        params: { uid: '928915' },
        url: 'https://space.bilibili.com/928915/video'
      })
    ).rejects.toThrow('未提取到视频列表')
  })

  it('parse 反爬场景：有 UP 主信息但视频卡片为空时同样抛错', async () => {
    // 反爬时页面仍渲染出 UP 主名（document.title），但视频列表接口被风控返回空。
    // 不能只看「upName/upSign 为空」才抛错，否则会静默入库空订阅、无任何警告。
    await expect(
      bilibiliUserVideo.parse(
        JSON.stringify({ upName: '卢诗翰', upSign: '测试签名', avatar: '', items: [] }),
        {
          params: { uid: '928915' },
          url: 'https://space.bilibili.com/928915/video'
        }
      )
    ).rejects.toThrow('未提取到视频列表')
  })

  it('parse 小片段 HTML 无视频卡片时抛错（不静默入库空订阅）', async () => {
    await expect(
      bilibiliUserVideo.parse('<html><body>没有视频</body></html>', {
        params: { uid: '928915' },
        url: 'https://space.bilibili.com/928915/video'
      })
    ).rejects.toThrow('未提取到视频列表')
  })

  it('parse 页面提取返回非 JSON（渲染异常）时抛友好错误', async () => {
    await expect(
      bilibiliUserVideo.parse('{invalid json', {
        params: { uid: '928915' },
        url: 'https://space.bilibili.com/928915/video'
      })
    ).rejects.toThrow('B 站页面渲染异常')
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
