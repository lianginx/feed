import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { join } from 'path'

export type AppDatabase = DatabaseSync

let db: DatabaseSync | null = null

export function getConnection(): DatabaseSync {
  if (db) return db
  const dbPath = join(app.getPath('userData'), 'feed.db')
  const raw = new DatabaseSync(dbPath)
  raw.exec('PRAGMA journal_mode = WAL')
  const row = raw.prepare('PRAGMA journal_mode').get() as { journal_mode: string } | undefined
  if (!row || row.journal_mode !== 'wal') {
    console.warn(`[db] journal_mode 未切换为 WAL，当前为 ${row?.journal_mode ?? 'unknown'}`)
  }
  raw.exec('PRAGMA foreign_keys = ON')
  db = raw
  return db
}

export function closeConnection(): void {
  if (db) {
    try {
      db.close()
    } catch {
      void 0
    }
    db = null
  }
}
