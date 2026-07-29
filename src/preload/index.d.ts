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
  guid: string
  title: string
  url: string | null
  author: string | null
  content: string | null
  summary: string | null
  published_at: number | null
  is_read: number
  is_starred: number
  created_at: number
  feed_title: string
  feed_icon?: string | null
  favicon_url?: string | null
  site_url?: string | null
  cover_image?: string | null
}

interface ArticleListResult {
  articles: Article[]
  hasMore: boolean
}

interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  updateInterval: number
  fontSize: number
  windowBounds: { x?: number; y?: number; width: number; height: number }
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
    data: { title?: string; categoryId?: number }
  ) => Promise<ApiResponse<{ id: number }>>
  delete: (id: number) => Promise<ApiResponse<{ id: number }>>
  updateSortOrder: (
    feeds: { id: number; sort_order: number }[]
  ) => Promise<ApiResponse<{ updated: number }>>
  refreshFavicon: (id: number) => Promise<ApiResponse<{ id: number; favicon_url: string | null }>>
}

interface CategoryApi {
  list: () => Promise<ApiResponse<Category[]>>
  add: (name: string) => Promise<ApiResponse<{ id: number }>>
  update: (id: number, name: string) => Promise<ApiResponse<{ id: number }>>
  delete: (id: number) => Promise<ApiResponse<{ id: number; feedCount: number }>>
  markAllRead: (categoryId: number) => Promise<ApiResponse<{ ok: boolean }>>
}

interface ArticleApi {
  list: (params: {
    feedId?: number
    filter?: 'all' | 'unread' | 'starred'
    cursor?: { publishedAt: number; id: number }
    limit?: number
  }) => Promise<ApiResponse<ArticleListResult>>
  get: (id: number) => Promise<ApiResponse<Article>>
  markRead: (id: number) => Promise<ApiResponse<{ id: number }>>
  markAllRead: (feedId?: number) => Promise<ApiResponse<{ ok: boolean }>>
  toggleStar: (id: number) => Promise<ApiResponse<{ id: number; is_starred: number }>>
  search: (query: string) => Promise<ApiResponse<Article[]>>
  getUnreadCounts: () => Promise<ApiResponse<{ feed_id: number; count: number }[]>>
}

interface ConfigApi {
  get: () => Promise<ApiResponse<AppSettings>>
  update: (settings: Record<string, unknown>) => Promise<ApiResponse<AppSettings>>
}

interface SyncApi {
  refreshFeed: (feedId: number) => Promise<ApiResponse<{ inserted: number; updated: number }>>
  refreshCategory: (
    categoryId: number
  ) => Promise<ApiResponse<{ feedId: number; success: boolean; error?: string }[]>>
  refreshAll: () => Promise<ApiResponse<{ feedId: number; success: boolean; error?: string }[]>>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseFeed: (url: string) => Promise<ApiResponse<any>>
}

interface OpmlApi {
  import: (
    content: string
  ) => Promise<ApiResponse<{ total: number; added: number; skipped: number }>>
  export: () => Promise<ApiResponse<string>>
  importFromFile: () => Promise<
    ApiResponse<
      { canceled: true } | { canceled: false; total: number; added: number; skipped: number }
    >
  >
  exportToFile: () => Promise<
    ApiResponse<{ canceled: true } | { canceled: false; filePath: string }>
  >
}

interface AppApi {
  feeds: FeedApi
  categories: CategoryApi
  articles: ArticleApi
  config: ConfigApi
  sync: SyncApi
  opml: OpmlApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppApi
  }
}
