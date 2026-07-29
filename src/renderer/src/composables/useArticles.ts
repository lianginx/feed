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
  cover_image?: string | null
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
const filter = ref<FilterType>('all')

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useArticles() {
  async function loadArticles(feedId?: number): Promise<void> {
    // 延迟显示 loading，避免快速切换时的骨架屏闪烁
    const loadingTimer = setTimeout(() => {
      loading.value = true
    }, 150)

    try {
      const result = await window.api.articles.list({
        feedId,
        filter: filter.value
      })

      clearTimeout(loadingTimer)

      if (result.success && result.data) {
        articles.value = result.data.articles
      }
    } finally {
      loading.value = false
      clearTimeout(loadingTimer)
    }
  }

  async function openArticle(id: number): Promise<void> {
    const result = await window.api.articles.get(id)
    if (result.success && result.data) {
      currentArticle.value = result.data
      // 自动标记已读
      if (!result.data.is_read) {
        await window.api.articles.markRead(id)
        // 更新列表中该文章的已读状态
        const item = articles.value.find((a) => a.id === id)
        if (item) item.is_read = 1
        // 同步刷新侧边栏未读计数
        const { loadFeeds } = useFeeds()
        await loadFeeds()
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

  return {
    articles,
    currentArticle,
    loading,
    filter,
    loadArticles,
    openArticle,
    toggleStar,
    markAllRead,
    search,
    setFilter,
    closeArticle
  }
}
