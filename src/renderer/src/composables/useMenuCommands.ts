import { onMounted, onUnmounted } from 'vue'
import { useAddFeedDialog } from './useAddFeedDialog'
import { useFeeds } from './useFeeds'
import { useArticles } from './useArticles'
import { useToast } from './useToast'

export function useMenuCommands(): void {
  const { showAddFeed } = useAddFeedDialog()
  const {
    selectedFeedId,
    selectedCategoryId,
    refreshSingleFeed,
    refreshCategoryFeeds,
    refreshAllFeeds,
    loadFeeds
  } = useFeeds()
  const { currentArticle, toggleStar, markAllRead, loadArticles } = useArticles()
  const { showToast } = useToast()

  onMounted(() => {
    window.electron.ipcRenderer.on('menu:addFeed', () => {
      showAddFeed.value = true
    })

    window.electron.ipcRenderer.on('menu:refreshFeed', async () => {
      if (selectedFeedId.value) {
        await refreshSingleFeed(selectedFeedId.value)
        await loadArticles(selectedFeedId.value)
      } else if (selectedCategoryId.value) {
        await refreshCategoryFeeds(selectedCategoryId.value)
        await loadArticles(undefined)
      } else {
        await refreshAllFeeds()
        await loadArticles(undefined)
      }
      showToast('已刷新')
    })

    window.electron.ipcRenderer.on('menu:markAllRead', async () => {
      await markAllRead(selectedFeedId.value ?? undefined)
      // 同步刷新侧边栏未读计数
      await loadFeeds()
      showToast('已全部标为已读')
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
    window.electron.ipcRenderer.removeAllListeners('menu:markAllRead')
    window.electron.ipcRenderer.removeAllListeners('menu:toggleStar')
  })
}
