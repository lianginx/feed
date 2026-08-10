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

  function refreshSingleFeed(feedId: number): void {
    void window.api.feeds.refresh(feedId)
  }

  function refreshCategoryFeeds(catId: number | null): void {
    feeds.value.filter((f) => f.category_id === catId).forEach((f) => refreshSingleFeed(f.id))
  }

  function refreshAllFeeds(): void {
    feeds.value.forEach((f) => refreshSingleFeed(f.id))
  }

  function markRefreshing(feedId: number, active: boolean): void {
    const next = new Set(refreshingFeedIds.value)
    if (active) {
      next.add(feedId)
    } else {
      next.delete(feedId)
    }
    refreshingFeedIds.value = next
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

  return {
    categories,
    feeds,
    filteredFeeds,
    selectedFeedId,
    selectedCategoryId,
    unreadCount,
    loading,
    refreshingFeedIds,
    markRefreshing,
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
