import { watch, onMounted, onUnmounted } from 'vue'
import { useMagicKeys } from '@vueuse/core'
import { useApp } from './useApp'
import { useFeeds } from './useFeeds'
import { useArticles } from './useArticles'

export function useShortcuts(): void {
  const { shortcutsEnabled } = useApp()
  const { selectedFeedId } = useFeeds()
  const {
    articles,
    currentArticle,
    focusedIndex,
    openArticle,
    toggleStar,
    markAllRead,
    closeArticle,
    loadArticles
  } = useArticles()

  const keys = useMagicKeys()

  // 拦截浏览器默认快捷键行为，避免与我们的快捷键冲突
  function onKeydown(e: KeyboardEvent): void {
    const isCmdOrCtrl = e.metaKey || e.ctrlKey

    // 阻止页面刷新（Cmd/Ctrl+R — 我们用于刷新订阅源）
    if (isCmdOrCtrl && e.key.toLowerCase() === 'r') {
      e.preventDefault()
    }
    // 阻止浏览器搜索（Cmd/Ctrl+F — 我们有自定义搜索）
    if (isCmdOrCtrl && e.key.toLowerCase() === 'f') {
      e.preventDefault()
    }
    // 阻止加粗等文本格式化快捷键
    if (isCmdOrCtrl && e.key.toLowerCase() === 'b') {
      e.preventDefault()
    }
    // 阻止全选（Cmd/Ctrl+Shift+A — 我们用于全部已读）
    if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'a') {
      e.preventDefault()
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', onKeydown)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown)
  })

  // Enter：打开当前聚焦的文章
  watch(keys.Enter, (pressed) => {
    if (!pressed || !shortcutsEnabled.value) return
    const focused = articles.value[focusedIndex.value]
    if (focused && !currentArticle.value) {
      openArticle(focused.id)
    }
  })

  // Escape：返回文章列表
  watch(keys.Escape, (pressed) => {
    if (!pressed || !shortcutsEnabled.value) return
    if (currentArticle.value) {
      closeArticle()
    }
  })

  // Cmd/Ctrl + B：星标
  watch(keys['Ctrl+B'], (pressed) => {
    if (!pressed || !shortcutsEnabled.value) return
    if (currentArticle.value) {
      toggleStar(currentArticle.value.id)
    }
  })

  // Cmd/Ctrl + R：刷新
  watch(keys['Ctrl+R'], (pressed) => {
    if (!pressed || !shortcutsEnabled.value) return
    if (selectedFeedId.value) {
      window.api.sync.refreshFeed(selectedFeedId.value)
      loadArticles(selectedFeedId.value)
    } else {
      window.api.sync.refreshAll()
    }
  })

  // Cmd/Ctrl + Shift + A：全部已读
  watch(keys['Ctrl+Shift+A'], (pressed) => {
    if (!pressed || !shortcutsEnabled.value) return
    markAllRead(selectedFeedId.value ?? undefined)
  })
}
