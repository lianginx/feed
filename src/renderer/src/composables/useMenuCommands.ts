import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useSearchFocus } from './useSearchFocus'
import { useConfirmDialog } from './useConfirmDialog'
import { useFeeds } from './useFeeds'
import { useArticles } from './useArticles'
import { useUpdater } from './useUpdater'
import { useTranslate } from './useTranslate'

export function useMenuCommands(): void {
  const { requestSearchFocus } = useSearchFocus()
  const { confirm } = useConfirmDialog()
  const { checkForUpdates } = useUpdater()
  const {
    selectedFeedId,
    selectedCategoryId,
    filter,
    refreshSingleFeed,
    refreshCategoryFeeds,
    refreshAllFeeds
  } = useFeeds()
  const { currentArticle, toggleStar, toggleRead, markAllRead, markScopeRead } = useArticles()
  const { shown, configured, toggle, refresh } = useTranslate()

  // 同步菜单可用状态：无选中文章时禁用 ⌘E/⌘D；未选中订阅源/分类时禁用 ⌘R；
  // 未配置翻译凭据时禁用翻译项，译文显示时菜单项变「显示原文」
  const menuState = computed(() => ({
    hasArticle: currentArticle.value !== null,
    hasFeedContext: selectedFeedId.value !== null || selectedCategoryId.value !== undefined,
    isTranslated: shown.value,
    translateConfigured: configured.value
  }))
  const stopStateSync = watch(
    menuState,
    (state) => {
      window.api.menu.updateState(state)
    },
    { immediate: true }
  )

  const stopMenuListeners: (() => void)[] = []

  onMounted(() => {
    stopMenuListeners.push(
      window.api.menu.onRefreshFeed(async () => {
        if (selectedFeedId.value) {
          await refreshSingleFeed(selectedFeedId.value)
        } else if (selectedCategoryId.value !== undefined) {
          await refreshCategoryFeeds(selectedCategoryId.value)
        } else {
          await refreshAllFeeds()
        }
      }),
      window.api.menu.onRefreshAllFeeds(async () => {
        await refreshAllFeeds()
      }),
      window.api.menu.onMarkListRead(async () => {
        const isListContext =
          selectedFeedId.value === null && selectedCategoryId.value === undefined
        if (isListContext && (filter.value === 'all' || filter.value === 'unread')) {
          const ok = await confirm({
            title: '全部文章标为已读',
            message: '将把全部文章标为已读，确定？',
            confirmText: '全部标为已读'
          })
          if (!ok) return
        }
        await markScopeRead()
      }),
      window.api.menu.onMarkAllRead(async () => {
        const ok = await confirm({
          title: '全部标为已读',
          message: '将把全部订阅源的文章标为已读，确定？',
          confirmText: '全部标为已读'
        })
        if (!ok) return
        await markAllRead()
      }),
      window.api.menu.onToggleRead(async () => {
        if (currentArticle.value) {
          await toggleRead(currentArticle.value.id)
        }
      }),
      window.api.menu.onCheckForUpdates(() => {
        void checkForUpdates()
      }),
      window.api.menu.onToggleStar(() => {
        if (currentArticle.value) {
          toggleStar(currentArticle.value.id)
        }
      }),
      window.api.menu.onTranslate(() => {
        void toggle()
      }),
      window.api.menu.onTranslateRefresh(() => {
        void refresh()
      }),
      window.api.menu.onFocusSearch(() => {
        requestSearchFocus()
      })
    )
  })

  onUnmounted(() => {
    stopStateSync()
    stopMenuListeners.forEach((stop) => stop())
  })
}
