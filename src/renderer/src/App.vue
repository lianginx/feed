<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useApp } from './composables/useApp'
import { useFeeds } from './composables/useFeeds'
import { useMenuCommands } from './composables/useMenuCommands'
import { useAddFeedDialog } from './composables/useAddFeedDialog'
import { useAddCategoryDialog } from './composables/useAddCategoryDialog'
import { useSettingsDialog } from './composables/useSettingsDialog'
import { SidebarProvider, Sidebar, SidebarInset } from '@/components/ui/sidebar'
import SidebarNav from './components/Sidebar.vue'
import ArticleList from './components/ArticleList.vue'
import ArticleReader from './components/ArticleReader.vue'
import ToastNotification from './components/ToastNotification.vue'
import AddFeedDialog from './components/AddFeedDialog.vue'
import AddCategoryDialog from './components/AddCategoryDialog.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'

const { loadSettings } = useApp()
const { loadFeeds } = useFeeds()

useMenuCommands()

const { showAddFeed } = useAddFeedDialog()
const {
  showAddCategory,
  editCategoryData,
  showConfirmDialog,
  confirmDialogTitle,
  confirmDialogMessage,
  closeCategoryDialog,
  confirmDeleteCategory,
  handleAddCategory,
  handleUpdateCategory
} = useAddCategoryDialog()
const { showSettings } = useSettingsDialog()

// 全局禁用浏览器默认右键菜单（自定义 ContextMenu 已自行处理 preventDefault）
function onContextMenu(e: MouseEvent): void {
  if (!e.defaultPrevented) {
    e.preventDefault()
  }
}

function disableTabFocus(el: Element): void {
  if (
    el.matches(
      'button, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], [role="option"]'
    ) &&
    !(
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    )
  ) {
    el.setAttribute('tabindex', '-1')
  }
}

onMounted(async () => {
  document.addEventListener('contextmenu', onContextMenu)
  document
    .querySelectorAll(
      'button, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], [role="option"]'
    )
    .forEach(disableTabFocus)
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) {
          disableTabFocus(node as Element)
          ;(node as Element)
            .querySelectorAll(
              'button, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], [role="option"]'
            )
            .forEach(disableTabFocus)
        }
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
  await loadSettings()
  await loadFeeds()
})

onUnmounted(() => {
  document.removeEventListener('contextmenu', onContextMenu)
})
</script>

<template>
  <SidebarProvider :style="{ '--sidebar-width': '20rem' }" class="h-screen">
    <Sidebar collapsible="none" class="border-r border-sidebar-border">
      <SidebarNav />
    </Sidebar>
    <SidebarInset class="overflow-hidden flex-row p-0">
      <div class="flex-4 min-w-0 overflow-hidden">
        <ArticleList />
      </div>
      <div class="flex-8 min-w-0 overflow-hidden">
        <ArticleReader />
      </div>
    </SidebarInset>
  </SidebarProvider>

  <ToastNotification />

  <AddFeedDialog v-model:open="showAddFeed" />

  <AddCategoryDialog
    :open="showAddCategory || editCategoryData !== null"
    :edit-category-id="editCategoryData?.id"
    :edit-category-name="editCategoryData?.name"
    @update:open="closeCategoryDialog"
    @add="handleAddCategory"
    @update="handleUpdateCategory"
  />

  <SettingsDialog v-model:open="showSettings" />

  <ConfirmDialog
    v-model:open="showConfirmDialog"
    :title="confirmDialogTitle"
    :message="confirmDialogMessage"
    confirm-text="删除"
    variant="danger"
    @confirm="confirmDeleteCategory"
  />
</template>
