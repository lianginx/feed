import { describe, expect, it } from 'vitest'
import { buildSnapshot, parseSnapshot, serializeSnapshot } from '@main/services/sync/snapshot'
import { applySnapshot } from '@main/services/sync/apply'
import { createTestDb } from './helpers'

function seedFeed(
  db: ReturnType<typeof createTestDb>,
  url: string,
  extra: { title?: string; sort_order?: number; category_id?: number | null } = {}
): void {
  db.prepare('INSERT INTO feeds (url, title, category_id, sort_order) VALUES (?, ?, ?, ?)').run(
    url,
    extra.title ?? url,
    extra.category_id ?? null,
    extra.sort_order ?? 0
  )
}

describe('serializeSnapshot 序列化确定性', () => {
  it('同一数据两次序列化结果完全一致', () => {
    const db = createTestDb()
    db.prepare("INSERT INTO categories (name, sort_order) VALUES ('科技', 0)").run()
    const cat = db.prepare('SELECT id FROM categories').get() as { id: number }
    seedFeed(db, 'https://b.example/rss', { category_id: Number(cat.id) })
    seedFeed(db, 'https://a.example/rss')

    expect(serializeSnapshot(db)).toBe(serializeSnapshot(db))
  })

  it('sort_order 并列时按 url 排序，与插入顺序（本地 id）无关', () => {
    const db1 = createTestDb()
    seedFeed(db1, 'https://z.example/rss')
    seedFeed(db1, 'https://a.example/rss')
    seedFeed(db1, 'https://m.example/rss')

    const db2 = createTestDb()
    seedFeed(db2, 'https://a.example/rss')
    seedFeed(db2, 'https://m.example/rss')
    seedFeed(db2, 'https://z.example/rss')

    expect(serializeSnapshot(db1)).toBe(serializeSnapshot(db2))
  })

  it('分类并列时按 name 排序', () => {
    const db1 = createTestDb()
    db1.prepare("INSERT INTO categories (name) VALUES ('新闻')").run()
    db1.prepare("INSERT INTO categories (name) VALUES ('开发')").run()

    const db2 = createTestDb()
    db2.prepare("INSERT INTO categories (name) VALUES ('开发')").run()
    db2.prepare("INSERT INTO categories (name) VALUES ('新闻')").run()

    expect(serializeSnapshot(db1)).toBe(serializeSnapshot(db2))
  })

  it('快照不含 updatedAt 字段（历史 bug：时间戳毒化全等比较）', () => {
    const db = createTestDb()
    seedFeed(db, 'https://a.example/rss')
    const parsed = JSON.parse(serializeSnapshot(db)) as Record<string, unknown>
    expect('updatedAt' in parsed).toBe(false)
  })

  it('快照携带分类名称与适配器字段，parse 往返一致', () => {
    const db = createTestDb()
    db.prepare("INSERT INTO categories (name) VALUES ('科技')").run()
    const cat = db.prepare('SELECT id FROM categories').get() as { id: number }
    db.prepare(
      'INSERT INTO feeds (url, title, site_url, category_id, custom_title, adapter_id, adapter_params) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      'https://v2ex.example/route',
      'V2EX',
      'https://v2ex.com',
      Number(cat.id),
      1,
      'v2ex',
      '{"node":"create"}'
    )

    const raw = serializeSnapshot(db)
    const parsed = parseSnapshot(raw)
    expect(parsed.version).toBe(1)
    expect(parsed.categories).toEqual([{ name: '科技', sortOrder: 0 }])
    expect(parsed.feeds[0]).toMatchObject({
      url: 'https://v2ex.example/route',
      category: '科技',
      adapterId: 'v2ex',
      adapterParams: '{"node":"create"}'
    })
  })

  it('parseSnapshot 拒绝格式错误数据；旧格式多余字段不影响解析', () => {
    expect(() => parseSnapshot('not json')).toThrow()
    expect(() => parseSnapshot('{"version":2}')).toThrow()

    const legacy =
      '{"version":1,"updatedAt":1700000000000,"categories":[],"feeds":[{"url":"https://a.example/rss","title":"A","siteUrl":null,"category":null,"sortOrder":0,"customTitle":0}]}'
    const parsed = parseSnapshot(legacy)
    expect(parsed.feeds).toHaveLength(1)
  })

  it('buildSnapshot 纯函数：相同输入输出全等', () => {
    const cats = [
      { id: 1, name: 'B 分类', sort_order: 0 },
      { id: 2, name: 'A 分类', sort_order: 1 }
    ]
    const feeds = [
      {
        url: 'https://a.example/rss',
        title: 'A',
        site_url: null,
        category_id: 2,
        sort_order: 0,
        custom_title: 0,
        adapter_id: null,
        adapter_params: null
      }
    ]
    expect(buildSnapshot(cats, feeds)).toEqual(buildSnapshot(cats, feeds))
  })
})

describe('serialize ∘ apply 恒等性', () => {
  function seedSource(db: ReturnType<typeof createTestDb>): void {
    db.prepare("INSERT INTO categories (name, sort_order) VALUES ('科技', 1)").run()
    db.prepare("INSERT INTO categories (name, sort_order) VALUES ('生活', 2)").run()
    const tech = db.prepare("SELECT id FROM categories WHERE name = '科技'").get() as { id: number }

    db.prepare(
      'INSERT INTO feeds (url, title, site_url, category_id, sort_order, custom_title, adapter_id, adapter_params) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('https://b.example/rss', 'B 源', 'https://b.example', Number(tech.id), 3, 1, null, null)
    db.prepare('INSERT INTO feeds (url, title, sort_order, custom_title) VALUES (?, ?, ?, ?)').run(
      'https://a.example/rss',
      'A 源',
      1,
      0
    )
  }

  it('apply 后再序列化与输入字符串一致（跨设备收敛的关键性质）', () => {
    const source = createTestDb()
    seedSource(source)

    const raw = serializeSnapshot(source)

    const target = createTestDb()
    seedFeed(target, 'https://will-be-deleted.example/rss')
    target.prepare("INSERT INTO categories (name) VALUES ('将被删除的分类')").run()

    applySnapshot(target, parseSnapshot(raw))

    expect(serializeSnapshot(target)).toBe(raw)
  })
})
