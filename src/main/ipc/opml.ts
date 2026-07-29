import { ipcMain, dialog } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { getConnection } from '../database/connection'
import { validateFeed } from '../services/rss'
import { success, error } from './util'
import opml from 'opml'

export function registerOpmlHandlers(): void {
  ipcMain.handle('opml:import', async (_event, opmlContent: string) => {
    try {
      const feedUrls: { title?: string; url: string }[] = []

      // 解析 OPML
      const parsedOpml = await opml.parse(opmlContent)
      for (const outline of parsedOpml.children || []) {
        if (outline.xmlUrl) {
          feedUrls.push({ title: outline.title || outline.text, url: outline.xmlUrl })
        }
        if (outline.children) {
          for (const child of outline.children) {
            if (child.xmlUrl) {
              feedUrls.push({ title: child.title || child.text, url: child.xmlUrl })
            }
          }
        }
      }

      // 逐个添加
      const db = getConnection()
      let added = 0
      let skipped = 0

      for (const feedUrl of feedUrls) {
        const existing = db.prepare('SELECT id FROM feeds WHERE url = ?').get(feedUrl.url)
        if (existing) {
          skipped++
          continue
        }

        try {
          const validation = await validateFeed(feedUrl.url)
          if (!validation.valid) {
            skipped++
            continue
          }

          db.prepare('INSERT INTO feeds (url, title) VALUES (?, ?)').run(
            feedUrl.url,
            feedUrl.title || validation.title || feedUrl.url
          )
          added++
        } catch {
          skipped++
        }
      }

      return success({ total: feedUrls.length, added, skipped })
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('opml:export', async () => {
    try {
      const db = getConnection()
      const feeds = db
        .prepare(
          `
        SELECT f.*, c.name as category_name
        FROM feeds f
        LEFT JOIN categories c ON f.category_id = c.id
        ORDER BY f.id ASC
      `
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .all() as any[]

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const outlines: any[] = []

      for (const feed of feeds) {
        outlines.push({
          title: feed.title,
          text: feed.title,
          xmlUrl: feed.url,
          htmlUrl: feed.site_url || undefined
        })
      }

      const opmlData = opml.stringify({
        title: 'Feed 订阅源导出',
        children: outlines
      })

      return success(opmlData)
    } catch (e) {
      return error((e as Error).message)
    }
  })

  // 打开 OPML 文件并导入
  ipcMain.handle('opml:importFromFile', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: '导入 OPML',
        filters: [{ name: 'OPML', extensions: ['opml', 'xml'] }],
        properties: ['openFile']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return success({ canceled: true })
      }

      const content = readFileSync(result.filePaths[0], 'utf-8')

      const feedUrls: { title?: string; url: string }[] = []
      const parsedOpml = await opml.parse(content)
      for (const outline of parsedOpml.children || []) {
        if (outline.xmlUrl) {
          feedUrls.push({ title: outline.title || outline.text, url: outline.xmlUrl })
        }
        if (outline.children) {
          for (const child of outline.children) {
            if (child.xmlUrl) {
              feedUrls.push({ title: child.title || child.text, url: child.xmlUrl })
            }
          }
        }
      }

      const db = getConnection()
      let added = 0
      let skipped = 0

      for (const feedUrl of feedUrls) {
        const existing = db.prepare('SELECT id FROM feeds WHERE url = ?').get(feedUrl.url)
        if (existing) {
          skipped++
          continue
        }

        try {
          const validation = await validateFeed(feedUrl.url)
          if (!validation.valid) {
            skipped++
            continue
          }

          db.prepare('INSERT INTO feeds (url, title) VALUES (?, ?)').run(
            feedUrl.url,
            feedUrl.title || validation.title || feedUrl.url
          )
          added++
        } catch {
          skipped++
        }
      }

      return success({ canceled: false, total: feedUrls.length, added, skipped })
    } catch (e) {
      return error((e as Error).message)
    }
  })

  // 导出 OPML 到文件
  ipcMain.handle('opml:exportToFile', async () => {
    try {
      const db = getConnection()
      const feeds = db
        .prepare(
          `
        SELECT f.*, c.name as category_name
        FROM feeds f
        LEFT JOIN categories c ON f.category_id = c.id
        ORDER BY f.id ASC
      `
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .all() as any[]

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const outlines: any[] = []

      for (const feed of feeds) {
        outlines.push({
          title: feed.title,
          text: feed.title,
          xmlUrl: feed.url,
          htmlUrl: feed.site_url || undefined
        })
      }

      const opmlData = opml.stringify({
        title: 'Feed 订阅源导出',
        children: outlines
      })

      const saveResult = await dialog.showSaveDialog({
        title: '导出 OPML',
        defaultPath: 'feed-subscriptions.opml',
        filters: [{ name: 'OPML', extensions: ['opml', 'xml'] }]
      })

      if (saveResult.canceled || !saveResult.filePath) {
        return success({ canceled: true })
      }

      writeFileSync(saveResult.filePath, opmlData, 'utf-8')
      return success({ canceled: false, filePath: saveResult.filePath })
    } catch (e) {
      return error((e as Error).message)
    }
  })
}
