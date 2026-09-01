import { describe, it, expect } from 'vitest'
import { juejinUserPosts, juejinHot } from '@main/services/routes/adapters/juejin'

/** 模拟掘金文章列表接口返回（真实结构子集） */
const LIST_FIXTURE = JSON.stringify({
  err_no: 0,
  err_msg: 'success',
  data: [
    {
      article_id: '7000000000000001',
      article_info: {
        title: '深入理解事件循环',
        brief_content: '本文介绍浏览器与 Node 的事件循环差异。',
        cover_image: 'http://p3-juejin.byteimg.com/cover.jpg',
        ctime: 1_700_000_000
      },
      author_user_info: {
        user_name: '张三',
        avatar_large: 'https://p3-passport.byteimg.com/avatar.jpg'
      }
    },
    {
      article_id: '7000000000000002',
      article_info: { title: '第二篇文章', brief_content: '', ctime: 1_700_100_000 },
      author_user_info: { user_name: '张三' }
    }
  ]
})

const CTX = {
  params: { user_id: '3456599838764552' },
  url: 'https://api.juejin.cn/content_api/v1/article/query_list'
}

/** 用于拼接正文的转义与分支覆盖：特殊字符摘要、无 article_id 条目 */
const ESCAPE_FIXTURE = JSON.stringify({
  err_no: 0,
  err_msg: 'success',
  data: [
    {
      article_id: '7000000000000003',
      article_info: {
        title: '含特殊字符的文章',
        brief_content: '摘要含 <script>alert(1)</script> 与 "引号" 和 & 符号',
        cover_image: 'https://example.com/cover.jpg',
        ctime: 1_700_200_000
      },
      author_user_info: { user_name: '张三' }
    },
    {
      article_info: {
        title: '无 ID 的文章',
        brief_content: '只有摘要',
        cover_image: 'https://example.com/cover2.jpg'
      },
      author_user_info: { user_name: '张三' }
    }
  ]
})

describe('juejin-user-posts 适配器', () => {
  it('POST 通道声明：httpMethod/buildBody/Content-Type', () => {
    expect(juejinUserPosts.httpMethod).toBe('POST')
    expect(juejinUserPosts.headers?.['Content-Type']).toBe('application/json')
    const body = juejinUserPosts.buildBody?.({ user_id: '123' }) ?? ''
    expect(JSON.parse(body)).toEqual({
      user_id: '123',
      cursor: '0',
      limit: 20,
      sort_type: 2
    })
  })

  it('buildBody 支持从个人主页地址提取 user_id', () => {
    const body = juejinUserPosts.buildBody?.({ user_id: 'https://juejin.cn/user/998877' }) ?? ''
    expect(body).toContain('"user_id":"998877"')
  })

  it('parse 解析文章列表：作者名/头像、封面 http→https、发布时间', async () => {
    const feed = await juejinUserPosts.parse(LIST_FIXTURE, CTX)

    expect(feed.title).toBe('张三 的掘金专栏')
    expect(feed.image?.url).toBe('https://p3-passport.byteimg.com/avatar.jpg')
    expect(feed.items).toHaveLength(2)

    const first = feed.items[0]
    expect(first.guid).toBe('juejin-7000000000000001')
    expect(first.title).toBe('深入理解事件循环')
    expect(first.link).toBe('https://juejin.cn/post/7000000000000001')
    expect(first.summary).toBe('本文介绍浏览器与 Node 的事件循环差异。')
    // CSP：http 图床地址升 https
    expect(first.coverImage).toBe('https://p3-juejin.byteimg.com/cover.jpg')
    expect(first.pubDate).toBe(new Date(1_700_000_000 * 1000).toISOString())
    expect(first.author).toBe('张三')
    // 正文为拼接内容：封面图 + 摘要 + 阅读全文链接
    expect(first.content).toContain('<img src="https://p3-juejin.byteimg.com/cover.jpg" />')
    expect(first.content).toContain('<p>本文介绍浏览器与 Node 的事件循环差异。</p>')
    expect(first.content).toContain(
      '<a href="https://juejin.cn/post/7000000000000001">阅读全文</a>'
    )
  })

  it('parse 无封面无摘要的条目不生成 content', async () => {
    const feed = await juejinUserPosts.parse(LIST_FIXTURE, CTX)
    expect(feed.items[1].summary).toBeUndefined()
    expect(feed.items[1].content).toBeUndefined()
    expect(feed.items[1].coverImage).toBeUndefined()
  })

  it('parse 摘要含特殊字符时转义、无 article_id 时不生成阅读全文链接', async () => {
    const feed = await juejinUserPosts.parse(ESCAPE_FIXTURE, CTX)
    expect(feed.items).toHaveLength(2)

    const first = feed.items[0]
    // 摘要里的 < & " 被转义为实体，未作为标签/属性进入正文
    expect(first.content).toContain(
      '<p>摘要含 &lt;script&gt;alert(1)&lt;/script&gt; 与 &quot;引号&quot; 和 &amp; 符号</p>'
    )
    expect(first.content).not.toContain('<script>')
    expect(first.content).toContain(
      '<a href="https://juejin.cn/post/7000000000000003">阅读全文</a>'
    )

    // 无 article_id：只有封面 + 摘要，链接留空
    const second = feed.items[1]
    expect(second.link).toBeUndefined()
    expect(second.content).toContain('<img src="https://example.com/cover2.jpg" />')
    expect(second.content).toContain('<p>只有摘要</p>')
    expect(second.content).not.toContain('<a href=')
  })

  it('parse 危险 scheme 封面被剔除、封面属性值转义', async () => {
    const feed = await juejinUserPosts.parse(
      JSON.stringify({
        err_no: 0,
        data: [
          {
            article_id: '7000000000000004',
            article_info: {
              title: '危险封面',
              brief_content: '摘要A',
              cover_image: 'javascript:alert(1)'
            },
            author_user_info: { user_name: '张三' }
          },
          {
            article_id: '7000000000000005',
            article_info: {
              title: '带引号封面',
              brief_content: '摘要B',
              cover_image: 'https://example.com/a"b>.jpg'
            },
            author_user_info: { user_name: '张三' }
          }
        ]
      }),
      CTX
    )

    const [danger, quoted] = feed.items
    // javascript: scheme 被 http(s) 白名单拦截：不生成 <img>，正文不含 javascript:
    expect(danger.content).not.toContain('<img')
    expect(danger.content?.toLowerCase()).not.toContain('javascript:')
    expect(danger.content).toContain('<p>摘要A</p>')
    // 属性值中的 " 与 > 被转义，未破坏标签边界
    expect(quoted.content).toContain('<img src="https://example.com/a&quot;b&gt;.jpg" />')
  })

  it('parse 接口返回 err_no 非 0 时抛友好错误', async () => {
    await expect(
      juejinUserPosts.parse(JSON.stringify({ err_no: 403, err_msg: '无权限' }), CTX)
    ).rejects.toThrow('无权限')
  })

  it('parse 非 JSON（反爬 HTML）与空列表时抛友好错误', async () => {
    await expect(juejinUserPosts.parse('<html>验证</html>', CTX)).rejects.toThrow(
      '掘金接口返回异常'
    )
    await expect(
      juejinUserPosts.parse(JSON.stringify({ err_no: 0, data: [] }), CTX)
    ).rejects.toThrow('未获取到文章列表')
  })
})

