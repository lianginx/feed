import type { AppDatabase } from '@main/database/connection'

export interface SyncSnapshot {
  version: 1
  categories: { name: string; sortOrder: number }[]
  feeds: SyncFeed[]
}

export interface SyncFeed {
  url: string
  title: string
  siteUrl: string | null
  category: string | null
  sortOrder: number
  customTitle: number
  adapterId?: string | null
  adapterParams?: string | null
}

interface CategoryRow {
  id: number
  name: string
  sort_order: number
}

interface FeedRow {
  url: string
  title: string
  site_url: string | null
  category_id: number | null
  sort_order: number
  custom_title: number
  adapter_id: string | null
  adapter_params: string | null
}

/** 由行数据组装快照（纯函数，不访问数据库） */
export function buildSnapshot(
  cats: (CategoryRow & { id: number })[],
  feeds: FeedRow[]
): SyncSnapshot {
  const catNameById = new Map<number, string>(cats.map((c) => [c.id, c.name]))
  return {
    version: 1,
    categories: cats.map((c) => ({ name: c.name, sortOrder: c.sort_order })),
    feeds: feeds.map((f) => ({
      url: f.url,
      title: f.title,
      siteUrl: f.site_url,
      category: f.category_id != null ? (catNameById.get(f.category_id) ?? null) : null,
      sortOrder: f.sort_order,
      customTitle: f.custom_title,
      adapterId: f.adapter_id,
      adapterParams: f.adapter_params
    }))
  }
}

/**
 * 将当前数据库序列化为同步快照字符串。
 * 排序使用设备无关的次级键（url / name），保证同一份数据在任何设备上序列化结果一致。
 */
export function serializeSnapshot(db: AppDatabase): string {
  const cats = db
    .prepare('SELECT id, name, sort_order FROM categories ORDER BY sort_order ASC, name ASC')
    .all() as unknown as (CategoryRow & { id: number })[]
  const feeds = db
    .prepare(
      'SELECT url, title, site_url, category_id, sort_order, custom_title, adapter_id, adapter_params FROM feeds ORDER BY sort_order ASC, url ASC'
    )
    .all() as unknown as FeedRow[]
  return JSON.stringify(buildSnapshot(cats, feeds))
}

export function parseSnapshot(raw: string): SyncSnapshot {
  const parsed = JSON.parse(raw) as Partial<SyncSnapshot> | null
  if (
    !parsed ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.categories) ||
    !Array.isArray(parsed.feeds)
  ) {
    throw new Error('同步数据格式不正确')
  }
  return parsed as SyncSnapshot
}
