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
  windowBounds: { x?: number; y?: number; width: number; height: number }
  autoCheckUpdate: boolean
  updateCheckInterval: number
  sync: SyncConfig
}

/** 订阅源同步配置 */
interface SyncConfig {
  provider: 'none' | 'gist' | 'gitee' | 'webdav'
  token?: string
  gistId?: string
  webdavUrl?: string
  webdavUsername?: string
  webdavPassword?: string
}

/** 一次同步的结果（由主进程同步服务返回 / 推送） */
interface SyncResult {
  status: 'disabled' | 'noop' | 'pushed' | 'pulled' | 'conflict' | 'error'
  error?: string
  lastSyncedAt?: number
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
  /** 订阅单个订阅源刷新进度事件，返回取消订阅函数 */
  onRefreshProgress: (callback: (data: RefreshProgressEvent) => void) => () => void
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
  /** 订阅配置变更事件，返回取消订阅函数 */
  onChanged: (callback: () => void) => () => void
}

interface OpmlApi {
  import: () => Promise<
    ApiResponse<
      { canceled: true } | { canceled: false; total: number; added: number; skipped: number }
    >
  >
  export: () => Promise<ApiResponse<{ canceled: true } | { canceled: false; filePath: string }>>
  /** 订阅 OPML 导入完成事件，返回取消订阅函数 */
  onImported: (callback: () => void) => () => void
}

interface SyncApi {
  run: () => Promise<ApiResponse<SyncResult>>
  resolve: (choice: 'local' | 'remote') => Promise<ApiResponse<SyncResult>>
  status: () => Promise<ApiResponse<{ lastSyncedAt: number | null }>>
  /** 订阅同步状态事件（由主进程推送），返回取消订阅函数 */
  onStatus: (callback: (result: SyncResult) => void) => () => void
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
  download: () => Promise<ApiResponse<{ ok?: boolean }>>
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

/** 菜单可用状态（渲染进程 → 主进程，用于菜单项置灰） */
interface MenuState {
  hasArticle: boolean
  hasFeedContext: boolean
}

interface MenuApi {
  updateState: (state: MenuState) => void
  onAddFeed: (callback: () => void) => () => void
  onRefreshFeed: (callback: () => void) => () => void
  onRefreshAllFeeds: (callback: () => void) => () => void
  onMarkListRead: (callback: () => void) => () => void
  onMarkAllRead: (callback: () => void) => () => void
  onToggleRead: (callback: () => void) => () => void
  onCheckForUpdates: (callback: () => void) => () => void
  onToggleStar: (callback: () => void) => () => void
  onFocusSearch: (callback: () => void) => () => void
}

/** 系统信息（仅暴露必要信息，符合 Electron 安全规则 #20） */
interface SystemApi {
  platform: string
}

interface AppApi {
  feeds: FeedApi
  categories: CategoryApi
  articles: ArticleApi
  config: ConfigApi
  opml: OpmlApi
  sync: SyncApi
  updater: UpdaterApi
  menu: MenuApi
  system: SystemApi
}

declare global {
  interface Window {
    api: AppApi
  }
}
