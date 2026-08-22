import type { AppDatabase } from '@main/database/connection'
import { withTransaction } from '@main/database/transaction'
import type { SyncSnapshot } from './snapshot'

interface FeedRow {
  id: number
  url: string
  title: string
  site_url: string | null
  category_id: number | null
  sort_order: number
  custom_title: number
  adapter_id: string | null
  adapter_params: string | null
}

/** 用快照整体覆盖本地订阅源与分类（事务内执行，失败自动回滚） */
export function applySnapshot(db: AppDatabase, snapshot: SyncSnapshot): void {
  withTransaction(db, () => {
    const catNameToId = new Map<string, number>()
    for (const c of snapshot.categories) {
      const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(c.name) as
        { id: number } | undefined
      if (existing) {
        db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?').run(
          c.sortOrder,
          existing.id
        )
        catNameToId.set(c.name, Number(existing.id))
      } else {
        const r = db
          .prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)')
          .run(c.name, c.sortOrder)
        catNameToId.set(c.name, Number(r.lastInsertRowid))
      }
    }

    const localFeeds = db.prepare('SELECT * FROM feeds').all() as unknown as FeedRow[]
    const snapshotByUrl = new Map(snapshot.feeds.map((f) => [f.url, f]))
    for (const local of localFeeds) {
      const target = snapshotByUrl.get(local.url)
      if (!target) {
        db.prepare('DELETE FROM articles WHERE feed_id = ?').run(local.id)
        db.prepare('DELETE FROM feeds WHERE id = ?').run(local.id)
      } else {
        db.prepare(
          'UPDATE feeds SET title = ?, site_url = ?, sort_order = ?, custom_title = ?, adapter_id = ?, adapter_params = ? WHERE id = ?'
        ).run(
          target.title,
          target.siteUrl,
          target.sortOrder,
          target.customTitle,
          target.adapterId !== undefined ? target.adapterId : local.adapter_id,
          target.adapterParams !== undefined ? target.adapterParams : local.adapter_params,
          local.id
        )
      }
    }

    const localUrlSet = new Set(localFeeds.map((f) => f.url))
    const insertFeed = db.prepare(
      'INSERT INTO feeds (url, title, site_url, category_id, sort_order, custom_title, adapter_id, adapter_params) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    for (const f of snapshot.feeds) {
      if (localUrlSet.has(f.url)) continue
      const catId = f.category ? (catNameToId.get(f.category) ?? null) : null
      insertFeed.run(
        f.url,
        f.title,
        f.siteUrl,
        catId,
        f.sortOrder,
        f.customTitle,
        f.adapterId ?? null,
        f.adapterParams ?? null
      )
    }

    const setCategory = db.prepare('UPDATE feeds SET category_id = ? WHERE url = ?')
    for (const f of snapshot.feeds) {
      const catId = f.category ? (catNameToId.get(f.category) ?? null) : null
      setCategory.run(catId, f.url)
    }

    const snapshotCatNames = new Set(snapshot.categories.map((c) => c.name))
    const localCats = db.prepare('SELECT id, name FROM categories').all() as unknown as {
      id: number
      name: string
    }[]
    for (const c of localCats) {
      if (!snapshotCatNames.has(c.name)) {
        db.prepare('DELETE FROM categories WHERE id = ?').run(Number(c.id))
      }
    }
  })
}
