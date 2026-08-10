import { ref } from 'vue'
import { useFeeds } from '@/composables/useFeeds'
import { useArticleView } from '@/composables/useArticleView'

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
    categoryId?: number | null,
    isUnread?: boolean,
    isStar?: boolean,
    isToday?: boolean
  ): Promise<void> {
    const loadingTimer = setTimeout(() => {
      loading.value = true
    }, 150)

    try {
      const result = await window.api.articles.list({
        feedId,
        categoryId,
        isUnread,
        isStar,
        isToday
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
        const readResult = await window.api.articles.toggleRead(id)
        if (readResult.success && readResult.data) {
          const item = articles.value.find((a) => a.id === id)
          if (item) item.is_read = readResult.data.is_read
          const { loadFeeds } = useFeeds()
          await loadFeeds()
        }
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

  async function toggleRead(id: number): Promise<void> {
    const result = await window.api.articles.toggleRead(id)
    if (result.success && result.data) {
      const item = articles.value.find((a) => a.id === id)
      if (item) item.is_read = result.data.is_read
      if (currentArticle.value?.id === id) {
        currentArticle.value.is_read = result.data.is_read
      }
      const { loadFeeds } = useFeeds()
      await loadFeeds()
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

  // 把当前选中的订阅源/分类范围的文章全部标为已读
  async function markScopeRead(): Promise<void> {
    const { selectedFeedId, selectedCategoryId } = useFeeds()
    const { isStar, isToday } = useArticleView()
    if (selectedFeedId.value !== null) {
      await markAllRead(selectedFeedId.value)
    } else if (selectedCategoryId.value !== undefined) {
      await window.api.categories.markAllRead(selectedCategoryId.value)
      articles.value.forEach((a) => {
        a.is_read = 1
      })
      const { loadFeeds } = useFeeds()
      await loadFeeds()
    } else if (isStar.value) {
      await window.api.articles.markAllRead(undefined, true)
      articles.value.forEach((a) => {
        a.is_read = 1
      })
      const { loadFeeds } = useFeeds()
      await loadFeeds()
    } else if (isToday.value) {
      await window.api.articles.markAllRead(undefined, false, true)
      articles.value.forEach((a) => {
        a.is_read = 1
      })
      const { loadFeeds } = useFeeds()
      await loadFeeds()
    } else {
      await markAllRead()
    }
  }

  // 按当前选中的订阅源/分类/筛选重新加载文章
  async function reloadScope(): Promise<void> {
    const { selectedFeedId, selectedCategoryId } = useFeeds()
    const { isUnread, isStar, isToday } = useArticleView()
    if (selectedFeedId.value !== null) {
      await loadArticles(
        selectedFeedId.value,
        undefined,
        isUnread.value,
        isStar.value,
        isToday.value
      )
    } else if (selectedCategoryId.value !== undefined) {
      await loadArticles(
        undefined,
        selectedCategoryId.value,
        isUnread.value,
        isStar.value,
        isToday.value
      )
    } else {
      await loadArticles(undefined, undefined, isUnread.value, isStar.value, isToday.value)
    }
  }

  async function search(query: string): Promise<ArticleItem[]> {
    const { selectedFeedId, selectedCategoryId } = useFeeds()
    const { isUnread, isStar, isToday } = useArticleView()
    const result = await window.api.articles.list({
      query,
      feedId: selectedFeedId.value ?? undefined,
      categoryId: selectedCategoryId.value,
      isUnread: isUnread.value,
      isStar: isStar.value,
      isToday: isToday.value
    })
    if (result.success && result.data) {
      return result.data.articles
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
    toggleRead,
    markAllRead,
    markScopeRead,
    search,
    reloadScope,
    closeArticle
  }
}
