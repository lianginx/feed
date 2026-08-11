import { describe, it, expect } from 'vitest'
import { v2exAdapter } from '@main/services/routes/adapters/v2ex'

/** 本地 JSON fixture（真实接口结构，不联网） */
const SAMPLE = JSON.stringify([
  {
    id: 123,
    title: '测试主题',
    url: 'https://www.v2ex.com/t/123',
    content: '纯文本摘要',
    content_rendered: '<p>正文</p>',
    created: 1_700_000_000,
    member: { username: 'alice' }
  }
])

describe('v2exAdapter.parse（本地 fixture，不联网）', () => {
  it('解析 JSON 为 ParsedFeed 并正确映射字段', async () => {
    const feed = await v2exAdapter.parse(SAMPLE, {
      params: {},
      url: 'https://www.v2ex.com/api/topics/hot.json'
    })

    expect(feed.title).toBe('V2EX - 最热主题')
    expect(feed.link).toBe('https://www.v2ex.com')
    expect(feed.items).toHaveLength(1)

    const item = feed.items[0]
    expect(item.guid).toBe('v2ex-123')
    expect(item.title).toBe('测试主题')
    expect(item.link).toBe('https://www.v2ex.com/t/123')
    expect(item.author).toBe('alice')
    expect(item.summary).toBe('纯文本摘要')
    expect(item.content).toBe('<p>正文</p>')
    expect(item.pubDate).toBe(new Date(1_700_000_000 * 1000).toISOString())
  })
})
