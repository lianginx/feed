import { ref, computed, watch } from 'vue'

export type Theme = 'light' | 'dark' | 'system'

const theme = ref<Theme>('system')
const shortcutsEnabled = ref(true)
const fontSize = ref(16)
const updateInterval = ref(30)

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
      shortcutsEnabled.value = result.data.shortcutsEnabled
      fontSize.value = result.data.fontSize
      updateInterval.value = result.data.updateInterval
    }
  }

  async function setTheme(t: Theme): Promise<void> {
    theme.value = t
    await window.api.config.update({ theme: t })
  }

  async function setShortcutsEnabled(enabled: boolean): Promise<void> {
    shortcutsEnabled.value = enabled
    await window.api.config.update({ shortcutsEnabled: enabled })
  }

  async function setFontSize(size: number): Promise<void> {
    fontSize.value = size
    await window.api.config.update({ fontSize: size })
  }

  async function setUpdateInterval(minutes: number): Promise<void> {
    updateInterval.value = minutes
    await window.api.config.update({ updateInterval: minutes })
  }

  return {
    theme,
    resolvedTheme,
    shortcutsEnabled,
    fontSize,
    updateInterval,
    loadSettings,
    setTheme,
    setShortcutsEnabled,
    setFontSize,
    setUpdateInterval
  }
}
