import { ref } from 'vue'
import { useFeeds } from './useFeeds'

interface ArticleItem {
  id: number
  feed_id: number
  title: string
  author: string | null
  summary: string | null
  published_at: number | null
  is_read: number
  is_starred: number
  url: string | null
  feed_title: string
  favicon_url?: string | null
}

interface ArticleDetail extends ArticleItem {
  content: string | null
  guid: string
  site_url: string | null
  created_at: number
}

type FilterType = 'all' | 'unread' | 'starred'

const articles = ref<ArticleItem[]>([])
const currentArticle = ref<ArticleDetail | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(true)
const filter = ref<FilterType>('all')
const focusedIndex = ref(0)

// 游标分页
let cursor: { publishedAt: number; id: number } | null = null
let currentFeedId: number | null = null

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useArticles() {
  async function loadArticles(feedId?: number, reset = true): Promise<void> {
    if (reset) {
      cursor = null
      articles.value = []
      hasMore.value = true
      currentFeedId = feedId ?? null
      currentArticle.value = null // 切换时关闭文章详情栏
    }

    loading.value = reset
    loadingMore.value = !reset

    try {
      const result = await window.api.articles.list({
        feedId: feedId ?? currentFeedId ?? undefined,
        filter: filter.value,
        cursor: cursor ?? undefined,
        limit: 50
      })

      if (result.success && result.data) {
        if (reset) {
          articles.value = result.data.articles
        } else {
          articles.value = [...articles.value, ...result.data.articles]
        }
        hasMore.value = result.data.hasMore

        // 更新游标
        const last = result.data.articles[result.data.articles.length - 1]
        if (last) {
          cursor = { publishedAt: last.published_at ?? Math.floor(Date.now() / 1000), id: last.id }
        } else {
          cursor = null
        }
      }
    } finally {
      loading.value = false
      loadingMore.value = false
    }
  }

  async function loadMore(): Promise<void> {
    if (!hasMore.value || loadingMore.value) return
    await loadArticles(undefined, false)
  }

  async function openArticle(id: number): Promise<void> {
    const result = await window.api.articles.get(id)
    if (result.success && result.data) {
      currentArticle.value = result.data as ArticleDetail
      // 自动标记已读
      if (!result.data.is_read) {
        await window.api.articles.markRead(id)
        // 更新列表中该文章的已读状态
        const item = articles.value.find((a) => a.id === id)
        if (item) item.is_read = 1
      }
    }
  }

  async function toggleStar(id: number): Promise<void> {
    const result = await window.api.articles.toggleStar(id)
    if (result.success && result.data) {
      const item = articles.value.find((a) => a.id === id)
      if (item) item.is_starred = result.data.is_starred
      if (currentArticle.value?.id === id) {
        currentArticle.value.is_starred = result.data.is_starred
      }
    }
  }

  async function markAllRead(feedId?: number): Promise<void> {
    await window.api.articles.markAllRead(feedId)
    articles.value.forEach((a) => {
      a.is_read = 1
    })
    // 同步刷新侧边栏未读计数
    const { loadFeeds } = useFeeds()
    await loadFeeds()
  }

  async function search(query: string): Promise<ArticleItem[]> {
    const result = await window.api.articles.search(query)
    if (result.success && result.data) {
      return result.data
    }
    return []
  }

  function setFilter(f: FilterType): void {
    filter.value = f
  }

  function closeArticle(): void {
    currentArticle.value = null
  }

  function setFocusedIndex(index: number): void {
    if (index >= 0 && index < articles.value.length) {
      focusedIndex.value = index
    }
  }

  return {
    articles,
    currentArticle,
    loading,
    loadingMore,
    hasMore,
    filter,
    focusedIndex,
    loadArticles,
    loadMore,
    openArticle,
    toggleStar,
    markAllRead,
    search,
    setFilter,
    closeArticle,
    setFocusedIndex
  }
}
