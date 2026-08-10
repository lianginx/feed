import type Database from 'better-sqlite3'
import { DEFAULT_CATEGORIES, DEFAULT_FEEDS } from './defaultFeeds'

/**
 * 首次使用时的默认订阅源 seed。
 *
 * 必须在所有迁移执行完毕（schema 已是最新）后调用：
 * 若放在迁移内部执行，会与迁移版本产生顺序耦合（引用后续版本才有的列），
 * 且默认源后续增删改需要发新迁移版本才能生效。这里在最终 schema 上执行，
 * 与迁移彻底解耦。
 *
 * 只写入一次，通过 _app_state 中的 seeded_default_feeds 标记区分「首次使用」
 * 与「用户清空了订阅」：feeds 为空并不等于第一次使用，若仅凭 count 判断，
 * 用户清空全部订阅后重启会被重新写入默认源。
 *
 * 已知局限：标记无法回溯旧版本状态。旧版本（v5 迁移时代）已 seed 过、
 * 之后又清空全部订阅的老用户，升级后无标记且 count == 0，会恢复一次默认源；
 * 恢复写入会同时落标记，此后清空不再恢复。
 */
const SEEDED_KEY = 'seeded_default_feeds'

export function seedDefaultFeeds(db: Database.Database): void {
  const seeded = db.prepare('SELECT 1 FROM _app_state WHERE key = ?').get(SEEDED_KEY)
  if (seeded) return

  const { count } = db.prepare('SELECT COUNT(*) AS count FROM feeds').get() as {
    count: number
  }
  if (count > 0) {
    // 已有数据（老用户）视为已 seed 过，只落标记，防止将来清空订阅后被重新写入
    db.prepare('INSERT INTO _app_state (key, value) VALUES (?, ?)').run(SEEDED_KEY, '1')
    return
  }

  const catStmt = db.prepare('INSERT OR IGNORE INTO categories (name, sort_order) VALUES (?, ?)')
  const catLookup = db.prepare('SELECT id FROM categories WHERE name = ?')
  const feedStmt = db.prepare(
    'INSERT OR IGNORE INTO feeds (url, title, category_id, sort_order, adapter_id, adapter_params) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const markSeeded = db.prepare('INSERT INTO _app_state (key, value) VALUES (?, ?)')

  db.transaction(() => {
    // 按顺序建分类，保证侧边栏展示顺序稳定
    DEFAULT_CATEGORIES.forEach((name, i) => {
      catStmt.run(name, i)
    })

    DEFAULT_FEEDS.forEach((feed, i) => {
      const cat = catLookup.get(feed.category) as { id: number } | undefined
      feedStmt.run(
        feed.url,
        feed.title,
        cat?.id ?? null,
        i,
        feed.adapterId ?? null,
        feed.adapterParams ? JSON.stringify(feed.adapterParams) : null
      )
    })

    markSeeded.run(SEEDED_KEY, '1')
  })()
}
