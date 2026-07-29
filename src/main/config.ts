import Store from 'electron-store'

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  updateInterval: number // 分钟，默认 30
  fontSize: number
  windowBounds: { x?: number; y?: number; width: number; height: number }
}

const defaults: AppSettings = {
  theme: 'system',
  updateInterval: 30,
  fontSize: 16,
  windowBounds: { width: 1200, height: 800 }
}

const store = new Store<AppSettings>({
  defaults
})

export function getSettings(): AppSettings {
  return store.store
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(store as any).set(key, value)
    }
  }
  return store.store
}

export default store
