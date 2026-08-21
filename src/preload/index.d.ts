import type { UpdaterStatus } from '@shared/types/updater'
import type { ArticleDetail, ArticleListParams, ArticleListResult } from '@shared/types/articles'

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

interface ProxyConfig {
  mode: 'auto' | 'none' | 'manual'
  protocol?: 'http' | 'socks5'
  host?: string
  port?: number
  username?: string
  password?: string
}

interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  updateInterval: number
  windowBounds: { x?: number; y?: number; width: number; height: number }
  autoCheckUpdate: boolean
  updateCheckInterval: number
  sync: SyncConfig
  translate: TranslateConfig
  autoLaunch: boolean
  launchHidden: boolean
  siteCookies: Record<string, string>
  proxy: ProxyConfig
  lowMemoryMode: boolean
}

interface TranslateConfig {
  provider: 'none' | 'baidu' | 'edge'
  baiduAppid?: string
  baiduSecretKey?: string
  targetLang: string
}

interface TranslateResult {
  title: string
  content: string
  degraded: boolean
  skipped: boolean
}

interface SyncConfig {
  provider: 'none' | 'gist' | 'gitee' | 'webdav'
  token?: string
  webdavUrl?: string
  webdavUsername?: string
  webdavPassword?: string
}

interface SyncResult {
  status: 'disabled' | 'noop' | 'pushed' | 'pulled' | 'conflict' | 'error'
  error?: string
  lastSyncedAt?: number
}

type AdapterParamType = 'text' | 'number' | 'select' | 'textarea' | 'url' | 'boolean'

interface AdapterParam {
  key: string
  label: string
  required?: boolean
  placeholder?: string
  type?: AdapterParamType
  description?: string
  options?: { label: string; value: string }[]
}

interface AdapterInfo {
  id: string
  name: string
  description?: string
  domains: string[]
  params: AdapterParam[]
  needsBrowser: boolean
  cookieDomain?: string
}

interface FeedApi {
  list: () => Promise<ApiResponse<Feed[]>>
  add: (params: {
    url: string
    title?: string
    categoryId?: number
  }) => Promise<ApiResponse<boolean>>
  listAdapters: () => Promise<ApiResponse<AdapterInfo[]>>
  addAdapter: (input: {
    adapterId: string
    params: Record<string, string>
    title?: string
    categoryId?: number
  }) => Promise<ApiResponse<boolean>>
  update: (
    id: number,
    data: { title?: string; url?: string; categoryId?: number | null; customTitle?: number }
  ) => Promise<ApiResponse<{ id: number }>>
  delete: (id: number) => Promise<ApiResponse<{ id: number }>>
  updateSortOrder: (
    feeds: { id: number; sort_order: number }[]
  ) => Promise<ApiResponse<{ updated: number }>>
  refreshFavicon: (id: number) => Promise<ApiResponse<{ id: number; favicon_url: string | null }>>
  refresh: (feedId: number) => Promise<ApiResponse<boolean>>
  onRefreshProgress: (callback: (data: RefreshProgressEvent) => void) => () => void
  openAddFeedWindow: () => Promise<ApiResponse<boolean>>
  onInitialUrl: (callback: (url: string) => void) => () => void
  onAddResult: (callback: (data: { success: boolean; error?: string }) => void) => () => void
  onChanged: (callback: (data: { feedId?: number }) => void) => () => void
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
  list: (params: ArticleListParams) => Promise<ApiResponse<ArticleListResult>>
  get: (id: number) => Promise<ApiResponse<ArticleDetail>>
  toggleRead: (id: number) => Promise<ApiResponse<{ id: number; is_read: number }>>
  markAllRead: (
    feedId?: number,
    isStar?: boolean,
    isToday?: boolean
  ) => Promise<ApiResponse<{ ok: boolean }>>
  toggleStar: (id: number) => Promise<ApiResponse<{ id: number; is_starred: number }>>
  getUnreadCounts: () => Promise<ApiResponse<{ feed_id: number; count: number }[]>>
}

interface ConfigApi {
  get: () => Promise<ApiResponse<AppSettings>>
  update: (settings: Record<string, unknown>) => Promise<ApiResponse<AppSettings>>
  loginSite: (input: {
    domain: string
    loginUrl: string
    loginCookieNames?: string[]
  }) => Promise<ApiResponse<{ domain: string; cookie: string } | { cancelled: boolean }>>
  onChanged: (callback: () => void) => () => void
}

interface CacheApi {
  stats: () => Promise<ApiResponse<{ namespace: string; sizeBytes: number; fileCount: number }[]>>
  clear: () => Promise<ApiResponse<{ clearedBytes: number }>>
}

interface OpmlApi {
  import: () => Promise<
    ApiResponse<
      { canceled: true } | { canceled: false; total: number; added: number; skipped: number }
    >
  >
  export: () => Promise<
    ApiResponse<{ canceled: true } | { canceled: false; filePath: string; includeRoutes: boolean }>
  >
  onImported: (callback: () => void) => () => void
}

interface SyncApi {
  run: () => Promise<ApiResponse<SyncResult>>
  resolve: (choice: 'local' | 'remote') => Promise<ApiResponse<SyncResult>>
  status: () => Promise<ApiResponse<{ lastSyncedAt: number | null }>>
  onStatus: (callback: (result: SyncResult) => void) => () => void
}

interface TranslateApi {
  article: (
    id: number,
    targetLang?: string,
    forceRefresh?: boolean
  ) => Promise<ApiResponse<TranslateResult>>
  test: (config: TranslateConfig) => Promise<ApiResponse<{ ok: boolean }>>
}

interface UpdaterApi {
  check: () => Promise<ApiResponse<{ state?: string }>>
  download: () => Promise<ApiResponse<{ ok?: boolean }>>
  install: () => Promise<ApiResponse<{ ok?: boolean }>>
  openReleasePage: () => Promise<ApiResponse<{ ok?: boolean }>>
  onStatus: (callback: (status: UpdaterStatus) => void) => () => void
}

export interface RefreshProgressEvent {
  feedId: number
  status: 'fetching' | 'complete' | 'error'
  inserted?: number
  updated?: number
  error?: string
}

interface MenuState {
  hasArticle: boolean
  hasFeedContext: boolean
  isTranslated?: boolean
  translateConfigured?: boolean
}

interface MenuApi {
  updateState: (state: MenuState) => void
  onRefreshFeed: (callback: () => void) => () => void
  onRefreshAllFeeds: (callback: () => void) => () => void
  onMarkListRead: (callback: () => void) => () => void
  onMarkAllRead: (callback: () => void) => () => void
  onToggleRead: (callback: () => void) => () => void
  onToggleUnread: (callback: () => void) => () => void
  onCheckForUpdates: (callback: () => void) => () => void
  onToggleStar: (callback: () => void) => () => void
  onTranslate: (callback: () => void) => () => void
  onTranslateRefresh: (callback: () => void) => () => void
  onFocusSearch: (callback: () => void) => () => void
}

interface SystemApi {
  platform: string
}

interface ClipboardApi {
  writeText: (text: string) => Promise<ApiResponse<unknown>>
}

interface AppApi {
  clipboard: ClipboardApi
  feeds: FeedApi
  categories: CategoryApi
  articles: ArticleApi
  config: ConfigApi
  cache: CacheApi
  opml: OpmlApi
  sync: SyncApi
  translate: TranslateApi
  updater: UpdaterApi
  menu: MenuApi
  system: SystemApi
}

declare global {
  interface Window {
    api: AppApi
  }
}
