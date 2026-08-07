import { describe, it, expect, vi } from 'vitest'
import { runAdapter } from '../../services/routes/core/runner'
import { v2exAdapter } from '../../services/routes/adapters/v2ex'
import type { FeedAdapter } from '../../services/routes/core/types'

const TOPIC = {
  id: 1,
  title: '测试主题',
  url: 'https://www.v2ex.com/t/1',
  content: '摘要',
  content_rendered: '<p>正文</p>',
  created: 1_700_000_000,
  member: { username: 'alice' }
}

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
})
