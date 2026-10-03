/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { persistParsedFeed, type ParsedFeedPersistContext } from '@main/services/refresher'

function createDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
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
    CREATE TABLE article_translations (
      article_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      target_lang TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      translated_title TEXT,
      translated_content TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      PRIMARY KEY (article_id, provider, target_lang)
    );
  `)
  return db
}

const holders = vi.hoisted(() => ({ db: null as unknown as any }))
const electronApp = vi.hoisted(() => ({ mockUserData: '/tmp/feed-refresher-test' }))
vi.mock('electron', () => ({ app: { getPath: () => electronApp.mockUserData } }))
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

    await persistParsedFeed(1, feedCtx, {
      title: '测试源',
      items: [{ guid: 'g1', title: '标题', contentComplete: false }]
    })

    const row = holders.db
      .prepare('SELECT content, published_at FROM articles WHERE guid = ?')
      .get('g1') as unknown as { content: string; published_at: number }
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
      .get('g1') as unknown as { content: string; published_at: number }
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
      .get('g2') as unknown as { content: string; summary: string }
    expect(row.content).toBe('')
    expect(row.summary).toBe('列表摘要文本')
  })

  it('标题变化时删除该文章的翻译缓存行', async () => {
    await persistParsedFeed(1, feedCtx, {
      title: '测试源',
      items: [{ guid: 'g1', title: '旧标题', content: '<p>正文</p>', contentComplete: true }]
    })
    const { id } = holders.db.prepare('SELECT id FROM articles WHERE guid = ?').get('g1') as {
      id: number
    }
    holders.db
      .prepare(
        `INSERT INTO article_translations (article_id, provider, target_lang, source_hash, translated_title)
         VALUES (?, 'edge', 'zh', 'hash', '旧译文标题')`
      )
      .run(id)

    await persistParsedFeed(1, feedCtx, {
      title: '测试源',
      items: [{ guid: 'g1', title: '新标题', content: '<p>正文</p>', contentComplete: true }]
    })

    const rows = holders.db
      .prepare('SELECT COUNT(*) as count FROM article_translations WHERE article_id = ?')
      .get(id) as unknown as { count: number }
    expect(rows.count).toBe(0)
  })

  it('仅正文变化时保留翻译缓存行', async () => {
    await persistParsedFeed(1, feedCtx, {
      title: '测试源',
      items: [{ guid: 'g1', title: '标题', content: '<p>旧正文</p>', contentComplete: true }]
    })
    const { id } = holders.db.prepare('SELECT id FROM articles WHERE guid = ?').get('g1') as {
      id: number
    }
    holders.db
      .prepare(
        `INSERT INTO article_translations (article_id, provider, target_lang, source_hash, translated_title)
         VALUES (?, 'edge', 'zh', 'hash', '译文标题')`
      )
      .run(id)

    await persistParsedFeed(1, feedCtx, {
      title: '测试源',
      items: [{ guid: 'g1', title: '标题', content: '<p>新正文</p>', contentComplete: true }]
    })

    const rows = holders.db
      .prepare('SELECT COUNT(*) as count FROM article_translations WHERE article_id = ?')
      .get(id) as unknown as { count: number }
    expect(rows.count).toBe(1)
  })
})