/** 模拟掘金推荐 feed（热榜）返回：文章条目包裹在 item_type/item_info 中 */
const HOT_FEED_FIXTURE = JSON.stringify({
  err_no: 0,
  data: [
    {
      item_type: 2,
      item_info: {
        article_id: '7677562804154531890',
        article_info: {
          title: '热榜第一的文章',
          brief_content: '热榜摘要',
          cover_image: 'https://p9-xtjj-sign.byteimg.com/cover.jpg',
          ctime: 1_760_000_000
        },
        author_user_info: { user_name: '李四', avatar_large: 'https://avatar.example.com/a.jpg' }
      }
    },
    // 非文章条目（如沸点），应被过滤
    { item_type: 5, item_info: {} }
  ]
})

describe('juejin-hot 适配器', () => {
  it('POST 通道声明：recommend feed 地址与周期 sort_type', () => {
    expect(juejinHot.httpMethod).toBe('POST')
    expect(juejinHot.buildUrl({})).toContain('recommend_all_feed')
    const body = juejinHot.buildBody?.({ since: 'monthly' }) ?? ''
    expect(body).toContain('"sort_type":30')
    // 缺省周期为本周
    expect(juejinHot.buildBody?.({}) ?? '').toContain('"sort_type":7')
  })

  it('parse 解析热榜：取 item_info、过滤非文章条目、作者信息', async () => {
    const feed = await juejinHot.parse(HOT_FEED_FIXTURE, {
      params: { since: 'weekly' },
      url: 'https://api.juejin.cn/recommend_api/v1/article/recommend_all_feed'
    })

    expect(feed.title).toBe('掘金热榜 · 本周')
    expect(feed.items).toHaveLength(1)

    const first = feed.items[0]
    expect(first.guid).toBe('juejin-hot-7677562804154531890')
    expect(first.title).toBe('热榜第一的文章')
    expect(first.link).toBe('https://juejin.cn/post/7677562804154531890')
    expect(first.author).toBe('李四')
    expect(first.pubDate).toBe(new Date(1_760_000_000 * 1000).toISOString())
    // 热榜同样拼接正文
    expect(first.content).toContain('<img src="https://p9-xtjj-sign.byteimg.com/cover.jpg" />')
    expect(first.content).toContain('<p>热榜摘要</p>')
    expect(first.content).toContain(
      '<a href="https://juejin.cn/post/7677562804154531890">阅读全文</a>'
    )
  })

  it('parse 空数据时抛友好错误', async () => {
    await expect(
      juejinHot.parse(JSON.stringify({ err_no: 0, data: [] }), {
        params: {},
        url: 'https://api.juejin.cn/recommend_api/v1/article/recommend_all_feed'
      })
    ).rejects.toThrow('未获取到热榜内容')
  })
})
