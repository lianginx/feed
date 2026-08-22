import { describe, expect, it } from 'vitest'
import type { SyncFeed, SyncSnapshot } from '@main/services/sync/snapshot'
import { applySnapshot } from '@main/services/sync/apply'
import { createTestDb } from './helpers'

function feed(overrides: Partial<SyncFeed> & { url: string }): SyncFeed {
  return {
    title: overrides.url,
    siteUrl: null,
    category: null,
    sortOrder: 0,
    customTitle: 0,
    ...overrides
  }
}

function snapshot(feeds: SyncFeed[], categories: { name: string; sortOrder: number }[] = []) {
  return { version: 1 as const, categories, feeds }
}

interface FeedRow {
  id: number
  url: string
  title: string
  category_id: number | null
  sort_order: number
}

function listFeeds(db: ReturnType<typeof createTestDb>): FeedRow[] {
  return db
    .prepare('SELECT id, url, title, category_id, sort_order FROM feeds ORDER BY url')
    .all() as unknown as FeedRow[]
}

describe('applySnapshot', () => {
  it('新增：快照中的新 feed 与分类被插入，分类按名称关联', () => {
    const db = createTestDb()
    applySnapshot(
      db,
      snapshot(
        [feed({ url: 'https://a.example/rss', category: '科技' })],
        [{ name: '科技', sortOrder: 2 }]
      )
    )

    const cats = db.prepare('SELECT name, sort_order FROM categories').all() as unknown as {
      name: string
      sort_order: number
    }[]
    expect(cats).toEqual([{ name: '科技', sort_order: 2 }])

    const [row] = listFeeds(db)
    expect(row.url).toBe('https://a.example/rss')
    expect(row.category_id).toBe(
      (db.prepare('SELECT id FROM categories').get() as unknown as { id: number }).id
    )
  })

  it('更新：同 url 的 feed 字段被覆盖，不重复插入', () => {
    const db = createTestDb()
    db.prepare("INSERT INTO feeds (url, title) VALUES ('https://a.example/rss', '旧标题')").run()

    applySnapshot(db, snapshot([feed({ url: 'https://a.example/rss', title: '新标题' })]))

    const rows = listFeeds(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('新标题')
  })

  it('删除：不在快照中的本地 feed（连同文章）与分类被删除', () => {
    const db = createTestDb()
    db.prepare("INSERT INTO feeds (url, title) VALUES ('https://keep.example/rss', '保留')").run()
    db.prepare("INSERT INTO feeds (url, title) VALUES ('https://drop.example/rss', '删除')").run()
    const drop = db.prepare("SELECT id FROM feeds WHERE url LIKE '%drop%'").get() as { id: number }
    db.prepare('INSERT INTO articles (feed_id, guid, title) VALUES (?, ?, ?)').run(
      Number(drop.id),
      'guid-1',
      '文章'
    )
    db.prepare("INSERT INTO categories (name) VALUES ('孤儿分类')").run()

    applySnapshot(db, snapshot([feed({ url: 'https://keep.example/rss' })]))

    expect(listFeeds(db).map((f) => f.url)).toEqual(['https://keep.example/rss'])
    const articles = db.prepare('SELECT COUNT(*) AS c FROM articles').get() as unknown as {
      c: number
    }
    expect(articles.c).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS c FROM categories').get()).toEqual({ c: 0 })
  })

  it('快照中 adapterId/adapterParams 缺省时保留本地已有值', () => {
    const db = createTestDb()
    db.prepare(
      "INSERT INTO feeds (url, title, adapter_id, adapter_params) VALUES ('https://v.example/route', 'V', 'v2ex', '{\"node\":\"create\"}')"
    ).run()

    applySnapshot(db, snapshot([feed({ url: 'https://v.example/route' })]))

    const row = db.prepare('SELECT adapter_id, adapter_params FROM feeds').get() as unknown as {
      adapter_id: string
      adapter_params: string
    }
    expect(row.adapter_id).toBe('v2ex')
    expect(row.adapter_params).toBe('{"node":"create"}')
  })

  it('事务回滚：应用失败时本地数据不被破坏', () => {
    const db = createTestDb()
    db.prepare("INSERT INTO feeds (url, title) VALUES ('https://a.example/rss', 'A')").run()
    db.prepare("INSERT INTO categories (name) VALUES ('科技')").run()

    const broken: SyncSnapshot = {
      version: 1,
      categories: [{ name: '科技', sortOrder: 0 }],
      feeds: [
        feed({ url: 'https://b.example/rss' }),
        // 违反 UNIQUE(url)：触发异常 → 整个事务回滚
        feed({ url: 'https://b.example/rss', title: '重复' })
      ]
    }

    expect(() => applySnapshot(db, broken)).toThrow()

    const rows = listFeeds(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].url).toBe('https://a.example/rss')
  })
})
