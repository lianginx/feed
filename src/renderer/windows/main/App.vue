<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useApp } from '@renderer/shared/composables/useApp'
import { useFeeds } from '@renderer/windows/main/composables/useFeeds'
import { useMenuCommands } from '@renderer/windows/main/composables/useMenuCommands'
import { useFeedsEvents } from '@renderer/windows/main/composables/useFeedsEvents'
import { useAppEvents } from '@renderer/windows/main/composables/useAppEvents'
import { useSyncEvents } from '@renderer/shared/composables/useSyncEvents'
import { registerTabShortcut } from '@renderer/windows/main/composables/useTabShortcut'
import { useAddCategoryDialog } from '@renderer/windows/main/composables/useAddCategoryDialog'
import { useConfirmDialog } from '@renderer/windows/main/composables/useConfirmDialog'
import { useSync } from '@renderer/shared/composables/useSync'
import { SidebarProvider, Sidebar } from '@renderer/shared/components/ui/sidebar'
import SidebarNav from '@renderer/windows/main/components/sidebar/SidebarNav.vue'
import ArticleList from '@renderer/windows/main/components/ArticleList.vue'
import ArticleReader from '@renderer/windows/main/components/ArticleReader.vue'
import ToastNotification from '@renderer/windows/main/components/ToastNotification.vue'
import DialogAddCategory from '@renderer/windows/main/components/dialog/DialogAddCategory.vue'
import DialogConfirm from '@renderer/windows/main/components/dialog/DialogConfirm.vue'
import DialogUpdate from '@renderer/windows/main/components/dialog/DialogUpdate.vue'
import DialogSyncConflict from '@renderer/windows/main/components/dialog/DialogSyncConflict.vue'

const { loadSettings } = useApp()
const { loadFeeds } = useFeeds()

useMenuCommands()
useFeedsEvents()
useAppEvents()
useSyncEvents((result) => {
  // 远端数据已应用，刷新订阅列表（含新增/删除/排序变化）
  if (result.status === 'pulled') {
    loadFeeds()
  }
})
registerTabShortcut()

const {
  showAddCategory,
  editCategoryData,
  closeCategoryDialog,
  handleAddCategory,
  handleUpdateCategory
} = useAddCategoryDialog()
const {
  show: showConfirmDialog,
  title: confirmDialogTitle,
  message: confirmDialogMessage,
  confirmText,
  variant: confirmVariant,
  resolveConfirm
} = useConfirmDialog()
const { pendingConflict, resolveConflict, loadStatus } = useSync()

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
  await loadStatus()
})

onUnmounted(() => {
  document.removeEventListener('contextmenu', onContextMenu)
})

async function handleSyncConflictChoice(choice: 'local' | 'remote'): Promise<void> {
  await resolveConflict(choice)
}
</script>

<template>
  <SidebarProvider
    :style="{ '--sidebar-width': '20rem' }"
    class="h-screen overflow-hidden bg-canvas"
  >
    <!-- 侧边栏不做卡片，透明化直接陈列在地面上 -->
    <Sidebar collapsible="none" class="bg-transparent">
      <SidebarNav />
    </Sidebar>
    <!-- 地面：承载卡片的画布，卡片之间留 gap；卡片用多层阴影浮起 -->
    <div class="m-2 ml-0 flex-4 min-w-0 overflow-hidden rounded-xl bg-card">
      <ArticleList />
    </div>
    <div class="m-2 ml-0 flex-8 min-w-0 overflow-hidden rounded-xl bg-card">
      <ArticleReader />
    </div>
  </SidebarProvider>

  <ToastNotification />

  <DialogAddCategory
    :open="showAddCategory || editCategoryData !== null"
    :edit-category-id="editCategoryData?.id"
    :edit-category-name="editCategoryData?.name"
    @update:open="closeCategoryDialog"
    @add="handleAddCategory"
    @update="handleUpdateCategory"
  />

  <DialogConfirm
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

  <DialogUpdate />

  <DialogSyncConflict
    :open="pendingConflict"
    @update:open="
      (open) => {
        if (!open) pendingConflict = false
      }
    "
    @choose="handleSyncConflictChoice"
  />
</template>
