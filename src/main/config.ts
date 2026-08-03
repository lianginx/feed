import Store from 'electron-store'

/** 订阅源同步载体类型 */
export type SyncProvider = 'none' | 'gist' | 'gitee' | 'webdav'

export interface SyncConfig {
  provider: SyncProvider
  /** GitHub Gist / Gitee 的访问 token */
  token?: string
  /** 远端 gist 的 id（Gist/Gitee 载体使用，创建后自动记住） */
  gistId?: string
  /** WebDAV 服务器地址（目录 URL，末尾不含斜杠） */
  webdavUrl?: string
  webdavUsername?: string
  webdavPassword?: string
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  updateInterval: number // RSS 刷新间隔，分钟，默认 30
  windowBounds: { x?: number; y?: number; width: number; height: number }
  autoCheckUpdate: boolean // 是否自动检查更新，默认 true
  updateCheckInterval: number // 自动检查更新间隔，分钟，默认 360（6 小时）
  sync: SyncConfig // 订阅源同步配置
  /** 同步内部状态：上次同步快照（不参与用户配置 UI） */
  syncLastDump?: string
  /** 同步内部状态：上次同步时间戳（不参与用户配置 UI） */
  syncLastSyncedAt?: number
}

const defaults: AppSettings = {
  theme: 'system',
  updateInterval: 30,
  windowBounds: { width: 1440, height: 870 },
  autoCheckUpdate: true,
  updateCheckInterval: 360,
  sync: { provider: 'none' }
}

const store = new Store<AppSettings>({
  defaults
})

export function getSettings(): AppSettings {
  // 用 defaults 兜底合并：electron-store 的 defaults 只在配置文件首次创建时生效，
  // 已存在的旧配置文件不会自动补新字段（如 autoCheckUpdate），
  // 这里手动合并，确保缺失字段返回默认值而非 undefined
  return { ...defaults, ...store.store }
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(store as any).set(key, value)
    }
  }
  return { ...defaults, ...store.store }
}

export default store
