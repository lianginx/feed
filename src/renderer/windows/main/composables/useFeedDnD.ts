import { ref, reactive, computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { useFeeds, type FeedItem } from '@renderer/windows/main/composables/useFeeds'

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

export function useFeedDnD() {
  const { feeds, categories, moveFeedToCategory, reorderFeeds, reorderCategories } = useFeeds()

  function isCategoryCollapsed(catId: number): boolean {
    return collapsedCategories.value[catId] === true
  }

  function toggleCategory(catId: number) {
    collapsedCategories.value[catId] = !collapsedCategories.value[catId]
  }

  function toggleUncategorized() {
    uncategorizedCollapsed.value = !uncategorizedCollapsed.value
  }

  function collapseAllCategories() {
    for (const c of categories.value) {
      collapsedCategories.value[c.id] = true
    }
    uncategorizedCollapsed.value = true
  }

  function expandAllCategories() {
    for (const c of categories.value) {
      collapsedCategories.value[c.id] = false
    }
    uncategorizedCollapsed.value = false
  }

  const allCategoriesCollapsed = computed(() => {
    const hasUncategorized = getFeedsByCategory(null).length > 0
    if (categories.value.length === 0 && !hasUncategorized) return false
    return (
      categories.value.every((c) => collapsedCategories.value[c.id] === true) &&
      (!hasUncategorized || uncategorizedCollapsed.value)
    )
  })

  function toggleAllCategories() {
    if (allCategoriesCollapsed.value) {
      expandAllCategories()
    } else {
      collapseAllCategories()
    }
  }

  function getFeedsByCategory(catId: number | null): FeedItem[] {
    return feeds.value.filter((f) => f.category_id === catId)
  }

  function onDragStart(feedId: number, event: DragEvent) {
    dragFeedId.value = feedId
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', String(feedId))
    }
  }

  function onDragOverFeed(feedId: number, event: DragEvent) {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    dragOverFeedId.value = feedId
    dragOverCategoryId.value = undefined
    const el = event.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    dropPosition.value = event.clientY - rect.top < rect.height / 2 ? 'before' : 'after'
  }

  function onDragLeaveFeed() {
    dragOverFeedId.value = null
  }

  function onDragOverCategory(catId: number | null, event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    if (dragCategoryId.value !== null) return
    if ((event.target as HTMLElement).closest('[data-sidebar="menu-button"]')) return
    dragOverCategoryId.value = catId
    dragOverFeedId.value = null
  }

  function onDragLeaveCategory() {
    dragOverCategoryId.value = undefined
  }

  function onDragEnd() {
    dragFeedId.value = null
    dragOverFeedId.value = null
    dragOverCategoryId.value = undefined
    dragOverCategorySortId.value = null
  }

  async function onDropToCategory(catId: number | null, event: DragEvent) {
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
    await moveFeedToCategory(draggedId, catId, orderPayload)
  }

  async function onDropReorder(catId: number | null, targetFeedId: number, event: DragEvent) {
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
      await moveFeedToCategory(
        draggedId,
        catId,
        reordered.map((f, i) => ({ id: f.id, sort_order: i }))
      )
      return
    }

    const reordered = [...catFeeds]
    const [moved] = reordered.splice(fromIndex, 1)
    const targetInNew = fromIndex < toIndex ? toIndex - 1 : toIndex
    const insertAt = dropPosition.value === 'after' ? targetInNew + 1 : targetInNew
    reordered.splice(insertAt, 0, moved)

    const orderPayload = reordered.map((f, i) => ({ id: f.id, sort_order: i }))
    await reorderFeeds(orderPayload)
  }

  function onCategoryDragStart(catId: number, event: DragEvent) {
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

  function onCategoryDragOver(catId: number, event: DragEvent) {
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

  function onCategoryDragLeave() {
    dragOverCategorySortId.value = null
  }

  async function onCategoryDrop(catId: number, event: DragEvent) {
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

    await reorderCategories(reordered.map((c, i) => ({ id: c.id, sort_order: i })))
    onCategoryDragEnd()
  }

  function onCategoryDragEnd() {
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
    collapseAllCategories,
    expandAllCategories,
    allCategoriesCollapsed,
    toggleAllCategories,
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
