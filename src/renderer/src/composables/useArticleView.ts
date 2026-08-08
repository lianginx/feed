import { ref } from 'vue'
import { useFeeds } from './useFeeds'

// 文章列表的视图与筛选状态：与侧边栏选中态解耦，跨组件共享
const selectedView = ref<'all' | 'unread' | 'starred' | undefined>('all')
const isUnread = ref(false)
const isStar = ref(false)

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useArticleView() {
  const { selectFeed: selectFeedScope, selectCategory: selectCategoryScope } = useFeeds()

  // 选择侧边栏顶部全局视图（全部/未读/星标）
  function selectView(view: 'all' | 'unread' | 'starred'): void {
    selectFeedScope(null)
    selectCategoryScope(undefined)
    selectedView.value = view
    isUnread.value = view === 'unread'
    isStar.value = view === 'starred'
  }

  // 选择具体订阅源/分类
  function selectFeed(id: number | null): void {
    if (['unread', 'starred'].includes(selectedView.value ?? '')) {
      isUnread.value = false
      isStar.value = false
    }
    selectFeedScope(id)
    if (id !== null) {
      selectedView.value = undefined
    }
  }

  function selectCategory(id: number | null | undefined): void {
    if (['unread', 'starred'].includes(selectedView.value ?? '')) {
      isUnread.value = false
      isStar.value = false
    }
    selectCategoryScope(id)
    if (id !== undefined) {
      selectedView.value = undefined
    }
  }

  return {
    selectedView,
    isUnread,
    isStar,
    selectView,
    selectFeed,
    selectCategory
  }
}
