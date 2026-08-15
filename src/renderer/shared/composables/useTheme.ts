import { computed, ref, watch } from 'vue'
import { usePreferredDark } from '@vueuse/core'

export type StyleTheme = 'light' | 'dark'
export type Theme = StyleTheme | 'system'

const theme = ref<Theme>('system')
const isDark = usePreferredDark()
const resolvedTheme = computed<StyleTheme>(() => (isDark.value ? 'dark' : 'light'))

watch(resolvedTheme, (t: StyleTheme) => document.documentElement.setAttribute('data-theme', t), {
  immediate: true
})

export function useTheme() {
  async function loadTheme(): Promise<void> {
    const result = await window.api.config.get()
    if (result.success && result.data) {
      theme.value = result.data.theme
    }
  }

  async function setTheme(t: Theme): Promise<void> {
    theme.value = t
    await window.api.config.update({ theme: t })
  }

  return { theme, resolvedTheme, loadTheme, setTheme }
}
