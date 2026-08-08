<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useApp } from './composables/useApp'
import { useFeeds } from './composables/useFeeds'
import { useArticleView } from './composables/useArticleView'
import { useMenuCommands } from './composables/useMenuCommands'
import { registerTabShortcut } from './composables/useTabShortcut'
import { useAddCategoryDialog } from './composables/useAddCategoryDialog'
import { useConfirmDialog } from './composables/useConfirmDialog'
import { useSync, registerSyncListener } from './composables/useSync'
import { SidebarProvider, Sidebar } from '@/components/ui/sidebar'
import SidebarNav from './components/Sidebar.vue'
import ArticleList from './components/ArticleList.vue'
import ArticleReader from './components/ArticleReader.vue'
import ToastNotification from './components/ToastNotification.vue'
import AddCategoryDialog from './components/AddCategoryDialog.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import UpdateDialog from './components/UpdateDialog.vue'
import SyncConflictDialog from './components/SyncConflictDialog.vue'

const { loadSettings } = useApp()
const { loadFeeds } = useFeeds()
const { selectFeed } = useArticleView()

useMenuCommands()
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

let stopSyncListener: (() => void) | null = null
let stopConfigListener: (() => void) | null = null
let stopOpmlListener: (() => void) | null = null
let stopFeedsListener: (() => void) | null = null

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
  // 注册同步状态监听，并加载上次同步时间；远端拉取后刷新订阅列表
  stopSyncListener = registerSyncListener(() => {
    void loadFeeds()
  })
  await loadStatus()

  // 设置窗口变更后重载配置、OPML 导入后刷新订阅列表、添加订阅窗口完成后刷新并选中
  stopConfigListener = window.api.config.onChanged(onConfigChanged)
  stopOpmlListener = window.api.opml.onImported(onOpmlImported)
  stopFeedsListener = window.api.feeds.onChanged(onFeedsChanged)
})

function onConfigChanged(): void {
  void loadSettings()
}

function onOpmlImported(): void {
  void loadFeeds()
}

async function onFeedsChanged(data: { feedId?: number }): Promise<void> {
  await loadFeeds()
  if (data.feedId) {
    selectFeed(data.feedId)
  }
}

onUnmounted(() => {
  document.removeEventListener('contextmenu', onContextMenu)
  stopConfigListener?.()
  stopOpmlListener?.()
  stopSyncListener?.()
  stopFeedsListener?.()
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

  <AddCategoryDialog
    :open="showAddCategory || editCategoryData !== null"
    :edit-category-id="editCategoryData?.id"
    :edit-category-name="editCategoryData?.name"
    @update:open="closeCategoryDialog"
    @add="handleAddCategory"
    @update="handleUpdateCategory"
  />

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

  <UpdateDialog />

  <SyncConflictDialog
    :open="pendingConflict"
    @update:open="
      (open) => {
        if (!open) pendingConflict = false
      }
    "
    @choose="handleSyncConflictChoice"
  />
</template>
