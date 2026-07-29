import { onMounted, onUnmounted } from 'vue'
import { useAddFeedDialog } from './useAddFeedDialog'
import { useSettingsDialog } from './useSettingsDialog'
import { useFeeds } from './useFeeds'
import { useArticles } from './useArticles'

export function useMenuCommands(): void {
  const { showAddFeed } = useAddFeedDialog()
  const { showSettings } = useSettingsDialog()
  const {
    selectedFeedId,
    selectedCategoryId,
    refreshSingleFeed,
    refreshCategoryFeeds,
    refreshAllFeeds,
    loadFeeds
  } = useFeeds()
  const { currentArticle, toggleStar, markAllRead } = useArticles()

  onMounted(() => {
    window.electron.ipcRenderer.on('menu:addFeed', () => {
      showAddFeed.value = true
    })

    window.electron.ipcRenderer.on('menu:refreshFeed', async () => {
      if (selectedFeedId.value) {
        await refreshSingleFeed(selectedFeedId.value)
      } else if (selectedCategoryId.value) {
        await refreshCategoryFeeds(selectedCategoryId.value)
      } else {
        await refreshAllFeeds()
      }
    })

    window.electron.ipcRenderer.on('menu:refreshAllFeeds', async () => {
      await refreshAllFeeds()
    })

    window.electron.ipcRenderer.on('menu:markAllRead', async () => {
      await markAllRead(selectedFeedId.value ?? undefined)
      await loadFeeds()
    })

    window.electron.ipcRenderer.on('menu:openSettings', () => {
      showSettings.value = true
    })

    window.electron.ipcRenderer.on('menu:toggleStar', () => {
      if (currentArticle.value) {
        toggleStar(currentArticle.value.id)
      }
    })
  })

  onUnmounted(() => {
    window.electron.ipcRenderer.removeAllListeners('menu:addFeed')
    window.electron.ipcRenderer.removeAllListeners('menu:refreshFeed')
    window.electron.ipcRenderer.removeAllListeners('menu:refreshAllFeeds')
    window.electron.ipcRenderer.removeAllListeners('menu:markAllRead')
    window.electron.ipcRenderer.removeAllListeners('menu:openSettings')
    window.electron.ipcRenderer.removeAllListeners('menu:toggleStar')
  })
}
