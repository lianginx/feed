import type Database from 'better-sqlite3'
import { getConnection } from './connection'
import { migrations, type Migration } from './migrations'
import { seedDefaultFeeds } from './seed'

export { closeConnection } from './connection'

export function initializeDatabase(): void {
  const db = getConnection()

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const current = db
    .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM _migrations')
    .get() as { version: number }

  migrations.sort((a, b) => a.version - b.version)

  for (const m of migrations) {
    if (m.version <= current.version) continue

    runMigration(db, m)
  }

  // 迁移全部完成后 schema 已是最新，此时再 seed 默认订阅源
  seedDefaultFeeds(db)
}

function runMigration(db: Database.Database, m: Migration): void {
  db.transaction(() => {
    if (typeof m.up === 'string') {
      db.exec(m.up)
    } else {
      m.up(db)
    }

    db.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(m.version, m.name)
  })()
}
