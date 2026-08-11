import { ipcMain } from 'electron'
import { getConnection } from '../database/connection'
import { success, error } from './util'
import { scheduleBadgeUpdate } from '../services/badge'
import { scheduleSync } from '../services/sync'

export function registerCategoryHandlers(): void {
  ipcMain.handle('categories:list', async () => {
    try {
      const db = getConnection()
      const categories = db
        .prepare(
          `
        SELECT c.*,
          (SELECT COUNT(*) FROM feeds WHERE category_id = c.id) as feed_count
        FROM categories c
        ORDER BY c.sort_order ASC, c.id ASC
      `
        )
        .all()
      return success(categories)
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('categories:add', async (_event, name: string) => {
    try {
      const db = getConnection()
      const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name)
      scheduleSync()
      return success({ id: result.lastInsertRowid })
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('categories:update', async (_event, id: number, name: string) => {
    try {
      const db = getConnection()
      db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, id)
      scheduleSync()
      return success({ id })
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('categories:delete', async (_event, id: number) => {
    try {
      const db = getConnection()
      let feedCount = 0
      db.transaction(() => {
        const feedIds: { id: number }[] = db
          .prepare('SELECT id FROM feeds WHERE category_id = ?')
          .all(id) as { id: number }[]
        feedCount = feedIds.length

        if (feedCount > 0) {
          const placeholders = feedIds.map(() => '?').join(',')
          db.prepare(`DELETE FROM articles WHERE feed_id IN (${placeholders})`).run(
            ...feedIds.map((f) => f.id)
          )
          db.prepare(`DELETE FROM feeds WHERE id IN (${placeholders})`).run(
            ...feedIds.map((f) => f.id)
          )
        }

        db.prepare('DELETE FROM categories WHERE id = ?').run(id)
      })()
      scheduleSync()
      return success({ id, feedCount })
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('categories:markAllRead', async (_event, categoryId: number | null) => {
    try {
      const db = getConnection()
      if (categoryId === null) {
        db.prepare(
          'UPDATE articles SET is_read = 1 WHERE is_read = 0 AND feed_id IN (SELECT id FROM feeds WHERE category_id IS NULL)'
        ).run()
      } else {
        db.prepare(
          'UPDATE articles SET is_read = 1 WHERE is_read = 0 AND feed_id IN (SELECT id FROM feeds WHERE category_id = ?)'
        ).run(categoryId)
      }
      scheduleBadgeUpdate()
      return success({ ok: true })
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle(
    'categories:updateSortOrder',
    async (_event, items: { id: number; sort_order: number }[]) => {
      try {
        const db = getConnection()
        const stmt = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?')
        db.transaction(() => {
          for (const item of items) {
            stmt.run(item.sort_order, item.id)
          }
        })()
        scheduleSync()
        return success({ updated: items.length })
      } catch (e) {
        return error((e as Error).message)
      }
    }
  )
}
