import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useAddFeedDialog } from './useAddFeedDialog'
import { useSettingsDialog } from './useSettingsDialog'
import { useSearchFocus } from './useSearchFocus'
import { useConfirmDialog } from './useConfirmDialog'
import { useFeeds } from './useFeeds'
import { useArticles } from './useArticles'

export function useMenuCommands(): void {
  const { showAddFeed } = useAddFeedDialog()
  const { showSettings } = useSettingsDialog()
  const { requestSearchFocus } = useSearchFocus()
  const { confirm } = useConfirmDialog()
  const {
    selectedFeedId,
    selectedCategoryId,
    filter,
    refreshSingleFeed,
    refreshCategoryFeeds,
    refreshAllFeeds
  } = useFeeds()
  const { currentArticle, toggleStar, toggleRead, markAllRead, markScopeRead } = useArticles()

  // 同步菜单可用状态：无选中文章时禁用 ⌘E/⌘D；未选中订阅源/分类时禁用 ⌘R
  const menuState = computed(() => ({
    hasArticle: currentArticle.value !== null,
    hasFeedContext: selectedFeedId.value !== null || selectedCategoryId.value !== undefined
  }))
  const stopStateSync = watch(
    menuState,
    (state) => {
      window.electron.ipcRenderer.send('menu:updateState', state)
    },
    { immediate: true }
  )

  onMounted(() => {
    window.electron.ipcRenderer.on('menu:addFeed', () => {
      showAddFeed.value = true
    })

    window.electron.ipcRenderer.on('menu:refreshFeed', async () => {
      if (selectedFeedId.value) {
        await refreshSingleFeed(selectedFeedId.value)
      } else if (selectedCategoryId.value !== undefined) {
        await refreshCategoryFeeds(selectedCategoryId.value)
      } else {
        await refreshAllFeeds()
      }
    })

    window.electron.ipcRenderer.on('menu:refreshAllFeeds', async () => {
      await refreshAllFeeds()
    })

    window.electron.ipcRenderer.on('menu:markListRead', async () => {
      const isListContext = selectedFeedId.value === null && selectedCategoryId.value === undefined
      if (isListContext && (filter.value === 'all' || filter.value === 'unread')) {
        const ok = await confirm({
          title: '全部文章标为已读',
          message: '将把全部文章标为已读，确定？',
          confirmText: '全部标为已读'
        })
        if (!ok) return
      }
      await markScopeRead()
    })

    window.electron.ipcRenderer.on('menu:markAllRead', async () => {
      const ok = await confirm({
        title: '全部标为已读',
        message: '将把全部订阅源的文章标为已读，确定？',
        confirmText: '全部标为已读'
      })
      if (!ok) return
      await markAllRead()
    })

    window.electron.ipcRenderer.on('menu:toggleRead', async () => {
      if (currentArticle.value) {
        await toggleRead(currentArticle.value.id)
      }
    })

    window.electron.ipcRenderer.on('menu:openSettings', () => {
      showSettings.value = true
    })

    window.electron.ipcRenderer.on('menu:toggleStar', () => {
      if (currentArticle.value) {
        toggleStar(currentArticle.value.id)
      }
    })

    window.electron.ipcRenderer.on('menu:focusSearch', () => {
      requestSearchFocus()
    })
  })

  onUnmounted(() => {
    stopStateSync()
    window.electron.ipcRenderer.removeAllListeners('menu:addFeed')
    window.electron.ipcRenderer.removeAllListeners('menu:refreshFeed')
    window.electron.ipcRenderer.removeAllListeners('menu:refreshAllFeeds')
    window.electron.ipcRenderer.removeAllListeners('menu:markListRead')
    window.electron.ipcRenderer.removeAllListeners('menu:markAllRead')
    window.electron.ipcRenderer.removeAllListeners('menu:toggleRead')
    window.electron.ipcRenderer.removeAllListeners('menu:openSettings')
    window.electron.ipcRenderer.removeAllListeners('menu:toggleStar')
    window.electron.ipcRenderer.removeAllListeners('menu:focusSearch')
  })
}
