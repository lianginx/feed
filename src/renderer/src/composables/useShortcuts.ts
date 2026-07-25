import { watch } from 'vue'
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
