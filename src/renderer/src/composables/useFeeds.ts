import { ref, computed, onMounted, onUnmounted } from 'vue'

import { useArticles } from './useArticles'
import type { AdapterInfo } from '../types'

export type FilterType = 'all' | 'unread' | 'starred'

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
const filter = ref<FilterType | undefined>('all')
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

  /** 内置路由（站点适配器）列表 */
  async function listAdapters(): Promise<AdapterInfo[]> {
    const result = await window.api.feeds.listAdapters()
    return result.success && result.data ? result.data : []
  }

  /** 添加内置路由：主进程一次抓取即验证+入库，这里只需刷新列表并选中 */
  async function addAdapter(
    adapterId: string,
    params: Record<string, string>,
    categoryId?: number
  ): Promise<number | false> {
    // Vue ref 的 value 是 reactive Proxy，IPC 结构化克隆无法克隆 Proxy，需展开成普通对象
    const result = await window.api.feeds.addAdapter({
      adapterId,
      params: { ...params },
      categoryId
    })
    if (result.success && result.data) {
      const feedId = result.data.id
      await loadFeeds()
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
    if (id !== null) selectedCategoryId.value = undefined
  }

  function selectCategory(id: number | null | undefined): void {
    selectedCategoryId.value = id
    if (id !== undefined) selectedFeedId.value = null
  }

  // 监听单个订阅源刷新进度
  let stopRefreshListener: (() => void) | null = null

  onMounted(() => {
    stopRefreshListener = window.api.feeds.onRefreshProgress((data) => {
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
          if (selectedFeedId.value !== null) {
            if (data.feedId === selectedFeedId.value) {
              loadArticles(selectedFeedId.value, undefined, filter.value)
            }
          } else {
            loadArticles(undefined, selectedCategoryId.value, filter.value)
          }
        } else if (data.status === 'error') {
          loadFeeds()
        }
      }
    })
  })

  onUnmounted(() => {
    stopRefreshListener?.()
  })

  return {
    categories,
    feeds,
    filteredFeeds,
    selectedFeedId,
    selectedCategoryId,
    filter,
    unreadCount,
    loading,
    refreshingFeedIds,
    loadFeeds,
    addFeed,
    listAdapters,
    addAdapter,
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
