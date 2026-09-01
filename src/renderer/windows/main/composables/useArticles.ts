import { ref } from 'vue'
import { useFeeds } from '@renderer/windows/main/composables/useFeeds'
import { useArticleView } from '@renderer/windows/main/composables/useArticleView'
import type {
  Article,
  ArticleDetail,
  ArticleListCursor,
  ArticleListParams
} from '@shared/types/articles'

const PAGE_SIZE = 60

const articles = ref<Article[]>([])
const currentArticle = ref<ArticleDetail | null>(null)
const navTarget = ref<{ id: number } | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(false)
const newArticleCount = ref(0)
const searchQuery = ref('')
const searchApplied = ref(0)

let cursor: ArticleListCursor | null = null
let requestSeq = 0
let openSeq = 0

export function useArticles() {
  const { loadFeeds, feeds, selectedFeedId, selectedCategoryId } = useFeeds()
  const { isUnread, isStar, isToday } = useArticleView()

  function currentScope(): ArticleListParams {
    return {
      feedId: selectedFeedId.value ?? undefined,
      categoryId: selectedCategoryId.value,
      isUnread: isUnread.value,
      isStar: isStar.value,
      isToday: isToday.value,
      query: searchQuery.value.trim() || undefined
    }
  }

  function resetPagination(): void {
    cursor = null
    hasMore.value = false
    newArticleCount.value = 0
    loadingMore.value = false
  }

  async function reloadFirstPage(): Promise<void> {
    const seq = ++requestSeq
    resetPagination()

    const loadingTimer = setTimeout(() => {
      loading.value = true
    }, 150)

    try {
      const result = await window.api.articles.list({ ...currentScope(), limit: PAGE_SIZE })
      if (seq !== requestSeq) return
      if (result.success && result.data) {
        articles.value = result.data.articles
        cursor = result.data.nextCursor
        hasMore.value = result.data.hasMore
      }
    } finally {
      clearTimeout(loadingTimer)
      if (seq === requestSeq) loading.value = false
    }
  }

  async function loadMore(): Promise<void> {
    if (loadingMore.value || !hasMore.value || !cursor) return
    const seq = requestSeq
    loadingMore.value = true
    try {
      const result = await window.api.articles.list({
        ...currentScope(),
        limit: PAGE_SIZE,
        cursor
      })
      if (seq !== requestSeq) return
      if (result.success && result.data) {
        const existingIds = new Set(articles.value.map((a) => a.id))
        articles.value.push(...result.data.articles.filter((a) => !existingIds.has(a.id)))
        cursor = result.data.nextCursor
        hasMore.value = result.data.hasMore
      }
    } finally {
      if (seq === requestSeq) loadingMore.value = false
    }
  }

  function handleFeedRefreshed(feedId: number, inserted: number): void {
    if (!isFeedRelevant(feedId)) return
    if (searchQuery.value.trim()) return
    newArticleCount.value += inserted
  }

  function isFeedRelevant(feedId: number): boolean {
    if (selectedFeedId.value !== null) return feedId === selectedFeedId.value
    if (selectedCategoryId.value === undefined) return true
    return feeds.value.some((f) => f.id === feedId && f.category_id === selectedCategoryId.value)
  }

  function applySearch(query: string): void {
    searchQuery.value = query.trim()
    searchApplied.value++
    void reloadFirstPage()
  }

  async function goNewArticles(): Promise<void> {
    await reloadFirstPage()
  }

  async function openArticle(id: number) {
    const seq = ++openSeq
    const result = await window.api.articles.get(id)
    if (seq !== openSeq) return
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

  async function navigateArticle(dir: 1 | -1) {
    const current = currentArticle.value
    if (!current) return
    const list = articles.value
    if (list.length === 0) return
    const index = list.findIndex((a) => a.id === current.id)
    let targetIndex: number
    if (index === -1) {
      targetIndex = dir === 1 ? 0 : list.length - 1
    } else {
      targetIndex = index + dir
      if (targetIndex < 0 || targetIndex >= list.length) return
    }
    const target = list[targetIndex]
    navTarget.value = { id: target.id }
    await openArticle(target.id)
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

  function closeArticle() {
    currentArticle.value = null
  }

  return {
    articles,
    currentArticle,
    navTarget,
    loading,
    loadingMore,
    hasMore,
    newArticleCount,
    searchQuery,
    searchApplied,
    reloadFirstPage,
    loadMore,
    handleFeedRefreshed,
    applySearch,
    goNewArticles,
    openArticle,
    navigateArticle,
    toggleStar,
    toggleRead,
    markAllRead,
    markScopeRead,
    closeArticle
  }
}
