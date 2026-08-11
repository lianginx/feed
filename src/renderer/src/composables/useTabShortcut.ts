import { onUnmounted } from 'vue'
import { useArticleView } from '@renderer/composables/useArticleView'

// Tab 键切换"只看未读"：应用级全局快捷键，在组件 setup 中调用，
// 卸载时通过 onUnmounted 自动释放
export function registerTabShortcut(): void {
  const { selectedView, isUnread } = useArticleView()

  const handler = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return
    if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return
    event.preventDefault()
    // 未读视图本身已是未读筛选，无需重复切换
    if (selectedView.value !== 'unread') {
      isUnread.value = !isUnread.value
    }
  }

  window.addEventListener('keydown', handler, true)
  onUnmounted(() => {
    window.removeEventListener('keydown', handler, true)
  })
}
