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
  autoTranslate: boolean
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
  updateInterval: number
  windowBounds: { x?: number; y?: number; width: number; height: number }
  autoCheckUpdate: boolean
  updateCheckInterval: number
  sync: SyncConfig
  translate: TranslateConfig
  syncLastDump?: string
  syncLastSyncedAt?: number
  syncGistId?: string
  syncGiteeId?: string
  autoLaunch: boolean
  launchHidden: boolean
  siteCookies: Record<string, string>
  proxy: ProxyConfig
  lowMemoryMode: boolean
  toggleWindowShortcut: string
}

export const defaults: AppSettings = {
  theme: 'system',
  updateInterval: 30,
  windowBounds: { width: 1440, height: 870 },
  autoCheckUpdate: true,
  updateCheckInterval: 360,
  sync: { provider: 'none' },
  translate: { provider: 'edge', targetLang: 'zh', autoTranslate: false },
  autoLaunch: false,
  launchHidden: false,
  siteCookies: {},
  proxy: { mode: 'auto' },
  lowMemoryMode: false,
  toggleWindowShortcut: process.platform === 'darwin' ? 'Control+Command+D' : 'Control+Alt+D'
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
