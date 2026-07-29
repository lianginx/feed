import { ref, type Ref } from 'vue'
import { useFeeds } from './useFeeds'
import { useToast } from './useToast'

const showAddCategory = ref(false)
const editCategoryData = ref<{ id: number; name: string } | null>(null)
const showConfirmDialog = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmDialogFeedCount = ref(0)
const confirmDialogCategoryId = ref<number | null>(null)

export function useAddCategoryDialog(): {
  showAddCategory: Ref<boolean>
  editCategoryData: Ref<{ id: number; name: string } | null>
  showConfirmDialog: Ref<boolean>
  confirmDialogTitle: Ref<string>
  confirmDialogMessage: Ref<string>
  confirmDialogFeedCount: Ref<number>
  confirmDialogCategoryId: Ref<number | null>
  handleEditCategory: (cat: { id: number; name: string }) => void
  handleUpdateCategory: (id: number, name: string) => Promise<void>
  closeCategoryDialog: () => void
  handleDeleteCategory: (catId: number) => void
  confirmDeleteCategory: () => Promise<void>
  handleAddCategory: (name: string) => Promise<void>
} {
  const { categories, feeds, loadFeeds } = useFeeds()
  const { showToast } = useToast()

  function handleEditCategory(cat: { id: number; name: string }): void {
    editCategoryData.value = { id: cat.id, name: cat.name }
  }

  async function handleUpdateCategory(id: number, name: string): Promise<void> {
    await window.api.categories.update(id, name)
    await loadFeeds()
    closeCategoryDialog()
  }

  function closeCategoryDialog(): void {
    showAddCategory.value = false
    editCategoryData.value = null
  }

  function handleDeleteCategory(catId: number): void {
    const cat = categories.value.find((c) => c.id === catId)
    const name = cat?.name ?? ''
    const feedCount = feeds.value.filter((f) => f.category_id === catId).length
    confirmDialogCategoryId.value = catId
    confirmDialogTitle.value = '删除分类'
    confirmDialogMessage.value =
      feedCount > 0
        ? `「${name}」下有 ${feedCount} 个订阅源，删除后将一并移除，确定？`
        : `确定要删除分类「${name}」吗？`
    confirmDialogFeedCount.value = feedCount
    showConfirmDialog.value = true
  }

  async function confirmDeleteCategory(): Promise<void> {
    const catId = confirmDialogCategoryId.value
    if (catId === null) return
    const result = await window.api.categories.delete(catId)
    if (result.success) {
      const count = result.data?.feedCount ?? 0
      showToast(count > 0 ? `已删除分类及 ${count} 个订阅源` : '已删除分类')
    }
    showConfirmDialog.value = false
    confirmDialogCategoryId.value = null
    await loadFeeds()
  }

  async function handleAddCategory(name: string): Promise<void> {
    await window.api.categories.add(name)
    await loadFeeds()
  }

  return {
    showAddCategory,
    editCategoryData,
    showConfirmDialog,
    confirmDialogTitle,
    confirmDialogMessage,
    confirmDialogFeedCount,
    confirmDialogCategoryId,
    handleEditCategory,
    handleUpdateCategory,
    closeCategoryDialog,
    handleDeleteCategory,
    confirmDeleteCategory,
    handleAddCategory
  }
}
