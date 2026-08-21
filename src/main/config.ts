import Store from 'electron-store'

export type SyncProvider = 'none' | 'gist' | 'gitee' | 'webdav'

export type TranslateProviderKind = 'none' | 'baidu' | 'edge'

export type ProxyMode = 'auto' | 'none' | 'manual'

export interface ProxyConfig {
  mode: ProxyMode
  protocol?: 'http' | 'socks5'
  host?: string
  port?: number
  username?: string
  password?: string
}

export interface TranslateConfig {
  provider: TranslateProviderKind
  baiduAppid?: string
  baiduSecretKey?: string
  targetLang: string
}

export interface SyncConfig {
  provider: SyncProvider
  token?: string
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
  translate: TranslateConfig // 文章翻译配置
  syncLastDump?: string
  syncLastSyncedAt?: number
  syncGistId?: string
  syncGiteeId?: string
  autoLaunch: boolean
  launchHidden: boolean
  siteCookies: Record<string, string>
  proxy: ProxyConfig
  lowMemoryMode: boolean
}

const defaults: AppSettings = {
  theme: 'system',
  updateInterval: 30,
  windowBounds: { width: 1440, height: 870 },
  autoCheckUpdate: true,
  updateCheckInterval: 360,
  sync: { provider: 'none' },
  translate: { provider: 'edge', targetLang: 'zh' },
  autoLaunch: false,
  launchHidden: false,
  siteCookies: {},
  proxy: { mode: 'auto' },
  lowMemoryMode: false
}

const store = new Store<AppSettings>({
  defaults
})

function readSettings(): AppSettings {
  const storedSync = store.store.sync as SyncConfig | undefined
  const storedTranslate = store.store.translate as TranslateConfig | undefined
  return {
    ...defaults,
    ...store.store,
    sync: { ...defaults.sync, ...(storedSync ?? {}) },
    translate: { ...defaults.translate, ...(storedTranslate ?? {}) }
  }
}

export function getSettings(): AppSettings {
  return readSettings()
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(store as any).set(key, value)
    }
  }
  return readSettings()
}

export default store
