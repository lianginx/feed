import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { migrations } from '@main/database/migrations'
import { seedDefaultFeeds } from '@main/database/seed'

function init(raw: DatabaseSync): void {
  const db = raw
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  const current = db
    .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM _migrations')
    .get() as unknown as { version: number }
  migrations.sort((a: { version: number }, b: { version: number }) => a.version - b.version)
  for (const m of migrations) {
    if (m.version <= current.version) continue
    db.exec('BEGIN')
    try {
      if (typeof m.up === 'string') db.exec(m.up)
      else m.up(db)
      db.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(m.version, m.name)
      db.exec('COMMIT')
    } catch (e) {
      try {
        db.exec('ROLLBACK')
      } catch {
        void 0
      }
      throw e
    }
  }
  seedDefaultFeeds(db)
}

describe('database init', () => {
  it('迁移版本号单调递增且唯一（防止复用/重排破坏已有用户数据库）', () => {
    const versions = migrations.map((m) => m.version)
    expect(versions).toEqual([...versions].sort((a, b) => a - b))
    expect(new Set(versions).size).toBe(versions.length)
  })

  it('在全新数据库上完整跑通迁移链并 seed 默认订阅源（含内置路由 adapter）', () => {
    const db = new DatabaseSync(':memory:')
    init(db)

    const applied = db
      .prepare('SELECT version, name FROM _migrations ORDER BY version')
      .all() as unknown as {
      version: number
      name: string
    }[]
    expect(applied.map((m) => m.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])

    const adapterFeeds = db
      .prepare('SELECT url, adapter_id, adapter_params FROM feeds WHERE adapter_id IS NOT NULL')
      .all() as unknown as { url: string; adapter_id: string; adapter_params: string }[]
    expect(adapterFeeds.length).toBeGreaterThan(0)
    expect(adapterFeeds.every((f) => f.adapter_params !== null)).toBe(true)
    expect(adapterFeeds.some((f) => f.url.includes('bilibili'))).toBe(true)
  })

  it('已有数据的数据库不会重复 seed', () => {
    const db = new DatabaseSync(':memory:')
    init(db)

    const countBefore = db.prepare('SELECT COUNT(*) AS c FROM feeds').get() as unknown as {
      c: number
    }
    db.prepare('INSERT INTO feeds (url, title) VALUES (?, ?)').run(
      'https://user-added.example/rss',
      '用户添加的源'
    )
    init(db)

    const countAfter = db.prepare('SELECT COUNT(*) AS c FROM feeds').get() as unknown as {
      c: number
    }
    expect(countAfter.c).toBe(countBefore.c + 1)
  })

  it('已迁移到 v9 的旧库不会再执行 v5，且 seed 跳过（count > 0）', () => {
    const db = new DatabaseSync(':memory:')
    init(db)
    init(db)

    const applied = db
      .prepare('SELECT version FROM _migrations ORDER BY version')
      .all() as unknown as {
      version: number
    }[]
    expect(applied.map((m) => m.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('用户清空全部订阅后重启，不会被重新写入默认订阅源', () => {
    const db = new DatabaseSync(':memory:')
    init(db)

    db.exec('DELETE FROM feeds')
    init(db)

    const count = db.prepare('SELECT COUNT(*) AS c FROM feeds').get() as unknown as { c: number }
    expect(count.c).toBe(0)
  })

  it('老用户升级（无标记 + count>0）：只落标记不写数据，之后清空订阅也不恢复', () => {
    const db = new DatabaseSync(':memory:')
    init(db)
    db.exec("DELETE FROM _app_state WHERE key = 'seeded_default_feeds'")

    const countBefore = db.prepare('SELECT COUNT(*) AS c FROM feeds').get() as unknown as {
      c: number
    }
    init(db)

    const countAfterUpgrade = db.prepare('SELECT COUNT(*) AS c FROM feeds').get() as unknown as {
      c: number
    }
    expect(countAfterUpgrade.c).toBe(countBefore.c)

    db.exec('DELETE FROM feeds')
    init(db)

    const countAfterClear = db.prepare('SELECT COUNT(*) AS c FROM feeds').get() as unknown as {
      c: number
    }
    expect(countAfterClear.c).toBe(0)
  })

  it('老用户升级（无标记 + count==0）：恢复一次默认源（已知局限），此后清空不再恢复', () => {
    const db = new DatabaseSync(':memory:')
    init(db)
    db.exec('DELETE FROM feeds')
    db.exec("DELETE FROM _app_state WHERE key = 'seeded_default_feeds'")

    init(db)

    const countRestored = db.prepare('SELECT COUNT(*) AS c FROM feeds').get() as unknown as {
      c: number
    }
    expect(countRestored.c).toBeGreaterThan(0)

    db.exec('DELETE FROM feeds')
    init(db)

    const countAfterClear = db.prepare('SELECT COUNT(*) AS c FROM feeds').get() as unknown as {
      c: number
    }
    expect(countAfterClear.c).toBe(0)
  })
})
