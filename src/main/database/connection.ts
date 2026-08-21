/* eslint-disable @typescript-eslint/no-explicit-any */
import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { join } from 'path'

export type AppDatabase = {
  prepare: (sql: string) => {
    get: (...params: any[]) => unknown
    all: (...params: any[]) => unknown[]
    run: (...params: any[]) => { lastInsertRowid: number | bigint; changes: number | bigint }
    iterate: (...params: any[]) => IterableIterator<unknown>
  }
  exec: (sql: string) => void
  pragma: (sql: string, options?: { simple?: boolean }) => unknown
  transaction: (fn: () => void) => () => void
  close: () => void
}

let db: DatabaseSync | null = null
let wrapped: AppDatabase | null = null

function createWrapper(raw: DatabaseSync): AppDatabase {
  return {
    prepare(sql: string) {
      const stmt = raw.prepare(sql)
      return {
        get: (...params: any[]) =>
          (stmt as unknown as { get: (...p: any[]) => unknown }).get(...params),
        all: (...params: any[]) =>
          (stmt as unknown as { all: (...p: any[]) => unknown[] }).all(...params),
        run: (...params: any[]) =>
          (
            stmt as unknown as {
              run: (...p: any[]) => { lastInsertRowid: number | bigint; changes: number | bigint }
            }
          ).run(...params),
        iterate: (...params: any[]) =>
          (stmt as unknown as { iterate: (...p: any[]) => IterableIterator<unknown> }).iterate(
            ...params
          )
      }
    },
    exec(sql: string) {
      raw.exec(sql)
    },
    pragma(sql: string, options?: { simple?: boolean }) {
      const stmt = raw.prepare(`PRAGMA ${sql}`)
      if (options?.simple) {
        const row = stmt.get() as Record<string, unknown> | undefined
        if (!row) return undefined
        const key = Object.keys(row)[0]
        return row[key]
      }
      return stmt.all()
    },
    transaction(fn: () => void) {
      return () => {
        raw.exec('BEGIN')
        try {
          fn()
          raw.exec('COMMIT')
        } catch (e) {
          try {
            raw.exec('ROLLBACK')
          } catch {
            void 0
          }
          throw e
        }
      }
    },
    close() {
      raw.close()
    }
  }
}

export function getConnection(): AppDatabase {
  if (wrapped) return wrapped
  if (db) {
    wrapped = createWrapper(db)
    return wrapped
  }

  const dbPath = join(app.getPath('userData'), 'feed.db')
  const raw = new DatabaseSync(dbPath)
  raw.exec('PRAGMA journal_mode = WAL')
  raw.exec('PRAGMA foreign_keys = ON')
  db = raw
  wrapped = createWrapper(raw)
  return wrapped
}

export function closeConnection(): void {
  if (wrapped) {
    wrapped = null
  }
  if (db) {
    try {
      db.close()
    } catch {
      void 0
    }
    db = null
  }
}
