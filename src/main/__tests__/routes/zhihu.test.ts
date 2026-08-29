import { describe, it, expect } from 'vitest'
import { zhihuHotAdapter } from '@main/services/routes/adapters/zhihu'

/** 模拟知乎热榜接口返回（真实结构子集：回答/问题/专栏/想法四类条目） */
const HOT_FIXTURE = JSON.stringify({
  data: [
    {
      type: 'hot_list_feed',
      target: {
        id: 101,
        title: '如何理解事件循环？',
        excerpt: '事件循环是运行时调度机制……',
        url: 'https://api.zhihu.com/answers/9001',
        question: { id: 42 }
      },
      detail_text: '3967 万热度'
    },
    {
      type: 'hot_list_feed',
      target: {
        id: 102,
        title: '有哪些值得坚持的好习惯？',
        excerpt: '早起、运动、阅读……',
        url: 'https://api.zhihu.com/questions/7001'
      },
      detail_text: '2000 万热度'
    },
    {
      type: 'hot_list_feed',
      target: {
        id: 103,
        title: '一篇专栏文章',
        excerpt: '专栏摘要内容',
        url: 'https://api.zhihu.com/articles/8001'
      }
    },
    {
      type: 'hot_list_feed',
      target: {
        id: 104,
        title: '一条想法',
        url: 'https://api.zhihu.com/pins/6001'
      }
    }
  ]
})

const CTX = {
  params: {},
  url: 'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50'
}

describe('zhihu-hot 适配器', () => {
  it('声明登录基建（cookieDomain/loginUrl），HTTP 通道不走浏览器', () => {
    expect(zhihuHotAdapter.needsBrowser).toBe(false)
    expect(zhihuHotAdapter.cookieDomain).toBe('.zhihu.com')
    expect(zhihuHotAdapter.loginUrl).toContain('zhihu.com/signin')
    expect(zhihuHotAdapter.loginCookieNames).toEqual(['z_c0'])
  })

  it('parse 解析热榜：回答拼 question 链接、问题/专栏/想法按类型映射、热度进摘要', async () => {
    const feed = await zhihuHotAdapter.parse(HOT_FIXTURE, CTX)

    expect(feed.title).toBe('知乎热榜')
    expect(feed.items).toHaveLength(4)

    // 回答条目：question id + answer id 拼 web 链接
    expect(feed.items[0].link).toBe('https://www.zhihu.com/question/42/answer/9001')
    expect(feed.items[0].summary).toContain('🔥 3967 万热度')
    expect(feed.items[0].summary).toContain('事件循环是运行时调度机制')

    // 问题条目：api → www 域名替换
    expect(feed.items[1].link).toBe('https://www.zhihu.com/questions/7001')

    // 专栏条目：映射到 zhuanlan 域名
    expect(feed.items[2].link).toBe('https://zhuanlan.zhihu.com/p/8001')

    // 想法条目：无摘要也正常入库
    expect(feed.items[3].link).toBe('https://www.zhihu.com/pin/6001')
    expect(feed.items[3].summary).toBeUndefined()
  })

  it('parse 非 JSON（风控 HTML 验证页）时抛友好错误并提示登录', async () => {
    await expect(zhihuHotAdapter.parse('<html>安全验证</html>', CTX)).rejects.toThrow(
      '用浏览器登录知乎'
    )
  })

  it('parse 接口返回 error 对象与空数据时抛友好错误', async () => {
    await expect(
      zhihuHotAdapter.parse(JSON.stringify({ error: { code: 100, message: '请登录' } }), CTX)
    ).rejects.toThrow('请登录')
    await expect(zhihuHotAdapter.parse(JSON.stringify({ data: [] }), CTX)).rejects.toThrow(
      '未获取到热榜内容'
    )
  })
})
