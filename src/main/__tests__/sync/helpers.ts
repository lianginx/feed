import { DatabaseSync } from 'node:sqlite'
import { migrations } from '@main/database/migrations'

/** 在内存库上跑完整迁移链，得到与生产一致的表结构（不播种默认订阅源） */
export function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
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
  const sorted = [...migrations].sort((a, b) => a.version - b.version)
  for (const m of sorted) {
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
  return db
}
