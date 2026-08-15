import { onMounted, onUnmounted } from 'vue'
import { useFeeds } from '@renderer/windows/main/composables/useFeeds'
import { useArticles } from '@renderer/windows/main/composables/useArticles'

export function useFeedsEvents(): void {
  const { markRefreshing, loadFeeds, selectFeed, requestScrollToFeed } = useFeeds()
  const { handleFeedRefreshed } = useArticles()

  let stopRefreshProgress: (() => void) | null = null
  let stopChanged: (() => void) | null = null
  let stopImported: (() => void) | null = null

  onMounted(() => {
    stopRefreshProgress = window.api.feeds.onRefreshProgress((data) => {
      if (data.status === 'fetching') {
        markRefreshing(data.feedId, true)
        return
      }
      markRefreshing(data.feedId, false)
      void loadFeeds()
      if (data.status === 'complete') {
        handleFeedRefreshed(data.feedId, data.inserted ?? 0)
      }
    })
    stopChanged = window.api.feeds.onChanged((data) => {
      void loadFeeds()
      if (data.feedId) {
        selectFeed(data.feedId)
        requestScrollToFeed(data.feedId)
      }
    })
    stopImported = window.api.opml.onImported(() => {
      void loadFeeds()
    })
  })

  onUnmounted(() => {
    stopRefreshProgress?.()
    stopChanged?.()
    stopImported?.()
  })
}
