import { onMounted, onUnmounted } from 'vue'
import { useApp } from '@renderer/composables/useApp'

/**
 * 应用配置相关的主进程事件接入（在 App.vue 中调用一次）：
 * - config:changed：设置变更后重载配置
 */
export function useAppEvents(): void {
  const { loadSettings } = useApp()

  let stopConfigChanged: (() => void) | null = null

  onMounted(() => {
    stopConfigChanged = window.api.config.onChanged(() => {
      void loadSettings()
    })
  })

  onUnmounted(() => {
    stopConfigChanged?.()
  })
}
