import Store from 'electron-store'

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  updateInterval: number // RSS 刷新间隔，分钟，默认 30
  fontSize: number
  windowBounds: { x?: number; y?: number; width: number; height: number }
  autoCheckUpdate: boolean // 是否自动检查更新，默认 true
  updateCheckInterval: number // 自动检查更新间隔，分钟，默认 360（6 小时）
}

const defaults: AppSettings = {
  theme: 'system',
  updateInterval: 30,
  fontSize: 16,
  // 默认窗口尺寸：三栏布局（侧栏 320px + 列表 flex-4 + 正文 flex-8 = 1:2）。
  // 1440 宽时列表约 357px、正文约 715px，正文行宽最舒适；780 高在 13" 屏（1440×900）可完整显示
  windowBounds: { width: 1440, height: 780 },
  autoCheckUpdate: true,
  updateCheckInterval: 360
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
