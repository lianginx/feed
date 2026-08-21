import type { AppDatabase } from './connection'
import { DEFAULT_CATEGORIES, DEFAULT_FEEDS } from './defaultFeeds'

const SEEDED_KEY = 'seeded_default_feeds'

export function seedDefaultFeeds(db: AppDatabase): void {
  const seeded = db.prepare('SELECT 1 FROM _app_state WHERE key = ?').get(SEEDED_KEY)
  if (seeded) return

  const { count } = db.prepare('SELECT COUNT(*) AS count FROM feeds').get() as {
    count: number
  }
  if (count > 0) {
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
