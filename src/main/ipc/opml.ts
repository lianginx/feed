import { ipcMain, dialog } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { getConnection } from '@main/database/connection'
import { withTransaction } from '@main/database/transaction'
import { refreshSingleFeed } from '@main/services/refresher'
import { getAdapter } from '@main/services/routes'
import { scheduleSync } from '@main/services/sync'
import { getMainWindow } from '@main/app/window'
import { success, error } from './util'
import opml from 'opml'

interface FeedEntry {
  title?: string
  url: string
  siteUrl?: string
  category?: string
  adapterId?: string
  adapterParams?: string
}

interface OpmlSub {
  text?: string
  title?: string
  xmlUrl?: string
  htmlUrl?: string
  routeUrl?: string
  adapterId?: string
  adapterParams?: string
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
    const url = outline.xmlUrl || (outline.adapterId ? outline.routeUrl : undefined)
    if (url) {
      feeds.push({
        title: outline.title || outline.text,
        url,
        siteUrl: outline.htmlUrl,
        category: parentCategory,
        adapterId: outline.adapterId,
        adapterParams: outline.adapterParams
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

  const supportedEntries = entries.filter(
    (entry) => !entry.adapterId || getAdapter(entry.adapterId) !== undefined
  )
  const unsupported = entries.length - supportedEntries.length
  const newEntries = supportedEntries.filter((entry) => {
    const existing = db.prepare('SELECT id FROM feeds WHERE url = ?').get(entry.url)
    return !existing
  })

  const skippedDuplicates = supportedEntries.length - newEntries.length

  const insertedIds: number[] = []
  withTransaction(db, () => {
    for (const entry of newEntries) {
      let categoryId: number | null = null
      if (entry.category) {
        categoryId = getOrCreateCategory(db, entry.category)
      }

      const result = db
        .prepare(
          `INSERT INTO feeds (url, title, site_url, category_id, adapter_id, adapter_params)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          entry.url,
          entry.title || entry.url,
          entry.siteUrl || null,
          categoryId,
          entry.adapterId || null,
          entry.adapterParams || null
        )
      insertedIds.push(result.lastInsertRowid as number)
    }
  })
  for (const id of insertedIds) void refreshSingleFeed(id)

  scheduleSync()

  return {
    total: entries.length,
    added: newEntries.length,
    skipped: skippedDuplicates + unsupported
  }
}

function exportOpml(includeRoutes: boolean): string {
  const db = getConnection()
  const routeFilter = includeRoutes ? '' : 'WHERE f.adapter_id IS NULL'
  const feeds = db
    .prepare(
      `SELECT f.*, c.name as category_name
    FROM feeds f
    LEFT JOIN categories c ON f.category_id = c.id
    ${routeFilter}
    ORDER BY c.sort_order ASC, c.name ASC, f.sort_order ASC, f.id ASC`
    )
    .all() as unknown as {
    title: string
    url: string
    site_url: string | null
    category_name: string | null
    adapter_id: string | null
    adapter_params: string | null
  }[]

  const categorized: Record<
    string,
    {
      title: string
      url: string
      site_url: string | null
      category_name: string | null
      adapter_id: string | null
      adapter_params: string | null
    }[]
  > = {}
  const uncategorized: {
    title: string
    url: string
    site_url: string | null
    category_name: string | null
    adapter_id: string | null
    adapter_params: string | null
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
      subs: catFeeds.map((f) => {
        const feed: OpmlSub = {
          text: f.title,
          title: f.title,
          htmlUrl: f.site_url || undefined
        }
        if (f.adapter_id) {
          feed.routeUrl = f.url
          feed.adapterId = f.adapter_id
          feed.adapterParams = f.adapter_params || undefined
        } else {
          feed.xmlUrl = f.url
        }
        return feed
      })
    })
  }
  for (const feed of uncategorized) {
    const outline: OpmlSub = {
      text: feed.title,
      title: feed.title,
      htmlUrl: feed.site_url || undefined
    }
    if (feed.adapter_id) {
      outline.routeUrl = feed.url
      outline.adapterId = feed.adapter_id
      outline.adapterParams = feed.adapter_params || undefined
    } else {
      outline.xmlUrl = feed.url
    }
    subs.push(outline)
  }

  return opml.stringify({
    opml: {
      head: { title: 'Feed 订阅源导出' },
      body: { subs }
    }
  })
}

async function chooseIncludeRoutes(): Promise<boolean | null> {
  const db = getConnection()
  const { count } = db
    .prepare('SELECT COUNT(*) AS count FROM feeds WHERE adapter_id IS NOT NULL')
    .get() as unknown as { count: number }

  if (count === 0) return false

  const result = await dialog.showMessageBox({
    type: 'question',
    title: '导出订阅',
    message: '是否包含内置路由？',
    detail: `当前有 ${count} 个内置路由。\n\n不包含：导出标准 RSS/Atom 订阅，适合迁移到其他 RSS 阅读器。\n\n包含：同时保留内置路由配置，可在 Feed 中恢复；其他 RSS 阅读器通常会忽略这些路由。`,
    buttons: ['不包含内置路由', '包含内置路由', '取消'],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  })

  if (result.response === 2) return null
  return result.response === 1
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
      const includeRoutes = await chooseIncludeRoutes()
      if (includeRoutes === null) return success({ canceled: true })

      const opmlData = exportOpml(includeRoutes)

      const saveResult = await dialog.showSaveDialog({
        title: '导出 OPML',
        defaultPath: includeRoutes
          ? 'feed-subscriptions-with-routes.opml'
          : 'feed-subscriptions.opml',
        filters: [{ name: 'OPML', extensions: ['opml', 'xml'] }]
      })

      if (saveResult.canceled || !saveResult.filePath) {
        return success({ canceled: true })
      }

      writeFileSync(saveResult.filePath, opmlData, 'utf-8')
      return success({ canceled: false, filePath: saveResult.filePath, includeRoutes })
    } catch (e) {
      return error((e as Error).message)
    }
  })
}
