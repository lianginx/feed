import { ref } from 'vue'
import { useFeeds } from '@/composables/useFeeds'

// 文章列表的视图与筛选状态：与侧边栏选中态解耦，跨组件共享
const selectedView = ref<'all' | 'unread' | 'starred' | 'today' | undefined>('all')
const isUnread = ref(false)
const isStar = ref(false)
const isToday = ref(false)

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useArticleView() {
  const { selectFeed: selectFeedScope, selectCategory: selectCategoryScope } = useFeeds()

  function selectView(view: 'all' | 'unread' | 'starred' | 'today'): void {
    selectFeedScope(null)
    selectCategoryScope(undefined)
    selectedView.value = view
    isUnread.value = view === 'unread'
    isStar.value = view === 'starred'
    isToday.value = view === 'today'
  }

  function selectFeed(id: number | null): void {
    if (['unread', 'starred', 'today'].includes(selectedView.value ?? '')) {
      isUnread.value = false
      isStar.value = false
      isToday.value = false
    }
    selectFeedScope(id)
    if (id !== null) {
      selectedView.value = undefined
    }
  }

  function selectCategory(id: number | null | undefined): void {
    if (['unread', 'starred', 'today'].includes(selectedView.value ?? '')) {
      isUnread.value = false
      isStar.value = false
      isToday.value = false
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
    isToday,
    selectView,
    selectFeed,
    selectCategory
  }
}
