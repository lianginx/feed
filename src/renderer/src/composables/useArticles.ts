import { ref } from 'vue'
import { useFeeds } from '@renderer/composables/useFeeds'
import { useArticleView } from '@renderer/composables/useArticleView'
import type { Article, ArticleDetail } from '@shared/types/articles'

const articles = ref<Article[]>([])
const currentArticle = ref<ArticleDetail | null>(null)
const loading = ref(false)

export function useArticles() {
  const { loadFeeds, selectedFeedId, selectedCategoryId } = useFeeds()
  const { isUnread, isStar, isToday } = useArticleView()

  async function loadArticles(
    feedId?: number,
    categoryId?: number | null,
    isUnread?: boolean,
    isStar?: boolean,
    isToday?: boolean
  ) {
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

  async function openArticle(id: number) {
    const result = await window.api.articles.get(id)
    if (result.success && result.data) {
      currentArticle.value = result.data
      if (!result.data.is_read) {
        const readResult = await window.api.articles.toggleRead(id)
        if (readResult.success && readResult.data) {
          const item = articles.value.find((a) => a.id === id)
          if (item) item.is_read = readResult.data.is_read
          await loadFeeds()
        }
      }
    }
  }

  async function toggleStar(id: number) {
    const result = await window.api.articles.toggleStar(id)
    if (result.success && result.data) {
      const item = articles.value.find((a) => a.id === id)
      if (item) item.is_starred = result.data.is_starred
      if (currentArticle.value?.id === id) {
        currentArticle.value.is_starred = result.data.is_starred
      }
    }
  }

  async function toggleRead(id: number) {
    const result = await window.api.articles.toggleRead(id)
    if (result.success && result.data) {
      const item = articles.value.find((a) => a.id === id)
      if (item) item.is_read = result.data.is_read
      if (currentArticle.value?.id === id) {
        currentArticle.value.is_read = result.data.is_read
      }
      await loadFeeds()
    }
  }

  function markAllLocalRead() {
    articles.value.forEach((a) => {
      a.is_read = 1
    })
  }

  async function markAllRead(feedId?: number) {
    await window.api.articles.markAllRead(feedId)
    markAllLocalRead()
    await loadFeeds()
  }

  async function markScopeRead() {
    if (selectedFeedId.value !== null) {
      await markAllRead(selectedFeedId.value)
      return
    }
    if (selectedCategoryId.value !== undefined) {
      await window.api.categories.markAllRead(selectedCategoryId.value)
    } else if (isStar.value) {
      await window.api.articles.markAllRead(undefined, true)
    } else if (isToday.value) {
      await window.api.articles.markAllRead(undefined, false, true)
    } else {
      await markAllRead()
      return
    }
    markAllLocalRead()
    await loadFeeds()
  }

  async function reloadScope() {
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

  async function search(query: string): Promise<Article[]> {
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

  function closeArticle() {
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
