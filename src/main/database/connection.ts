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
