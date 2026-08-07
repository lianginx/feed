import type { UpdaterStatus } from '../../shared/types/updater'

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
  translate: TranslateConfig
  /** 开机自动启动 */
  autoLaunch: boolean
  /** 启动时隐藏窗口（仅登录自动启动时生效） */
  launchHidden: boolean
  /** 站点适配器登录 Cookie：域名 → 整段 cookie 字符串（如 'SESSDATA=xxx; bili_jct=yyy'） */
  siteCookies: Record<string, string>
}

/** 文章翻译配置 */
interface TranslateConfig {
  provider: 'none' | 'baidu'
  baiduAppid?: string
  baiduSecretKey?: string
  targetLang: string
}

/** 一次翻译的结果（由主进程翻译服务返回） */
interface TranslateResult {
  title: string
  content: string
  /** 部分段落翻译失败，已保留原文 */
  degraded: boolean
  /** 文章已为目标语言，未翻译 */
  skipped: boolean
}

/** 订阅源同步配置 */
interface SyncConfig {
  provider: 'none' | 'gist' | 'gitee' | 'webdav'
  token?: string
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

/** 适配器参数声明（用户在添加适配站点时填写） */
interface AdapterParam {
  key: string
  label: string
  required?: boolean
  placeholder?: string
}

/** 内置站点适配器元信息（feeds:listAdapters 返回） */
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
  }) => Promise<ApiResponse<{ id: number }>>
  /** 内置站点适配器列表（适配站点入口用） */
  listAdapters: () => Promise<ApiResponse<AdapterInfo[]>>
  /** 添加适配站点：真实验证抓取后入库 */
  addAdapter: (input: {
    adapterId: string
    params: Record<string, string>
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
  /** 打开「添加订阅源」独立窗口 */
  openAddFeedWindow: () => Promise<ApiResponse<boolean>>
  /** 添加订阅源完成：通知主进程关闭窗口并刷新主窗口列表 */
  notifyAdded: (feedId?: number) => Promise<ApiResponse<boolean>>
  /** 订阅源列表变更（添加完成）事件，返回取消订阅函数 */
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
  /** 用内置浏览器登录站点：弹登录窗口，成功后自动保存该域 cookie */
  loginSite: (input: {
    domain: string
    loginUrl: string
    loginCookieNames?: string[]
  }) => Promise<ApiResponse<{ domain: string; cookie: string } | { cancelled: boolean }>>
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

interface TranslateApi {
  article: (
    id: number,
    targetLang?: string,
    /** 为 true 时忽略缓存，强制重新翻译 */
    forceRefresh?: boolean
  ) => Promise<ApiResponse<TranslateResult>>
  test: (config: TranslateConfig) => Promise<ApiResponse<{ ok: boolean }>>
}

interface UpdaterApi {
  check: () => Promise<ApiResponse<{ state?: string }>>
  download: () => Promise<ApiResponse<{ ok?: boolean }>>
  install: () => Promise<ApiResponse<{ ok?: boolean }>>
  /** 在系统浏览器打开 GitHub Releases 发布页 */
  openReleasePage: () => Promise<ApiResponse<{ ok?: boolean }>>
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
  /** 当前是否显示译文（菜单项变「显示原文」） */
  isTranslated?: boolean
  /** 是否已配置翻译凭据（未配置时禁用菜单项） */
  translateConfigured?: boolean
}

interface MenuApi {
  updateState: (state: MenuState) => void
  onRefreshFeed: (callback: () => void) => () => void
  onRefreshAllFeeds: (callback: () => void) => () => void
  onMarkListRead: (callback: () => void) => () => void
  onMarkAllRead: (callback: () => void) => () => void
  onToggleRead: (callback: () => void) => () => void
  onCheckForUpdates: (callback: () => void) => () => void
  onToggleStar: (callback: () => void) => () => void
  onTranslate: (callback: () => void) => () => void
  onTranslateRefresh: (callback: () => void) => () => void
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
