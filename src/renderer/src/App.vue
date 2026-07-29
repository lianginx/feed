<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useApp } from './composables/useApp'
import { useFeeds } from './composables/useFeeds'
import { useMenuCommands } from './composables/useMenuCommands'
import { useAddFeedDialog } from './composables/useAddFeedDialog'
import { useAddCategoryDialog } from './composables/useAddCategoryDialog'
import { useSettingsDialog } from './composables/useSettingsDialog'
import Sidebar from './components/Sidebar.vue'
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

onMounted(async () => {
  document.addEventListener('contextmenu', onContextMenu)
  await loadSettings()
  await loadFeeds()
})

onUnmounted(() => {
  document.removeEventListener('contextmenu', onContextMenu)
})
</script>

<template>
  <div class="h-screen overflow-hidden bg-bg-primary flex">
    <!-- 侧边栏（固定宽度） -->
    <div class="w-80 shrink-0 overflow-hidden">
      <Sidebar />
    </div>
    <!-- 文章列表 -->
    <div class="flex-4 min-w-0 overflow-hidden">
      <ArticleList />
    </div>
    <!-- 阅读区域 -->
    <div class="flex-8 min-w-0 overflow-hidden">
      <ArticleReader />
    </div>
  </div>
  <ToastNotification />
  <!-- 对话框 -->
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
