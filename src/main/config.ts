import Store from 'electron-store'

/** 订阅源同步载体类型 */
export type SyncProvider = 'none' | 'gist' | 'gitee' | 'webdav'

/** 翻译提供商类型 */
export type TranslateProviderKind = 'none' | 'baidu' | 'edge'

export interface TranslateConfig {
  provider: TranslateProviderKind
  /** 百度翻译开放平台 appid */
  baiduAppid?: string
  /** 百度翻译开放平台密钥 */
  baiduSecretKey?: string
  /** 目标语言应用码（默认 zh） */
  targetLang: string
}

export interface SyncConfig {
  provider: SyncProvider
  /** GitHub Gist / Gitee 的访问 token */
  token?: string
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
  translate: TranslateConfig // 文章翻译配置
  /** 同步内部状态：上次同步快照（不参与用户配置 UI） */
  syncLastDump?: string
  /** 同步内部状态：上次同步时间戳（不参与用户配置 UI） */
  syncLastSyncedAt?: number
  /** 同步内部状态：Gist/Gitee 载体记住的远端 gist id（不参与用户配置 UI） */
  syncGistId?: string
  syncGiteeId?: string
  /** 开机自动启动，默认 false */
  autoLaunch: boolean
  /** 启动时隐藏窗口（仅登录自动启动时生效），默认 false */
  launchHidden: boolean
  /** 站点适配器登录 Cookie：域名 → 整段 cookie 字符串（如 'SESSDATA=xxx; bili_jct=yyy'），供 needsBrowser 适配器注入 */
  siteCookies: Record<string, string>
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
  siteCookies: {}
}

const store = new Store<AppSettings>({
  defaults
})

/**
 * 读取设置：用 defaults 兜底合并（electron-store 的 defaults 只在首次创建时生效，
 * 旧配置文件不会自动补新字段）。对 sync/translate 等嵌套对象做深合并，
 * 避免「有对象但缺子字段」（如缺 targetLang）时返回 undefined 导致请求参数异常。
 */
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
