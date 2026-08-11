import { ipcMain, dialog } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { getConnection } from '@main/database/connection'
import { refreshSingleFeed } from '@main/services/refresher'
import { scheduleSync } from '@main/services/sync'
import { getMainWindow } from '@main/app/window'
import { success, error } from './util'
import opml from 'opml'

interface FeedEntry {
  title?: string
  url: string
  siteUrl?: string
  category?: string
}

interface OpmlSub {
  text?: string
  title?: string
  xmlUrl?: string
  htmlUrl?: string
  subs?: OpmlSub[]
}

function parseOpml(content: string): Promise<{ subs?: OpmlSub[] }> {
  return new Promise((resolve, reject) => {
    opml.parse(
      content,
      (err: Error | undefined, result: { opml: { body: { subs?: OpmlSub[] } } }) => {
        if (err) reject(err)
        else resolve(result.opml.body)
      }
    )
  })
}

function collectFeeds(subs: OpmlSub[] | undefined, parentCategory?: string): FeedEntry[] {
  const feeds: FeedEntry[] = []
  if (!subs) return feeds

  for (const outline of subs) {
    if (outline.xmlUrl) {
      feeds.push({
        title: outline.title || outline.text,
        url: outline.xmlUrl,
        siteUrl: outline.htmlUrl,
        category: parentCategory
      })
    }
    if (outline.subs?.length) {
      const category =
        parentCategory ?? (outline.xmlUrl ? undefined : outline.text || outline.title)
      feeds.push(...collectFeeds(outline.subs, category))
    }
  }
  return feeds
}

function getOrCreateCategory(db: ReturnType<typeof getConnection>, name: string): number {
  const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(name) as
    { id: number } | undefined
  if (existing) return existing.id
  const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name)
  return result.lastInsertRowid as number
}

function importFeeds(entries: FeedEntry[]): { total: number; added: number; skipped: number } {
  const db = getConnection()

  const newEntries = entries.filter((entry) => {
    const existing = db.prepare('SELECT id FROM feeds WHERE url = ?').get(entry.url)
    return !existing
  })

  const skippedDuplicates = entries.length - newEntries.length

  const doImport = db.transaction(() => {
    for (const entry of newEntries) {
      let categoryId: number | null = null
      if (entry.category) {
        categoryId = getOrCreateCategory(db, entry.category)
      }

      const result = db
        .prepare('INSERT INTO feeds (url, title, site_url, category_id) VALUES (?, ?, ?, ?)')
        .run(entry.url, entry.title || entry.url, entry.siteUrl || null, categoryId)
      void refreshSingleFeed(result.lastInsertRowid as number)
    }
  })

  doImport()

  scheduleSync()

  return { total: entries.length, added: newEntries.length, skipped: skippedDuplicates }
}

function exportOpml(): string {
  const db = getConnection()
  const feeds = db
    .prepare(
      `SELECT f.*, c.name as category_name
    FROM feeds f
    LEFT JOIN categories c ON f.category_id = c.id
    ORDER BY c.sort_order ASC, c.name ASC, f.sort_order ASC, f.id ASC`
    )
    .all() as {
    title: string
    url: string
    site_url: string | null
    category_name: string | null
  }[]

  const categorized: Record<
    string,
    { title: string; url: string; site_url: string | null; category_name: string | null }[]
  > = {}
  const uncategorized: {
    title: string
    url: string
    site_url: string | null
    category_name: string | null
  }[] = []
  for (const feed of feeds) {
    if (feed.category_name) {
      if (!categorized[feed.category_name]) categorized[feed.category_name] = []
      categorized[feed.category_name].push(feed)
    } else {
      uncategorized.push(feed)
    }
  }

  const subs: OpmlSub[] = []
  for (const [catName, catFeeds] of Object.entries(categorized)) {
    subs.push({
      text: catName,
      title: catName,
      subs: catFeeds.map((f) => ({
        text: f.title,
        title: f.title,
        xmlUrl: f.url,
        htmlUrl: f.site_url || undefined
      }))
    })
  }
  for (const feed of uncategorized) {
    subs.push({
      text: feed.title,
      title: feed.title,
      xmlUrl: feed.url,
      htmlUrl: feed.site_url || undefined
    })
  }

  return opml.stringify({
    opml: {
      head: { title: 'Feed 订阅源导出' },
      body: { subs }
    }
  })
}

export function registerOpmlHandlers(): void {
  ipcMain.handle('opml:import', async () => {
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
      const body = await parseOpml(content)
      const entries = collectFeeds(body.subs)
      const importResult = importFeeds(entries)

      if (importResult.added > 0) {
        getMainWindow()?.webContents.send('opml:imported')
      }

      return success({ canceled: false, ...importResult })
    } catch (e) {
      return error((e as Error).message)
    }
  })

  ipcMain.handle('opml:export', async () => {
    try {
      const opmlData = exportOpml()

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
