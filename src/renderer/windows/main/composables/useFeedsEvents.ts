import { onMounted, onUnmounted } from 'vue'
import { useFeeds } from '@renderer/windows/main/composables/useFeeds'
import { useArticles } from '@renderer/windows/main/composables/useArticles'

/**
 * 订阅源相关的主进程事件接入（在 App.vue 中调用一次）：
 * - feeds:refresh-progress：刷新进度（loading 状态 + 按滚动位置决定重载或累计新文章）
 * - feeds:changed：订阅源列表变更（添加窗口完成）后重载列表并选中新源
 * - opml:imported：OPML 导入完成后重载列表
 * 负责「事件 → 领域操作」编排；状态维护仍由 useFeeds / useArticles 各自负责。
 */
export function useFeedsEvents(): void {
  const { markRefreshing, loadFeeds, selectFeed } = useFeeds()
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
        // 由 useArticles 判断订阅源是否与当前视图相关，并按列表滚动位置决定行为
        handleFeedRefreshed(data.feedId, data.inserted ?? 0)
      }
    })
    stopChanged = window.api.feeds.onChanged((data) => {
      void loadFeeds()
      if (data.feedId) {
        selectFeed(data.feedId)
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
