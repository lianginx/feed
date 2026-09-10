import { ref } from 'vue'
import type { FeedbackCategoryOption, MyFeedbackItem } from '@shared/types/feedback'

export type FeedbackView = 'form' | 'mine' | 'detail'

const show = ref(false)
const view = ref<FeedbackView>('form')
const category = ref('')
const content = ref('')
const contact = ref('')
const categories = ref<FeedbackCategoryOption[]>([])
const mineItems = ref<MyFeedbackItem[]>([])
const mineLoading = ref(false)
const mineError = ref('')
const selectedItem = ref<MyFeedbackItem | null>(null)
let categoriesLoaded = false

export function useFeedbackDialog(): {
  show: typeof show
  view: typeof view
  category: typeof category
  content: typeof content
  contact: typeof contact
  categories: typeof categories
  mineItems: typeof mineItems
  mineLoading: typeof mineLoading
  mineError: typeof mineError
  selectedItem: typeof selectedItem
  loadMine: () => Promise<void>
  open: () => void
  close: () => void
  toMine: () => void
  toForm: () => void
  toDetail: (item: MyFeedbackItem) => void
  backToList: () => void
} {
  async function loadCategories(): Promise<void> {
    if (categoriesLoaded) return
    categoriesLoaded = true
    const res = await window.api.feedback.status()
    if (res.success && res.data) {
      categories.value = res.data.categories
    }
  }

  async function loadMine(): Promise<void> {
    if (mineLoading.value) return
    mineLoading.value = true
    mineError.value = ''
    const res = await window.api.feedback.mine()
    mineLoading.value = false
    if (res.success && res.data) {
      mineItems.value = res.data
    } else {
      mineError.value = res.error || '查询失败，请点击刷新重试'
    }
  }

  function open(): void {
    if (show.value) return
    void loadCategories()
    category.value = ''
    content.value = ''
    contact.value = ''
    view.value = 'form'
    show.value = true
  }

  function close(): void {
    show.value = false
  }

  function toMine(): void {
    view.value = 'mine'
    void loadMine()
  }

  function toForm(): void {
    view.value = 'form'
  }

  function toDetail(item: MyFeedbackItem): void {
    selectedItem.value = item
    view.value = 'detail'
  }

  function backToList(): void {
    view.value = 'mine'
  }

  return {
    show,
    view,
    category,
    content,
    contact,
    categories,
    mineItems,
    mineLoading,
    mineError,
    selectedItem,
    loadMine,
    open,
    close,
    toMine,
    toForm,
    toDetail,
    backToList
  }
}
