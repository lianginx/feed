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

  let result: T
  try {
    result = fn()
    if (result != null && typeof (result as unknown as { then?: unknown }).then === 'function') {
      throw new Error('withTransaction 不支持异步函数，请勿传入 async 函数')
    }
  } catch (e) {
    depthMap.set(db, current)
    try {
      if (current === 0) {
        db.exec('ROLLBACK')
      } else {
        db.exec(`ROLLBACK TO SAVEPOINT sp_${current}`)
        db.exec(`RELEASE SAVEPOINT sp_${current}`)
      }
    } catch (rollbackErr) {
      console.warn('[db] 回滚失败', rollbackErr)
    }
    throw e
  }

  try {
    if (current === 0) {
      db.exec('COMMIT')
    } else {
      db.exec(`RELEASE SAVEPOINT sp_${current}`)
    }
    depthMap.set(db, current)
  } catch (commitErr) {
    depthMap.set(db, current)
    try {
      if (current === 0) {
        db.exec('ROLLBACK')
      } else {
        db.exec(`ROLLBACK TO SAVEPOINT sp_${current}`)
        db.exec(`RELEASE SAVEPOINT sp_${current}`)
      }
    } catch (rollbackErr) {
      console.warn('[db] 提交失败后回滚失败', rollbackErr)
    }
    throw commitErr
  }

  return result
}
