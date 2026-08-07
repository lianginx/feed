import { describe, it, expect } from 'vitest'
import { runAdapter } from '../../services/routes/core/runner'
import { v2exAdapter } from '../../services/routes/adapters/v2ex'

/**
 * V2EX 适配器联网 Demo。
 * 真实抓取 V2EX 官方 API，验证基础层全链路：runner → http fetcher → parse → ParsedFeed。
 * 可作为 P0 框架的骨架验证（联网，需网络）。
 */
describe('V2EX 适配器（离线 parse）', () => {
  it('parse 返回非 JSON（反爬 HTML）时抛友好错误', async () => {
    await expect(
      v2exAdapter.parse('<html>验证页面</html>', {
        params: {},
        url: 'https://www.v2ex.com/api/topics/hot.json'
      })
    ).rejects.toThrow('V2EX 接口返回异常')
  })

  it('parse 返回非数组（限流 JSON）时抛友好错误', async () => {
    await expect(
      v2exAdapter.parse(JSON.stringify({ error: 'rate limited' }), {
        params: {},
        url: 'https://www.v2ex.com/api/topics/hot.json'
      })
    ).rejects.toThrow('数据异常')
  })

  it('parse 解析有效数组为 ParsedFeed', async () => {
    const feed = await v2exAdapter.parse(
      JSON.stringify([
        {
          id: 1,
          title: '测试主题',
          url: 'https://www.v2ex.com/t/1',
          content: '正文内容',
          content_rendered: '<p>正文内容</p>',
          created: 1700000000,
          member: { username: 'alice' }
        }
      ]),
      { params: {}, url: 'https://www.v2ex.com/api/topics/hot.json' }
    )
    expect(feed.items).toHaveLength(1)
    expect(feed.items[0].guid).toBe('v2ex-1')
    expect(feed.items[0].author).toBe('alice')
  })
})

describe('V2EX 适配器 demo（联网）', () => {
  it('runAdapter 抓取最热主题并映射为 ParsedFeed', async () => {
    const { adapterId, url, feed } = await runAdapter(v2exAdapter, {})

    expect(adapterId).toBe('v2ex-hot')
    expect(url).toContain('api/topics/hot')
    expect(feed.title).toContain('V2EX')
    expect(feed.items.length).toBeGreaterThan(0)
    expect(feed.items[0].title).toBeTruthy()
    expect(feed.items[0].link).toMatch(/^https:\/\/www\.v2ex\.com/)

    console.log(`\n=== ${feed.title}（共 ${feed.items.length} 条） ===`)
    for (const item of feed.items.slice(0, 5)) {
      console.log(`- [${item.author ?? '?'}] ${item.title}`)
      console.log(`  ${item.link} | ${item.pubDate}`)
      console.log(`  摘要: ${(item.summary ?? '').slice(0, 60)}`)
    }
  }, 30_000)
})
