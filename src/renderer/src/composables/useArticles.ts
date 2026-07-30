import { ref } from 'vue'
import { useFeeds, type FilterType } from './useFeeds'

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

const articles = ref<ArticleItem[]>([])
const currentArticle = ref<ArticleDetail | null>(null)
const loading = ref(false)

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useArticles() {
  async function loadArticles(
    feedId?: number,
    categoryId?: number,
    filter?: FilterType
  ): Promise<void> {
    const loadingTimer = setTimeout(() => {
      loading.value = true
    }, 150)

    try {
      const result = await window.api.articles.list({
        feedId,
        categoryId,
        filter
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
      if (!result.data.is_read) {
        await window.api.articles.markRead(id)
        const item = articles.value.find((a) => a.id === id)
        if (item) item.is_read = 1
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

  function closeArticle(): void {
    currentArticle.value = null
  }

  return {
    articles,
    currentArticle,
    loading,
    loadArticles,
    openArticle,
    toggleStar,
    markAllRead,
    search,
    closeArticle
  }
}
