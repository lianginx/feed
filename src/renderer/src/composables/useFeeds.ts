import { ref, computed } from 'vue'

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
  custom_title: number
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
const selectedCategoryId = ref<number | null | undefined>(undefined)
const loading = ref(false)
const refreshingFeedIds = ref<Set<number>>(new Set())

// 订阅源刷新进度监听：模块级单次注册，避免被多个组件重复订阅
let refreshListenerRegistered = false

function registerRefreshListener(): void {
  if (refreshListenerRegistered) return
  refreshListenerRegistered = true
  window.api.feeds.onRefreshProgress((data) => {
    if (data.status === 'fetching') {
      refreshingFeedIds.value = new Set(refreshingFeedIds.value).add(data.feedId)
    } else {
      const next = new Set(refreshingFeedIds.value)
      next.delete(data.feedId)
      refreshingFeedIds.value = next

      // 刷新完成后重载列表，更新未读数
      if (data.status === 'complete' || data.status === 'error') {
        loadFeeds()
      }
    }
  })
}

const filteredFeeds = computed(() => {
  if (selectedCategoryId.value === undefined) return feeds.value
  if (selectedCategoryId.value === null) return feeds.value.filter((f) => f.category_id === null)
  return feeds.value.filter((f) => f.category_id === selectedCategoryId.value)
})

const unreadCount = computed(() => {
  return feeds.value.reduce((sum, f) => sum + f.unread_count, 0)
})

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

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useFeeds() {
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
    data: { title?: string; url?: string; categoryId?: number | null; customTitle?: number }
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

  async function refreshCategoryFeeds(catId: number | null): Promise<void> {
    const targetFeeds = feeds.value.filter((f) => f.category_id === catId)
    await Promise.allSettled(targetFeeds.map((f) => refreshSingleFeed(f.id)))
  }

  async function refreshAllFeeds(): Promise<void> {
    await Promise.allSettled(feeds.value.map((f) => refreshSingleFeed(f.id)))
  }

  function selectFeed(id: number | null): void {
    selectedFeedId.value = id
    if (id !== null) {
      selectedCategoryId.value = undefined
    }
  }

  function selectCategory(id: number | null | undefined): void {
    selectedCategoryId.value = id
    if (id !== undefined) {
      selectedFeedId.value = null
    }
  }

  // 惰性单次注册，随应用生命周期存在，不随单个组件卸载而关闭
  registerRefreshListener()

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
