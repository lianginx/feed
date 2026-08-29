import { describe, it, expect, vi } from 'vitest'
import {
  runAdapter,
  registerSource,
  resolveAdapterSiteUrl
} from '@main/services/routes/core/runner'
import { v2exAdapter } from '@main/services/routes/adapters/v2ex'
import type { FeedAdapter } from '@main/services/routes/core/types'

const TOPIC = {
  id: 1,
  title: '测试主题',
  url: 'https://www.v2ex.com/t/1',
  content: '摘要',
  content_rendered: '<p>正文</p>',
  created: 1_700_000_000,
  member: { username: 'alice' }
}

describe('resolveAdapterSiteUrl', () => {
  it('string 形态直接返回，函数形态按参数生成，未声明返回 undefined', () => {
    const staticAdapter = { siteUrl: 'https://example.com' } as FeedAdapter
    expect(resolveAdapterSiteUrl(staticAdapter, {})).toBe('https://example.com')

    const dynamicAdapter = {
      siteUrl: (p: Record<string, string>) => `https://example.com/u/${p.uid}`
    } as FeedAdapter
    expect(resolveAdapterSiteUrl(dynamicAdapter, { uid: '9' })).toBe('https://example.com/u/9')

    const none = {} as FeedAdapter
    expect(resolveAdapterSiteUrl(none, {})).toBeUndefined()
  })

  it('内置适配器均声明站点首页，且不与抓取地址共用 JSON API', () => {
    expect(v2exAdapter.siteUrl).toBe('https://v2ex.com/?tab=hot')
    expect(v2exAdapter.buildUrl({})).not.toBe(v2exAdapter.siteUrl)
  })
})

describe('runAdapter（注入 mock fetcher，不联网）', () => {
  it('HTTP 路径：解析 mock 响应为 ParsedFeed', async () => {
    const http = vi.fn().mockResolvedValue(JSON.stringify([TOPIC]))
    const { adapterId, url, feed } = await runAdapter(v2exAdapter, {}, { fetchers: { http } })

    expect(http).toHaveBeenCalledTimes(1)
    expect(adapterId).toBe('v2ex-hot')
    expect(url).toContain('api/topics/hot')
    expect(feed.title).toBe('V2EX - 最热主题')
    expect(feed.items[0].title).toBe('测试主题')
    expect(feed.items[0].author).toBe('alice')
  })

  it('HTTP 路径：请求失败时错误向上传播', async () => {
    const http = vi.fn().mockRejectedValue(new Error('网络错误'))
    await expect(runAdapter(v2exAdapter, {}, { fetchers: { http } })).rejects.toThrow('网络错误')
  })

  it('HTTP 路径：POST 适配器透传 method 与 body', async () => {
    const postAdapter: FeedAdapter = {
      id: 'fake-post',
      name: '测试 POST 站',
      domains: ['example.com'],
      params: [{ key: 'uid', label: '用户 ID', required: true }],
      httpMethod: 'POST',
      headers: { 'Content-Type': 'application/json' },
      buildUrl: () => 'https://example.com/api/list',
      buildBody: (p) => JSON.stringify({ user_id: p.uid }),
      async parse(raw) {
        return { title: String(JSON.parse(raw).user_id), items: [] }
      }
    }
    const http = vi.fn().mockResolvedValue(JSON.stringify({ user_id: 'u1' }))

    const { feed } = await runAdapter(postAdapter, { uid: 'u1' }, { fetchers: { http } })

    expect(http).toHaveBeenCalledWith('https://example.com/api/list', {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ user_id: 'u1' })
    })
    expect(feed.title).toBe('u1')
  })

  it('HTTP 路径：cookieDomain 适配器注入 Cookie 头并按白名单过滤', async () => {
    const cookieAdapter: FeedAdapter = {
      id: 'fake-cookie',
      name: '测试登录站',
      domains: ['example.com'],
      params: [],
      cookieDomain: '.example.com',
      injectCookieNames: ['z_c0'],
      buildUrl: () => 'https://example.com/api',
      async parse() {
        return { title: 'T', items: [] }
      }
    }
    const http = vi.fn().mockResolvedValue('ok')

    await runAdapter(
      cookieAdapter,
      {},
      { fetchers: { http }, cookies: { z_c0: 'token', buvid: 'fingerprint' } }
    )

    const options = http.mock.calls[0][1]
    // 只注入白名单内的登录态 cookie，指纹类 cookie 被过滤
    expect(options.headers.Cookie).toBe('z_c0=token')
  })

  it('HTTP 路径：未声明 cookieDomain 或无配置 cookie 时不注入 Cookie 头', async () => {
    const http = vi.fn().mockResolvedValue(JSON.stringify([TOPIC]))

    // v2ex 适配器未声明 cookieDomain：即使传了 cookies 也不注入
    await runAdapter(v2exAdapter, {}, { fetchers: { http }, cookies: { SESSDATA: 'x' } })
    expect(http.mock.calls[0][1].headers.Cookie).toBeUndefined()

    // 声明了 cookieDomain 但用户未配置登录态：不注入空 Cookie 头
    const cookieAdapter: FeedAdapter = {
      id: 'fake-cookie-2',
      name: '测试登录站',
      domains: ['example.com'],
      params: [],
      cookieDomain: '.example.com',
      buildUrl: () => 'https://example.com/api',
      async parse() {
        return { title: 'T', items: [] }
      }
    }
    await runAdapter(cookieAdapter, {}, { fetchers: { http } })
    expect(http.mock.calls[1][1].headers.Cookie).toBeUndefined()
  })

  it('browser 路径：needsBrowser 适配器走 browser fetcher 并透传 cookie', async () => {
    const browserAdapter: FeedAdapter = {
      id: 'fake-browser',
      name: '测试浏览器站',
      domains: ['example.com'],
      params: [{ key: 'uid', label: '用户 ID', required: true }],
      needsBrowser: true,
      cookieDomain: '.example.com',
      buildUrl: (p) => `https://example.com/${p.uid ?? ''}`,
      async parse(_raw: string, ctx) {
        return { title: 'T', link: ctx.url, items: [] }
      }
    }
    const browser = vi.fn().mockResolvedValue({ html: '<html>ok</html>', title: 'ok' })

    const { feed } = await runAdapter(
      browserAdapter,
      { uid: 'abc' },
      { fetchers: { browser }, cookies: { SESSDATA: 'x' } }
    )

    expect(browser).toHaveBeenCalledWith('https://example.com/abc', {
      cookies: { SESSDATA: 'x' },
      cookieDomain: '.example.com'
    })
    expect(feed.title).toBe('T')
  })

  it('自定义 source：注册的 SourceRunner 接管执行', async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({
        adapterId: 'fake-source',
        url: 'n/a',
        feed: { title: '自定义源结果', link: 'https://example.com', items: [] }
      })
    }
    registerSource('fake', runner)

    const fakeAdapter: FeedAdapter = {
      id: 'fake-source',
      name: '测试自定义源',
      domains: ['example.com'],
      params: [],
      // 自定义 source 在类型联合之外，运行期经注册表分发（二期 telegram 加入 SourceKind 后无需断言）
      source: 'fake' as FeedAdapter['source'],
      buildUrl: () => 'n/a',
      async parse() {
        return { title: '', link: '', items: [] }
      }
    }

    const { feed } = await runAdapter(fakeAdapter, {})
    expect(runner.run).toHaveBeenCalledTimes(1)
    expect(runner.run).toHaveBeenCalledWith(fakeAdapter, {}, {})
    expect(feed.title).toBe('自定义源结果')
  })
})
