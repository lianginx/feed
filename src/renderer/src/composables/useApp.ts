import { ref, computed, watch } from 'vue'
import type { SyncConfig, TranslateConfig } from '../types'

export type Theme = 'light' | 'dark' | 'system'

const theme = ref<Theme>('system')
const updateInterval = ref(30)
const autoCheckUpdate = ref(true)
const updateCheckInterval = ref(360)
const syncConfig = ref<SyncConfig>({ provider: 'none' })
const translateConfig = ref<TranslateConfig>({ provider: 'none', targetLang: 'zh' })
const autoLaunch = ref(false)
const launchHidden = ref(false)
const siteCookies = ref<Record<string, string>>({})

function resolveTheme(t: Theme): 'light' | 'dark' {
  if (t === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return t
}

const resolvedTheme = computed(() => resolveTheme(theme.value))

function applyTheme(t: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', t)
}

// 监听主题变化
watch(resolvedTheme, applyTheme, { immediate: true })

// 监听系统主题变化
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (theme.value === 'system') {
    // 直接读取实时 matchMedia，避免使用被缓存的 computed（其依赖不含 matchMedia，会返回过期值）
    applyTheme(resolveTheme(theme.value))
  }
})

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useApp() {
  async function loadSettings(): Promise<void> {
    const result = await window.api.config.get()
    if (result.success && result.data) {
      theme.value = result.data.theme
      updateInterval.value = result.data.updateInterval
      autoCheckUpdate.value = result.data.autoCheckUpdate
      updateCheckInterval.value = result.data.updateCheckInterval
      syncConfig.value = result.data.sync ?? { provider: 'none' }
      translateConfig.value = result.data.translate ?? { provider: 'none', targetLang: 'zh' }
      autoLaunch.value = result.data.autoLaunch
      launchHidden.value = result.data.launchHidden
      siteCookies.value = result.data.siteCookies ?? {}
    }
  }

  async function setTheme(t: Theme): Promise<void> {
    theme.value = t
    await window.api.config.update({ theme: t })
  }

  async function setUpdateInterval(minutes: number): Promise<void> {
    updateInterval.value = minutes
    await window.api.config.update({ updateInterval: minutes })
  }

  async function setAutoCheckUpdate(enabled: boolean): Promise<void> {
    autoCheckUpdate.value = enabled
    await window.api.config.update({ autoCheckUpdate: enabled })
  }

  async function setUpdateCheckInterval(minutes: number): Promise<void> {
    updateCheckInterval.value = minutes
    await window.api.config.update({ updateCheckInterval: minutes })
  }

  async function setAutoLaunch(enabled: boolean): Promise<void> {
    autoLaunch.value = enabled
    await window.api.config.update({ autoLaunch: enabled })
  }

  async function setLaunchHidden(enabled: boolean): Promise<void> {
    launchHidden.value = enabled
    await window.api.config.update({ launchHidden: enabled })
  }

  async function setSyncConfig(partial: Partial<SyncConfig>): Promise<void> {
    // 空字符串视为未填写，存储时省略
    const next: SyncConfig = { ...syncConfig.value, ...partial }
    if (!next.token) delete next.token
    if (!next.webdavUrl) delete next.webdavUrl
    if (!next.webdavUsername) delete next.webdavUsername
    if (!next.webdavPassword) delete next.webdavPassword
    syncConfig.value = next
    await window.api.config.update({ sync: next })
  }

  async function setTranslateConfig(partial: Partial<TranslateConfig>): Promise<void> {
    // 空字符串视为未填写，存储时省略（同 setSyncConfig 约定）
    const next: TranslateConfig = { ...translateConfig.value, ...partial }
    if (!next.baiduAppid) delete next.baiduAppid
    if (!next.baiduSecretKey) delete next.baiduSecretKey
    translateConfig.value = next
    await window.api.config.update({ translate: next })
  }

  /** 保存站点登录 Cookie（域名 → 整段 cookie），空值省略 */
  async function setSiteCookies(next: Record<string, string>): Promise<void> {
    const cleaned: Record<string, string> = {}
    for (const [domain, cookie] of Object.entries(next)) {
      if (domain.trim() && cookie.trim()) {
        cleaned[domain.trim()] = cookie.trim()
      }
    }
    siteCookies.value = cleaned
    await window.api.config.update({ siteCookies: cleaned })
  }

  return {
    theme,
    resolvedTheme,
    updateInterval,
    autoCheckUpdate,
    updateCheckInterval,
    syncConfig,
    translateConfig,
    autoLaunch,
    launchHidden,
    siteCookies,
    loadSettings,
    setTheme,
    setUpdateInterval,
    setAutoCheckUpdate,
    setUpdateCheckInterval,
    setSyncConfig,
    setTranslateConfig,
    setSiteCookies,
    setAutoLaunch,
    setLaunchHidden
  }
}
