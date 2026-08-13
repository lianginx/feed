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
/** 列表顶部判断阈值（滚动超过该值视为不在顶部） */
export const TOP_THRESHOLD = 80

const articles = ref<Article[]>([])
const currentArticle = ref<ArticleDetail | null>(null)
/** 第一页加载状态（仅用于延迟显示加载骨架） */
const loading = ref(false)
/** 是否正在加载下一页 */
const loadingMore = ref(false)
/** 是否还有下一页 */
const hasMore = ref(false)
/** 不在顶部时累计的新文章数量 */
const newArticleCount = ref(0)
/** 列表是否在顶部 */
const atTop = ref(true)
/** 当前搜索关键词 */
const searchQuery = ref('')

let cursor: ArticleListCursor | null = null
/** 请求序号：scope/刷新变化后旧请求响应直接丢弃，防止污染当前状态 */
let requestSeq = 0

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

  /** 重置分页并重新加载第一页（scope 变化 / 搜索 / 刷新 / 新文章提示跳转共用） */
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

  /** 加载下一页：追加文章并按 ID 去重 */
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

  /** 刷新事件接入：仅处理当前视图相关的订阅源，按滚动位置决定重载或累计新文章数 */
  function handleFeedRefreshed(feedId: number, inserted: number): void {
    if (!isFeedRelevant(feedId)) return
    if (searchQuery.value.trim()) {
      if (atTop.value) void reloadFirstPage()
      return
    }
    if (atTop.value) {
      void reloadFirstPage()
    } else {
      newArticleCount.value += inserted
    }
  }

  /** 判断订阅源是否属于当前视图（单源精确匹配；分类匹配所属分类；全局全部相关） */
  function isFeedRelevant(feedId: number): boolean {
    if (selectedFeedId.value !== null) return feedId === selectedFeedId.value
    if (selectedCategoryId.value === undefined) return true
    return feeds.value.some((f) => f.id === feedId && f.category_id === selectedCategoryId.value)
  }

  /** 应用搜索关键词：重置分页并重新加载第一页 */
  function applySearch(query: string): void {
    searchQuery.value = query.trim()
    void reloadFirstPage()
  }

  /** 点击「有 N 篇新文章」提示：清除提示并重新加载第一页 */
  async function goNewArticles(): Promise<void> {
    await reloadFirstPage()
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

  function closeArticle() {
    currentArticle.value = null
  }

  return {
    articles,
    currentArticle,
    loading,
    loadingMore,
    hasMore,
    newArticleCount,
    atTop,
    searchQuery,
    reloadFirstPage,
    loadMore,
    handleFeedRefreshed,
    applySearch,
    goNewArticles,
    openArticle,
    toggleStar,
    toggleRead,
    markAllRead,
    markScopeRead,
    closeArticle
  }
}
