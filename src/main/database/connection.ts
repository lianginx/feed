import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database | null = null

export function getConnection(): Database.Database {
  if (db) return db

  const dbPath = join(app.getPath('userData'), 'feed.db')
  db = new Database(dbPath)

  // 启用 WAL 模式提升并发性能
  db.pragma('journal_mode = WAL')
  // 启用外键约束
  db.pragma('foreign_keys = ON')

  return db
}

export function closeConnection(): void {
  if (db) {
    db.close()
    db = null
  }
}
