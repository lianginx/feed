import { ref, computed, watch } from 'vue'

export type Theme = 'light' | 'dark' | 'system'

const theme = ref<Theme>('system')
const updateInterval = ref(30)
const autoCheckUpdate = ref(true)
const updateCheckInterval = ref(360)

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
    applyTheme(resolvedTheme.value)
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

  return {
    theme,
    resolvedTheme,
    updateInterval,
    autoCheckUpdate,
    updateCheckInterval,
    loadSettings,
    setTheme,
    setUpdateInterval,
    setAutoCheckUpdate,
    setUpdateCheckInterval
  }
}
