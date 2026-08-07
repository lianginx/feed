/** 订阅源同步载体类型（与 preload 声明保持一致） */
export type SyncProvider = 'none' | 'gist' | 'gitee' | 'webdav'

/** 翻译提供商类型（与 preload 声明保持一致） */
export type TranslateProviderKind = 'none' | 'baidu'

/** 文章翻译配置 */
export interface TranslateConfig {
  provider: TranslateProviderKind
  baiduAppid?: string
  baiduSecretKey?: string
  targetLang: string
}

/** 一次翻译的结果（由主进程翻译服务返回） */
export interface TranslateResult {
  title: string
  content: string
  /** 部分段落翻译失败，已保留原文 */
  degraded: boolean
  /** 文章已为目标语言，未翻译 */
  skipped: boolean
}

/** 订阅源同步配置 */
export interface SyncConfig {
  provider: SyncProvider
  token?: string
  webdavUrl?: string
  webdavUsername?: string
  webdavPassword?: string
}

/** 一次同步的结果（由主进程同步服务返回 / 推送） */
export interface SyncResult {
  status: 'disabled' | 'noop' | 'pushed' | 'pulled' | 'conflict' | 'error'
  error?: string
  lastSyncedAt?: number
}

/** 适配器参数声明（添加适配站点时填写，与主进程 AdapterParam 一致） */
export interface AdapterParam {
  key: string
  label: string
  required?: boolean
  placeholder?: string
}

/** 内置站点适配器元信息（feeds:listAdapters 返回） */
export interface AdapterInfo {
  id: string
  name: string
  description?: string
  domains: string[]
  params: AdapterParam[]
  needsBrowser: boolean
  cookieDomain?: string
  /** 登录页 URL（「用浏览器登录」用） */
  loginUrl?: string
  /** 登录态 cookie 名（全部出现即视为已登录） */
  loginCookieNames?: string[]
}
