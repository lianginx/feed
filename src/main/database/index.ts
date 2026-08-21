import { getConnection, type AppDatabase } from './connection'
import { migrations, type Migration } from './migrations'
import { seedDefaultFeeds } from './seed'
import { withTransaction } from './transaction'

export { closeConnection } from './connection'
export type { AppDatabase }

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
    .get() as unknown as { version: number }

  migrations.sort((a, b) => a.version - b.version)

  for (const m of migrations) {
    if (m.version <= current.version) continue

    runMigration(db, m)
  }

  seedDefaultFeeds(db)
}

function runMigration(db: AppDatabase, m: Migration): void {
  withTransaction(db, () => {
    if (typeof m.up === 'string') {
      db.exec(m.up)
    } else {
      m.up(db)
    }
    db.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(m.version, m.name)
  })
}
