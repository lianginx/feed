import { ref, type Ref } from 'vue'
import { useConfirmDialog } from '@renderer/windows/main/composables/useConfirmDialog'
import { useFeeds } from '@renderer/windows/main/composables/useFeeds'

const showAddCategory = ref(false)
const editCategoryData = ref<{ id: number; name: string } | null>(null)

export function useAddCategoryDialog(): {
  showAddCategory: Ref<boolean>
  editCategoryData: Ref<{ id: number; name: string } | null>
  handleEditCategory: (cat: { id: number; name: string }) => void
  handleUpdateCategory: (id: number, name: string) => Promise<void>
  closeCategoryDialog: () => void
  handleDeleteCategory: (catId: number) => Promise<void>
  handleAddCategory: (name: string) => Promise<void>
} {
  const { categories, feeds, loadFeeds } = useFeeds()
  const { confirm } = useConfirmDialog()

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

  async function handleDeleteCategory(catId: number): Promise<void> {
    const cat = categories.value.find((c) => c.id === catId)
    const name = cat?.name ?? ''
    const feedCount = feeds.value.filter((f) => f.category_id === catId).length
    const ok = await confirm({
      title: '删除分类',
      message:
        feedCount > 0
          ? `「${name}」下有 ${feedCount} 个订阅源，删除后将一并移除，确定？`
          : `确定要删除分类「${name}」吗？`,
      confirmText: '删除',
      variant: 'danger'
    })
    if (!ok) return
    await window.api.categories.delete(catId)
    await loadFeeds()
  }

  async function handleAddCategory(name: string): Promise<void> {
    await window.api.categories.add(name)
    await loadFeeds()
  }

  return {
    showAddCategory,
    editCategoryData,
    handleEditCategory,
    handleUpdateCategory,
    closeCategoryDialog,
    handleDeleteCategory,
    handleAddCategory
  }
}
