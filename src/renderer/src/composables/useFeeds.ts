import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useArticles } from './useArticles'

export interface FeedItem {
  id: number
  url: string
  title: string
  description: string | null
  site_url: string | null
  category_id: number | null
  category_name: string | null
  sort_order: number
  favicon_url: string | null
  last_error: string | null
  error_count: number
  last_updated: number | null
  created_at: number
  unread_count: number
}

interface CategoryItem {
  id: number
  name: string
  sort_order: number
  feed_count: number
}

const categories = ref<CategoryItem[]>([])
const feeds = ref<FeedItem[]>([])
const selectedFeedId = ref<number | null>(null)
const selectedCategoryId = ref<number | null>(null)
const loading = ref(false)
const refreshingFeedIds = ref<Set<number>>(new Set())

const filteredFeeds = computed(() => {
  if (selectedCategoryId.value === null) return feeds.value
  return feeds.value.filter((f) => f.category_id === selectedCategoryId.value)
})

const unreadCount = computed(() => {
  return feeds.value.reduce((sum, f) => sum + f.unread_count, 0)
})

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useFeeds() {
  async function loadFeeds(): Promise<void> {
    loading.value = true
    try {
      const [feedsResult, categoriesResult] = await Promise.all([
        window.api.feeds.list(),
        window.api.categories.list()
      ])
      if (feedsResult.success && feedsResult.data) {
        feeds.value = feedsResult.data
      }
      if (categoriesResult.success && categoriesResult.data) {
        categories.value = categoriesResult.data
      }
    } finally {
      loading.value = false
    }
  }

  async function addFeed(
    url: string,
    title?: string,
    categoryId?: number
  ): Promise<number | false> {
    const result = await window.api.feeds.add({ url, title, categoryId })
    if (result.success && result.data) {
      const feedId = result.data.id
      // 立即获取该订阅源的文章
      await refreshSingleFeed(feedId)
      // 刷新订阅源列表
      await loadFeeds()
      // 选中新添加的订阅源
      selectFeed(feedId)
      return feedId
    }
    return false
  }

  async function deleteFeed(id: number): Promise<boolean> {
    const result = await window.api.feeds.delete(id)
    if (result.success) {
      if (selectedFeedId.value === id) selectedFeedId.value = null
      await loadFeeds()
      return true
    }
    return false
  }

  async function updateFeed(
    id: number,
    data: { title?: string; categoryId?: number | null }
  ): Promise<boolean> {
    const result = await window.api.feeds.update(id, data)
    if (result.success) {
      await loadFeeds()
      return true
    }
    return false
  }

  async function updateSortOrder(items: { id: number; sort_order: number }[]): Promise<void> {
    await window.api.feeds.updateSortOrder(items)
  }

  async function refreshSingleFeed(feedId: number): Promise<boolean> {
    refreshingFeedIds.value = new Set(refreshingFeedIds.value).add(feedId)
    try {
      const result = await window.api.feeds.refresh(feedId)
      return result.success
    } finally {
      const next = new Set(refreshingFeedIds.value)
      next.delete(feedId)
      refreshingFeedIds.value = next
    }
  }

  async function refreshCategoryFeeds(catId: number): Promise<void> {
    const targetFeeds = feeds.value.filter((f) => f.category_id === catId)
    await Promise.allSettled(targetFeeds.map((f) => refreshSingleFeed(f.id)))
  }

  async function refreshAllFeeds(): Promise<void> {
    await Promise.allSettled(feeds.value.map((f) => refreshSingleFeed(f.id)))
  }

  function selectFeed(id: number | null): void {
    selectedFeedId.value = id
    if (id !== null) selectedCategoryId.value = null
  }

  function selectCategory(id: number | null): void {
    selectedCategoryId.value = id
    if (id !== null) selectedFeedId.value = null
  }

  // 监听单个订阅源刷新进度
  const refreshHandler = (
    _event: Electron.IpcRendererEvent,
    data: {
      feedId: number
      status: string
      inserted?: number
      updated?: number
      error?: string
    }
  ): void => {
    if (data.status === 'fetching') {
      refreshingFeedIds.value = new Set(refreshingFeedIds.value).add(data.feedId)
    } else {
      const next = new Set(refreshingFeedIds.value)
      next.delete(data.feedId)
      refreshingFeedIds.value = next

      // 刷新完成后重载列表，更新未读数
      if (data.status === 'complete') {
        loadFeeds()
        // 同步刷新文章列表（与当前视图相关的订阅源完成时）
        const { loadArticles } = useArticles()
        if (selectedFeedId.value === null || data.feedId === selectedFeedId.value) {
          loadArticles(selectedFeedId.value ?? undefined)
        }
      } else if (data.status === 'error') {
        loadFeeds()
      }
    }
  }

  onMounted(() => {
    window.electron.ipcRenderer.on('feeds:refresh-progress', refreshHandler)
  })

  onUnmounted(() => {
    window.electron.ipcRenderer.removeListener('feeds:refresh-progress', refreshHandler)
  })

  return {
    categories,
    feeds,
    filteredFeeds,
    selectedFeedId,
    selectedCategoryId,
    unreadCount,
    loading,
    refreshingFeedIds,
    loadFeeds,
    addFeed,
    deleteFeed,
    updateFeed,
    updateSortOrder,
    refreshSingleFeed,
    refreshCategoryFeeds,
    refreshAllFeeds,
    selectFeed,
    selectCategory
  }
}
