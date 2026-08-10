import { ref, reactive } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { useFeeds, type FeedItem } from '@/composables/useFeeds'

const dragFeedId = ref<number | null>(null)
const dragOverFeedId = ref<number | null>(null)
const dragOverCategoryId = ref<number | null | undefined>(undefined)
const dropPosition = ref<'before' | 'after'>('after')
const dragCategoryId = ref<number | null>(null)
const dragOverCategorySortId = ref<number | null>(null)
const categoryDropPosition = ref<'before' | 'after'>('after')
const savedCollapsedCategories = reactive<Record<number, boolean>>({})
const collapsedCategories = useLocalStorage<Record<number, boolean>>(
  'sidebar.collapsedCategories',
  {}
)
const uncategorizedCollapsed = useLocalStorage<boolean>('sidebar.uncategorizedCollapsed', false)

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useFeedDnD() {
  const { feeds, categories, loadFeeds } = useFeeds()

  function isCategoryCollapsed(catId: number): boolean {
    return collapsedCategories.value[catId] === true
  }

  function toggleCategory(catId: number): void {
    collapsedCategories.value[catId] = !collapsedCategories.value[catId]
  }

  function toggleUncategorized(): void {
    uncategorizedCollapsed.value = !uncategorizedCollapsed.value
  }

  function getFeedsByCategory(catId: number | null): FeedItem[] {
    return feeds.value.filter((f) => f.category_id === catId)
  }

  function onDragStart(feedId: number, event: DragEvent): void {
    dragFeedId.value = feedId
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', String(feedId))
    }
  }

  function onDragOverFeed(feedId: number, event: DragEvent): void {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    dragOverFeedId.value = feedId
    dragOverCategoryId.value = undefined
    const el = event.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    dropPosition.value = event.clientY - rect.top < rect.height / 2 ? 'before' : 'after'
  }

  function onDragLeaveFeed(): void {
    dragOverFeedId.value = null
  }

  function onDragOverCategory(catId: number | null, event: DragEvent): void {
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    if (dragCategoryId.value !== null) return
    if ((event.target as HTMLElement).closest('[data-sidebar="menu-button"]')) return
    dragOverCategoryId.value = catId
    dragOverFeedId.value = null
  }

  function onDragLeaveCategory(): void {
    dragOverCategoryId.value = undefined
  }

  function onDragEnd(): void {
    dragFeedId.value = null
    dragOverFeedId.value = null
    dragOverCategoryId.value = undefined
    dragOverCategorySortId.value = null
  }

  async function onDropToCategory(catId: number | null, event: DragEvent): Promise<void> {
    event.preventDefault()
    event.stopPropagation()
    const draggedId = dragFeedId.value
    if (draggedId === null) return

    const draggedFeed = feeds.value.find((f) => f.id === draggedId)
    if (!draggedFeed) return
    if (draggedFeed.category_id === catId) {
      return
    }

    const catFeeds = getFeedsByCategory(catId)
    const orderPayload = [
      ...catFeeds.map((f, i) => ({ id: f.id, sort_order: i })),
      { id: draggedId, sort_order: catFeeds.length }
    ]
    await window.api.feeds.update(draggedId, { categoryId: catId })
    await window.api.feeds.updateSortOrder(orderPayload)
    await loadFeeds()
  }

  async function onDropReorder(
    catId: number | null,
    targetFeedId: number,
    event: DragEvent
  ): Promise<void> {
    event.preventDefault()
    event.stopPropagation()
    const draggedId = dragFeedId.value
    if (draggedId === null || draggedId === targetFeedId) return

    const catFeeds = getFeedsByCategory(catId)
    const fromIndex = catFeeds.findIndex((f) => f.id === draggedId)
    const toIndex = catFeeds.findIndex((f) => f.id === targetFeedId)
    if (fromIndex === -1) {
      const draggedFeed = feeds.value.find((f) => f.id === draggedId)!
      const insertAt = dropPosition.value === 'after' ? toIndex + 1 : toIndex
      const reordered = [...catFeeds]
      reordered.splice(insertAt, 0, draggedFeed)
      await window.api.feeds.update(draggedId, { categoryId: catId })
      await window.api.feeds.updateSortOrder(reordered.map((f, i) => ({ id: f.id, sort_order: i })))
      await loadFeeds()
      return
    }

    const reordered = [...catFeeds]
    const [moved] = reordered.splice(fromIndex, 1)
    const targetInNew = fromIndex < toIndex ? toIndex - 1 : toIndex
    const insertAt = dropPosition.value === 'after' ? targetInNew + 1 : targetInNew
    reordered.splice(insertAt, 0, moved)

    const orderPayload = reordered.map((f, i) => ({ id: f.id, sort_order: i }))
    await window.api.feeds.updateSortOrder(orderPayload)
    await loadFeeds()
  }

  function onCategoryDragStart(catId: number, event: DragEvent): void {
    dragCategoryId.value = catId
    dragOverCategoryId.value = undefined
    dragOverFeedId.value = null
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', String(catId))
    }
    // 记录所有分组折叠状态并全部收起
    for (const c of categories.value) {
      savedCollapsedCategories[c.id] = collapsedCategories.value[c.id] ?? false
      collapsedCategories.value[c.id] = true
    }
  }

  function onCategoryDragOver(catId: number, event: DragEvent): void {
    if (dragCategoryId.value === null) return
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    if (dragCategoryId.value === catId) return
    dragOverCategorySortId.value = catId
    dragOverCategoryId.value = undefined
    dragOverFeedId.value = null
    const el = event.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    categoryDropPosition.value = event.clientY - rect.top < rect.height / 2 ? 'before' : 'after'
  }

  function onCategoryDragLeave(): void {
    dragOverCategorySortId.value = null
  }

  async function onCategoryDrop(catId: number, event: DragEvent): Promise<void> {
    const draggedId = dragCategoryId.value
    if (draggedId === null) return
    event.preventDefault()
    event.stopPropagation()
    if (draggedId === catId) return

    const reordered = [...categories.value]
    const fromIndex = reordered.findIndex((c) => c.id === draggedId)
    const toIndex = reordered.findIndex((c) => c.id === catId)
    if (fromIndex === -1) return

    const [moved] = reordered.splice(fromIndex, 1)
    const targetInNew = fromIndex < toIndex ? toIndex - 1 : toIndex
    const insertAt = categoryDropPosition.value === 'after' ? targetInNew + 1 : targetInNew
    reordered.splice(insertAt, 0, moved)

    await window.api.categories.updateSortOrder(
      reordered.map((c, i) => ({ id: c.id, sort_order: i }))
    )
    await loadFeeds()
    onCategoryDragEnd()
  }

  function onCategoryDragEnd(): void {
    dragCategoryId.value = null
    dragOverCategorySortId.value = null
    // 恢复折叠状态
    for (const c of categories.value) {
      collapsedCategories.value[c.id] = savedCollapsedCategories[c.id]
    }
  }

  return {
    dragFeedId,
    dragOverFeedId,
    dragOverCategoryId,
    dropPosition,
    dragCategoryId,
    dragOverCategorySortId,
    categoryDropPosition,
    collapsedCategories,
    uncategorizedCollapsed,
    isCategoryCollapsed,
    toggleCategory,
    toggleUncategorized,
    onDragStart,
    onDragOverFeed,
    onDragLeaveFeed,
    onDragOverCategory,
    onDragLeaveCategory,
    onDragEnd,
    onDropToCategory,
    onDropReorder,
    onCategoryDragStart,
    onCategoryDragOver,
    onCategoryDragLeave,
    onCategoryDrop,
    onCategoryDragEnd
  }
}
