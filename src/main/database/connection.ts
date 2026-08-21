import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { mkdirSync } from 'fs'
import { dirname, join } from 'path'

export type AppDatabase = DatabaseSync

let db: DatabaseSync | null = null

export function toSafeNumber(id: number | bigint): number {
  const n = Number(id)
  if (!Number.isSafeInteger(n)) {
    console.warn(`[db] lastInsertRowid 超出安全整数范围: ${String(id)}`)
  }
  return n
}

export function getConnection(): DatabaseSync {
  if (db) return db
  const dbPath = join(app.getPath('userData'), 'feed.db')
  mkdirSync(dirname(dbPath), { recursive: true })
  const raw = new DatabaseSync(dbPath)
  raw.exec('PRAGMA journal_mode = WAL')
  const row = raw.prepare('PRAGMA journal_mode').get() as { journal_mode: string } | undefined
  if (!row || String(row.journal_mode ?? '').toLowerCase() !== 'wal') {
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
