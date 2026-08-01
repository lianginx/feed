<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useApp } from './composables/useApp'
import { useFeeds } from './composables/useFeeds'
import { useMenuCommands } from './composables/useMenuCommands'
import { useAddFeedDialog } from './composables/useAddFeedDialog'
import { useAddCategoryDialog } from './composables/useAddCategoryDialog'
import { useSettingsDialog } from './composables/useSettingsDialog'
import { useConfirmDialog } from './composables/useConfirmDialog'
import { SidebarProvider, Sidebar } from '@/components/ui/sidebar'
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
  closeCategoryDialog,
  handleAddCategory,
  handleUpdateCategory
} = useAddCategoryDialog()
const { showSettings } = useSettingsDialog()
const {
  show: showConfirmDialog,
  title: confirmDialogTitle,
  message: confirmDialogMessage,
  confirmText,
  variant: confirmVariant,
  resolveConfirm
} = useConfirmDialog()

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
  <SidebarProvider
    :style="{ '--sidebar-width': '20rem' }"
    class="h-screen overflow-hidden bg-canvas px-3 gap-3"
  >
    <!-- 侧边栏不做卡片，透明化直接陈列在地面上 -->
    <Sidebar collapsible="none" class="pt-12 bg-transparent">
      <SidebarNav />
    </Sidebar>
    <!-- 地面：承载卡片的画布，卡片之间留 gap；卡片用多层阴影浮起 -->
    <div
      class="my-3 flex-4 min-w-0 overflow-hidden rounded-xl bg-card shadow-card animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out"
    >
      <ArticleList />
    </div>
    <div
      class="my-3 flex-8 min-w-0 overflow-hidden rounded-xl bg-card shadow-card animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out [animation-delay:80ms]"
    >
      <ArticleReader />
    </div>
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
    :open="showConfirmDialog"
    :title="confirmDialogTitle"
    :message="confirmDialogMessage"
    :confirm-text="confirmText"
    :variant="confirmVariant"
    @confirm="resolveConfirm(true)"
    @cancel="resolveConfirm(false)"
    @update:open="
      (open) => {
        if (!open) showConfirmDialog = false
      }
    "
  />
</template>
