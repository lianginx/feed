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
