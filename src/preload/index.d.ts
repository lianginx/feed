import type { ElectronAPI } from '@electron-toolkit/preload'

interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

interface Feed {
  id: number
  url: string
  title: string
  description: string | null
  site_url: string | null
  category_id: number | null
  category_name: string | null
  sort_order: number
  favicon_url: string | null
  last_error: string | null
  error_count: number
  last_updated: number | null
  created_at: number
  unread_count: number
  custom_title: number
}

interface Category {
  id: number
  name: string
  sort_order: number
  feed_count: number
}

interface Article {
  id: number
  feed_id: number
  title: string
  url: string | null
  author: string | null
  summary: string | null
  published_at: number | null
  is_read: number
  is_starred: number
  feed_title: string
  favicon_url?: string | null
  cover_image?: string | null
}

interface ArticleDetail extends Article {
  content: string | null
  guid: string
  site_url: string | null
  created_at: number
}

interface ArticleListResult {
  articles: Article[]
}

interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  updateInterval: number
  fontSize: number
  windowBounds: { x?: number; y?: number; width: number; height: number }
}

interface RefreshResult {
  feedId: number
  success: boolean
  error?: string
  inserted: number
  updated: number
}

interface FeedApi {
  list: () => Promise<ApiResponse<Feed[]>>
  add: (params: {
    url: string
    title?: string
    categoryId?: number
  }) => Promise<ApiResponse<{ id: number }>>
  update: (
    id: number,
    data: { title?: string; url?: string; categoryId?: number | null; customTitle?: number }
  ) => Promise<ApiResponse<{ id: number }>>
  delete: (id: number) => Promise<ApiResponse<{ id: number }>>
  updateSortOrder: (
    feeds: { id: number; sort_order: number }[]
  ) => Promise<ApiResponse<{ updated: number }>>
  refreshFavicon: (id: number) => Promise<ApiResponse<{ id: number; favicon_url: string | null }>>
  refresh: (feedId: number) => Promise<ApiResponse<RefreshResult>>
  parseUrl: (url: string) => Promise<ApiResponse<unknown>>
}

interface CategoryApi {
  list: () => Promise<ApiResponse<Category[]>>
  add: (name: string) => Promise<ApiResponse<{ id: number }>>
  update: (id: number, name: string) => Promise<ApiResponse<{ id: number }>>
  delete: (id: number) => Promise<ApiResponse<{ id: number; feedCount: number }>>
  markAllRead: (categoryId: number | null) => Promise<ApiResponse<{ ok: boolean }>>
  updateSortOrder: (
    items: { id: number; sort_order: number }[]
  ) => Promise<ApiResponse<{ updated: number }>>
}

interface ArticleApi {
  list: (params: {
    feedId?: number
    categoryId?: number | null
    filter?: 'all' | 'unread' | 'starred'
    query?: string
  }) => Promise<ApiResponse<ArticleListResult>>
  get: (id: number) => Promise<ApiResponse<ArticleDetail>>
  toggleRead: (id: number) => Promise<ApiResponse<{ id: number; is_read: number }>>
  markAllRead: (feedId?: number, scope?: 'starred') => Promise<ApiResponse<{ ok: boolean }>>
  toggleStar: (id: number) => Promise<ApiResponse<{ id: number; is_starred: number }>>
  getUnreadCounts: () => Promise<ApiResponse<{ feed_id: number; count: number }[]>>
}

interface ConfigApi {
  get: () => Promise<ApiResponse<AppSettings>>
  update: (settings: Record<string, unknown>) => Promise<ApiResponse<AppSettings>>
}

interface OpmlApi {
  import: () => Promise<
    ApiResponse<
      { canceled: true } | { canceled: false; total: number; added: number; skipped: number }
    >
  >
  export: () => Promise<ApiResponse<{ canceled: true } | { canceled: false; filePath: string }>>
}

/** 自动更新状态（由主进程推送） */
type UpdaterStatus =
  | { state: 'disabled' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded' }
  | { state: 'error'; message: string }

interface UpdaterApi {
  check: () => Promise<ApiResponse<{ state?: string }>>
  install: () => Promise<ApiResponse<{ ok?: boolean }>>
  /** 订阅更新状态事件，返回取消订阅函数 */
  onStatus: (callback: (status: UpdaterStatus) => void) => () => void
}

/** 订阅源刷新进度事件（由后端推送） */
export interface RefreshProgressEvent {
  feedId: number
  status: 'fetching' | 'complete' | 'error'
  inserted?: number
  updated?: number
  error?: string
}

interface AppApi {
  feeds: FeedApi
  categories: CategoryApi
  articles: ArticleApi
  config: ConfigApi
  opml: OpmlApi
  updater: UpdaterApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppApi
  }
}
