import type { AppDatabase } from './connection'

const depthMap = new WeakMap<AppDatabase, number>()

export function withTransaction<T>(db: AppDatabase, fn: () => T): T {
  const current = depthMap.get(db) ?? 0
  if (current === 0) {
    db.exec('BEGIN')
  } else {
    db.exec(`SAVEPOINT sp_${current}`)
  }
  depthMap.set(db, current + 1)
  try {
    const result = fn()
    depthMap.set(db, current)
    if (current === 0) {
      db.exec('COMMIT')
    } else {
      db.exec(`RELEASE SAVEPOINT sp_${current}`)
    }
    return result
  } catch (e) {
    depthMap.set(db, current)
    try {
      if (current === 0) {
        db.exec('ROLLBACK')
      } else {
        db.exec(`ROLLBACK TO SAVEPOINT sp_${current}`)
        db.exec(`RELEASE SAVEPOINT sp_${current}`)
      }
    } catch {
      void 0
    }
    throw e
  }
}
