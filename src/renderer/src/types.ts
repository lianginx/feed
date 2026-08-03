/** 订阅源同步载体类型（与 preload 声明保持一致） */
export type SyncProvider = 'none' | 'gist' | 'gitee' | 'webdav'

/** 订阅源同步配置 */
export interface SyncConfig {
  provider: SyncProvider
  token?: string
  gistId?: string
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
