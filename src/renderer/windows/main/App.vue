<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useApp } from '@renderer/shared/composables/useApp'
import { useFeeds } from '@renderer/windows/main/composables/useFeeds'
import { useMenuCommands } from '@renderer/windows/main/composables/useMenuCommands'
import { useFeedsEvents } from '@renderer/windows/main/composables/useFeedsEvents'
import { useAppEvents } from '@renderer/windows/main/composables/useAppEvents'
import { useSyncEvents } from '@renderer/shared/composables/useSyncEvents'
import { registerTabShortcut } from '@renderer/windows/main/composables/useTabShortcut'
import { registerArticleKeyNav } from '@renderer/windows/main/composables/useArticleKeyNav'
import { useAddCategoryDialog } from '@renderer/windows/main/composables/useAddCategoryDialog'
import { useConfirmDialog } from '@renderer/windows/main/composables/useConfirmDialog'
import { useSync } from '@renderer/shared/composables/useSync'
import { SidebarProvider, Sidebar } from '@renderer/shared/components/ui/sidebar'
import SidebarNav from '@renderer/windows/main/components/sidebar/SidebarNav.vue'
import ArticleList from '@renderer/windows/main/components/ArticleList.vue'
import ArticleReader from '@renderer/windows/main/components/ArticleReader.vue'
import DialogAddCategory from '@renderer/windows/main/components/dialog/DialogAddCategory.vue'
import DialogConfirm from '@renderer/windows/main/components/dialog/DialogConfirm.vue'
import DialogUpdate from '@renderer/windows/main/components/dialog/DialogUpdate.vue'
import DialogSyncConflict from '@renderer/windows/main/components/dialog/DialogSyncConflict.vue'
import Sonner from '@renderer/shared/components/ui/sonner/Sonner.vue'

const { loadSettings } = useApp()
const { loadFeeds } = useFeeds()

useMenuCommands()
useFeedsEvents()
useAppEvents()
useSyncEvents((result) => {
  if (result.status === 'pulled') {
    loadFeeds()
  }
})
registerTabShortcut()
registerArticleKeyNav()

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
    <Sidebar collapsible="none" class="shrink-0 border-r border-sidebar-border">
      <SidebarNav />
    </Sidebar>
    <div class="flex-4 max-w-104 min-w-0">
      <ArticleList />
    </div>
    <div class="flex-8 min-w-0 border-l border-border/60 bg-card">
      <ArticleReader />
    </div>
  </SidebarProvider>

  <Sonner theme="system" />

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
