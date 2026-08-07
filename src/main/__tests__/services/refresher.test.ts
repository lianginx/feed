import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { persistParsedFeed, type ParsedFeedPersistContext } from '../../services/refresher'

/** 用 :memory: 建最小表结构（与 migration v1/v2/v3 同构，persistParsedFeed 仅用到的列） */
function createDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      site_url TEXT,
      custom_title INTEGER NOT NULL DEFAULT 0,
      favicon_url TEXT,
      last_error TEXT,
      error_count INTEGER DEFAULT 0,
      last_updated INTEGER
    );
    CREATE TABLE articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id INTEGER NOT NULL,
      guid TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      author TEXT,
      content TEXT,
      summary TEXT,
      published_at INTEGER,
      cover_image TEXT,
      UNIQUE(feed_id, guid)
    );
    INSERT INTO feeds (id, url, title) VALUES (1, 'https://example.com/feed', '测试源');
  `)
  return db
}

// getConnection 返回测试内共享的内存库；其余外部依赖打桩
const holders = vi.hoisted(() => ({ db: null as unknown as Database.Database }))
vi.mock('../../database/connection', () => ({ getConnection: () => holders.db }))
vi.mock('../../services/favicon', () => ({ resolveAndCacheFavicon: async () => null }))
vi.mock('../../services/badge', () => ({ scheduleBadgeUpdate: () => undefined }))
vi.mock('../../services/siteCookies', () => ({ getCookiesForAdapter: () => undefined }))
vi.mock('../../app/window', () => ({ getMainWindow: () => undefined }))

const feedCtx: ParsedFeedPersistContext = {
  url: 'https://example.com/feed',
  custom_title: 0,
  favicon_url: null
}

describe('persistParsedFeed', () => {
  beforeEach(() => {
    holders.db = createDb()
  })

  it('详情抓取失败的兜底内容不覆盖已有完整正文，发布日期也不丢失', async () => {
    // 首次入库：完整正文 + 真实发布日期
    await persistParsedFeed(1, feedCtx, {
      title: '测试源',
      items: [
        {
          guid: 'g1',
          title: '标题',
          content: '<p>完整正文内容</p>',
          contentComplete: true,
          pubDate: '2024-03-01T10:00:00+08:00'
        }
      ]
    })

    // 二次刷新：详情抓取失败（contentComplete=false，正文缺失 + 无 pubDate）
    await persistParsedFeed(1, feedCtx, {
      title: '测试源',
      items: [{ guid: 'g1', title: '标题', contentComplete: false }]
    })

    const row = holders.db
      .prepare('SELECT content, published_at FROM articles WHERE guid = ?')
      .get('g1') as { content: string; published_at: number }
    expect(row.content).toContain('完整正文内容')
    expect(row.published_at).toBe(
      Math.floor(new Date('2024-03-01T10:00:00+08:00').getTime() / 1000)
    )
  })

  it('完整（非兜底）内容刷新时正常更新正文与日期', async () => {
    await persistParsedFeed(1, feedCtx, {
      title: '测试源',
      items: [
        {
          guid: 'g1',
          title: '标题',
          content: '<p>旧完整正文</p>',
          contentComplete: true,
          pubDate: '2024-03-01T10:00:00+08:00'
        }
      ]
    })

    await persistParsedFeed(1, feedCtx, {
      title: '测试源',
      items: [
        {
          guid: 'g1',
          title: '标题',
          content: '<p>新完整正文</p>',
          contentComplete: true,
          pubDate: '2024-04-01T10:00:00+08:00'
        }
      ]
    })

    const row = holders.db
      .prepare('SELECT content, published_at FROM articles WHERE guid = ?')
      .get('g1') as { content: string; published_at: number }
    expect(row.content).toContain('新完整正文')
    expect(row.published_at).toBe(
      Math.floor(new Date('2024-04-01T10:00:00+08:00').getTime() / 1000)
    )
  })

  it('新文章详情未提取到正文时，正文入库为空而不拿摘要兜底', async () => {
    await persistParsedFeed(1, feedCtx, {
      title: '测试源',
      items: [
        {
          guid: 'g2',
          title: '标题',
          summary: '列表摘要文本',
          contentSnippet: '列表摘要文本',
          contentComplete: false
        }
      ]
    })

    const row = holders.db
      .prepare('SELECT content, summary FROM articles WHERE guid = ?')
      .get('g2') as { content: string; summary: string }
    expect(row.content).toBe('')
    // 列表摘要仍作为 summary 落库
    expect(row.summary).toBe('列表摘要文本')
  })
})
