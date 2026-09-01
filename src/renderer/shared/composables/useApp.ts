import { ref } from 'vue'
import type { SyncConfig, TranslateConfig, ProxyConfig } from '@renderer/shared/types'

export type Theme = 'light' | 'dark' | 'system'

const theme = ref<Theme>('system')
const updateInterval = ref(30)
const autoCheckUpdate = ref(true)
const updateCheckInterval = ref(360)
const syncConfig = ref<SyncConfig>({ provider: 'none' })
const translateConfig = ref<TranslateConfig>({
  provider: 'none',
  targetLang: 'zh',
  autoTranslate: false
})
const autoLaunch = ref(false)
const launchHidden = ref(false)
const siteCookies = ref<Record<string, string>>({})
const proxyConfig = ref<ProxyConfig>({ mode: 'auto' })
const lowMemoryMode = ref(false)
const toggleWindowShortcut = ref('')

export function useApp() {
  async function loadSettings() {
    const result = await window.api.config.get()
    if (result.success && result.data) {
      theme.value = result.data.theme
      updateInterval.value = result.data.updateInterval
      autoCheckUpdate.value = result.data.autoCheckUpdate
      updateCheckInterval.value = result.data.updateCheckInterval
      syncConfig.value = result.data.sync ?? { provider: 'none' }
      translateConfig.value = result.data.translate ?? {
        provider: 'none',
        targetLang: 'zh',
        autoTranslate: false
      }
      autoLaunch.value = result.data.autoLaunch
      launchHidden.value = result.data.launchHidden
      siteCookies.value = result.data.siteCookies ?? {}
      proxyConfig.value = result.data.proxy ?? { mode: 'auto' }
      lowMemoryMode.value = result.data.lowMemoryMode ?? false
      toggleWindowShortcut.value = result.data.toggleWindowShortcut
    }
  }

  async function setTheme(t: Theme) {
    theme.value = t
    await window.api.config.update({ theme: t })
  }

  async function setUpdateInterval(minutes: number) {
    updateInterval.value = minutes
    await window.api.config.update({ updateInterval: minutes })
  }

  async function setAutoCheckUpdate(enabled: boolean) {
    autoCheckUpdate.value = enabled
    await window.api.config.update({ autoCheckUpdate: enabled })
  }

  async function setUpdateCheckInterval(minutes: number) {
    updateCheckInterval.value = minutes
    await window.api.config.update({ updateCheckInterval: minutes })
  }

  async function setAutoLaunch(enabled: boolean) {
    autoLaunch.value = enabled
    await window.api.config.update({ autoLaunch: enabled })
  }

  async function setLaunchHidden(enabled: boolean) {
    launchHidden.value = enabled
    await window.api.config.update({ launchHidden: enabled })
  }

  async function setSyncConfig(partial: Partial<SyncConfig>) {
    const next: SyncConfig = { ...syncConfig.value, ...partial }
    if (!next.token) delete next.token
    if (!next.webdavUrl) delete next.webdavUrl
    if (!next.webdavUsername) delete next.webdavUsername
    if (!next.webdavPassword) delete next.webdavPassword
    syncConfig.value = next
    await window.api.config.update({ sync: next })
  }

  async function setTranslateConfig(partial: Partial<TranslateConfig>) {
    const next: TranslateConfig = { ...translateConfig.value, ...partial }
    if (!next.baiduAppid) delete next.baiduAppid
    if (!next.baiduSecretKey) delete next.baiduSecretKey
    translateConfig.value = next
    await window.api.config.update({ translate: next })
  }

  async function setSiteCookies(next: Record<string, string>) {
    const cleaned: Record<string, string> = {}
    for (const [domain, cookie] of Object.entries(next)) {
      if (domain.trim() && cookie.trim()) {
        cleaned[domain.trim()] = cookie.trim()
      }
    }
    siteCookies.value = cleaned
    await window.api.config.update({ siteCookies: cleaned })
  }

  async function setProxyConfig(partial: Partial<ProxyConfig>) {
    const next: ProxyConfig = { ...proxyConfig.value, ...partial }
    if (next.mode !== 'manual') {
      delete next.protocol
      delete next.host
      delete next.port
      delete next.username
      delete next.password
    }
    proxyConfig.value = next
    await window.api.config.update({ proxy: next })
  }

  async function setLowMemoryMode(enabled: boolean) {
    lowMemoryMode.value = enabled
    await window.api.config.update({ lowMemoryMode: enabled })
  }

  function setToggleWindowShortcut(accelerator: string) {
    toggleWindowShortcut.value = accelerator
  }

  return {
    theme,
    updateInterval,
    autoCheckUpdate,
    updateCheckInterval,
    syncConfig,
    translateConfig,
    autoLaunch,
    launchHidden,
    siteCookies,
    proxyConfig,
    lowMemoryMode,
    toggleWindowShortcut,
    loadSettings,
    setTheme,
    setUpdateInterval,
    setAutoCheckUpdate,
    setUpdateCheckInterval,
    setSyncConfig,
    setTranslateConfig,
    setSiteCookies,
    setProxyConfig,
    setAutoLaunch,
    setLaunchHidden,
    setLowMemoryMode,
    setToggleWindowShortcut
  }
}
