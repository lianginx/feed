import { describe, it, expect } from 'vitest'
import { bilibiliUserArticle, bilibiliUserVideo } from '../../services/routes/adapters/bilibili'

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

  it('parse 解析 opus JSON 并补全协议头', async () => {
    const feed = await bilibiliUserArticle.parse(ARTICLE_FIXTURE, {
      params: { uid: '928915' },
      url: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/opus/feed/space?host_mid=928915'
    })

    expect(feed.items).toHaveLength(2)
    const first = feed.items[0]
    expect(first.guid).toBe('bilibili-1233411644167553046')
    expect(first.title).toBe('第一行是标题')
    expect(first.link).toBe('https://www.bilibili.com/opus/1233411644167553046')
    expect(first.coverImage).toBe('http://i0.hdslb.com/bfs/xxx.jpg')
  })
})

describe('bilibili 用户视频适配器', () => {
  it('声明需要浏览器与 cookie 域', () => {
    expect(bilibiliUserVideo.needsBrowser).toBe(true)
    expect(bilibiliUserVideo.cookieDomain).toBe('.bilibili.com')
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
})
