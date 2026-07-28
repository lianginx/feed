<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { RefreshCw, Plus, Settings, CheckCheck, LoaderCircle } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator
} from '@/components/ui/context-menu'
import { useFeeds, type FeedItem } from '../composables/useFeeds'
import { useArticles } from '../composables/useArticles'
import { useToast } from '../composables/useToast'
import AddFeedDialog from './AddFeedDialog.vue'
import AddCategoryDialog from './AddCategoryDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import SettingsDialog from './SettingsDialog.vue'
const {
  categories,
  feeds,
  unreadCount,
  selectFeed,
  selectCategory,
  selectedFeedId,
  selectedCategoryId,
  loadFeeds,
  deleteFeed,
  refreshingFeedIds,
  refreshSingleFeed,
  refreshCategoryFeeds,
  refreshAllFeeds
} = useFeeds()

const { showToast } = useToast()

const showAddFeed = ref(false)
const showAddCategory = ref(false)
const editCategoryData = ref<{ id: number; name: string } | null>(null)
const showSettings = ref(false)
const dragFeedId = ref<number | null>(null)
const collapsedCategories = reactive<Record<number, boolean>>({})

// 确认弹窗状态
const showConfirmDialog = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmDialogFeedCount = ref(0)
const confirmDialogCategoryId = ref<number | null>(null)

function isCategoryCollapsed(catId: number): boolean {
  return collapsedCategories[catId] === true
}

async function handleMarkAllRead(feedId?: number): Promise<void> {
  const { markAllRead: markAllArticlesRead } = useArticles()
  await markAllArticlesRead(feedId)
  showToast(feedId ? '已将此订阅源全部标为已读' : '已将所有文章标记为已读')
}

async function handleMarkAllReadByCategory(catId: number): Promise<void> {
  await window.api.categories.markAllRead(catId)
  // 同步刷新侧边栏未读计数
  const { loadFeeds } = useFeeds()
  await loadFeeds()
  const cat = categories.value.find((c) => c.id === catId)
  showToast(cat ? `已将「${cat.name}」下所有文章标为已读` : '已将该分类下所有文章标为已读')
}

async function handleRefreshCategory(catId: number, event: Event): Promise<void> {
  event.stopPropagation()
  await refreshCategoryFeeds(catId)
  // 刷新后重新加载文章列表
  const { loadArticles } = useArticles()
  await loadArticles(selectedFeedId.value ?? undefined)
  showToast('已刷新该分类下所有订阅源')
}

async function handleEditFeed(feedId: number): Promise<void> {
  const feed = feeds.value.find((f) => f.id === feedId)
  if (!feed) return
  showToast(`编辑订阅源：${feed.title}`)
}

async function handleDeleteFeed(feedId: number): Promise<void> {
  const success = await deleteFeed(feedId)
  if (success) {
    showToast('已删除订阅源')
  }
}

async function handleEditCategory(cat: { id: number; name: string }): Promise<void> {
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
  if (!cat) return
  const feedCount = feeds.value.filter((f) => f.category_id === catId).length
  confirmDialogCategoryId.value = catId
  confirmDialogTitle.value = '删除分类'
  confirmDialogMessage.value =
    feedCount > 0
      ? `「${cat.name}」下有 ${feedCount} 个订阅源，删除后将一并移除，确定？`
      : `确定要删除分类「${cat.name}」吗？`
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

function toggleCategory(catId: number): void {
  collapsedCategories[catId] = !collapsedCategories[catId]
}

function handleSelectAll(): void {
  selectFeed(null)
  selectCategory(null)
}

// 监听主菜单快捷键（Cmd+N 新增订阅）
onMounted(() => {
  window.electron.ipcRenderer.on('menu:addFeed', () => {
    showAddFeed.value = true
  })
})

onUnmounted(() => {
  window.electron.ipcRenderer.removeAllListeners('menu:addFeed')
})

function handleSelectCategory(id: number): void {
  selectCategory(id)
  selectFeed(null)
}

async function handleAddCategory(name: string): Promise<void> {
  await window.api.categories.add(name)
  await loadFeeds()
}

async function handleRefreshFeed(feedId: number, event: Event): Promise<void> {
  event.stopPropagation()
  await refreshSingleFeed(feedId)
  // 刷新后重新加载文章列表
  const { loadArticles } = useArticles()
  await loadArticles(feedId)
}

async function handleRefreshAll(): Promise<void> {
  await refreshAllFeeds()
  // 刷新后重新加载文章列表
  const { loadArticles } = useArticles()
  await loadArticles(selectedFeedId.value ?? undefined)
  showToast('已刷新全部订阅源')
}

// 拖拽排序
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

function onDragEnd(): void {
  dragFeedId.value = null
}

async function onDropToCategory(catId: number | null, event: DragEvent): Promise<void> {
  event.preventDefault()
  event.stopPropagation()
  const draggedId = dragFeedId.value
  if (draggedId === null) return

  // 如果拖到同一个分类，不做移动
  const draggedFeed = feeds.value.find((f) => f.id === draggedId)
  if (!draggedFeed) return
  if (draggedFeed.category_id === catId) {
    // 同分类排序在容器级别处理
    return
  }

  // 跨分类移动：更新 feed 的 category_id
  await window.api.feeds.update(draggedId, { categoryId: catId ?? undefined })
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
    // 跨分类拖动到特定位置
    await window.api.feeds.update(draggedId, { categoryId: catId ?? undefined })
    await loadFeeds()
    return
  }

  // 同分类重新排序
  const reordered = [...catFeeds]
  const [moved] = reordered.splice(fromIndex, 1)
  reordered.splice(toIndex, 0, moved)

  const orderPayload = reordered.map((f, i) => ({ id: f.id, sort_order: i }))
  await window.api.feeds.updateSortOrder(orderPayload)
  await loadFeeds()
}

function onDragOverCategory(event: DragEvent): void {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}
</script>

<template>
  <aside class="h-full bg-muted/50 border-r border-border flex flex-col">
    <!-- 标题（可拖动区域） -->
    <div
      class="px-4 py-3 border-b border-border flex items-center justify-between"
      style="-webkit-app-region: drag"
    >
      <h1 class="text-lg font-semibold text-foreground">Feed</h1>
      <div class="flex items-center gap-1.5" style="-webkit-app-region: no-drag">
        <Button variant="ghost" size="icon" title="添加订阅源" @click="showAddFeed = true">
          <Plus class="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="刷新全部"
          :disabled="refreshingFeedIds.size > 0"
          @click="handleRefreshAll"
        >
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': refreshingFeedIds.size > 0 }" />
        </Button>
      </div>
    </div>

    <!-- 全部文章（固定在顶部） -->
    <div class="px-2 pt-2">
      <button
        class="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
        :class="
          selectedFeedId === null && selectedCategoryId === null
            ? 'bg-accent/10 text-accent'
            : 'text-muted-foreground hover:bg-accent/5'
        "
        @click="handleSelectAll"
      >
        <span class="flex items-center justify-between">
          <span>全部文章</span>
          <Badge v-if="unreadCount > 0" variant="secondary" class="text-xs">{{
            unreadCount
          }}</Badge>
        </span>
      </button>
    </div>
    <Separator class="mx-2 my-3" />
    <!-- 分类与订阅源列表 -->
    <div class="flex-1 overflow-y-overlay px-2 pb-2">
      <!-- 空白区域右键菜单：添加分类 -->
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            class="min-h-full"
            @dragover.prevent="onDragOverCategory"
            @drop="onDropToCategory(null, $event)"
          >
            <!-- 分类区块 -->
            <div
              v-for="cat in categories"
              :key="cat.id"
              class="mt-2"
              @dragover.prevent="onDragOverCategory"
              @drop="onDropToCategory(cat.id, $event)"
            >
              <Collapsible
                :open="!isCategoryCollapsed(cat.id)"
                class="w-full"
                @update:open="(open: boolean) => (collapsedCategories[cat.id] = !open)"
              >
                <ContextMenu>
                  <ContextMenuTrigger>
                    <button
                      class="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between"
                      :class="
                        selectedCategoryId === cat.id
                          ? 'bg-accent/10 text-accent'
                          : 'text-muted-foreground hover:bg-accent/5'
                      "
                      @click="handleSelectCategory(cat.id)"
                      @dblclick="toggleCategory(cat.id)"
                    >
                      <span class="flex items-center gap-1.5">
                        <CollapsibleTrigger>
                          <span @click.stop>
                            <svg
                              class="w-3.5 h-3.5 transition-transform duration-200"
                              :class="{ 'rotate-90': !isCategoryCollapsed(cat.id) }"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                            >
                              <path d="m9 18 6-6-6-6" />
                            </svg>
                          </span>
                        </CollapsibleTrigger>
                        {{ cat.name }}
                      </span>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem @select="handleMarkAllReadByCategory(cat.id)">
                      <CheckCheck class="w-3.5 h-3.5" />
                      全部标为已读
                    </ContextMenuItem>
                    <ContextMenuItem @select="handleRefreshCategory(cat.id, $event)">
                      <RefreshCw class="w-3.5 h-3.5" />
                      刷新
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem @select="handleEditCategory(cat)"> 编辑分类 </ContextMenuItem>
                    <ContextMenuItem
                      class="text-destructive! focus:text-destructive"
                      @select="handleDeleteCategory(cat.id)"
                    >
                      删除分类
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>

                <CollapsibleContent>
                  <div class="ml-2 mt-1 space-y-0.5">
                    <ContextMenu
                      v-for="feed in feeds.filter((f) => f.category_id === cat.id)"
                      :key="feed.id"
                    >
                      <ContextMenuTrigger>
                        <button
                          :draggable="true"
                          class="w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center justify-between group"
                          :class="{
                            'bg-accent/10 text-accent': selectedFeedId === feed.id,
                            'text-muted-foreground hover:bg-accent/5': selectedFeedId !== feed.id,
                            'opacity-50': dragFeedId === feed.id
                          }"
                          @click="selectFeed(feed.id)"
                          @dragstart="onDragStart(feed.id, $event)"
                          @dragend="onDragEnd"
                          @dragover.prevent="onDragOverCategory"
                          @drop="onDropReorder(cat.id, feed.id, $event)"
                        >
                          <span class="flex items-center gap-2 truncate min-w-0">
                            <!-- Favicon 图片 -->
                            <span
                              class="w-4 h-4 shrink-0 rounded bg-muted flex items-center justify-center text-[10px] overflow-hidden"
                            >
                              <img
                                v-if="feed.favicon_url"
                                :src="feed.favicon_url"
                                alt=""
                                class="w-full h-full object-contain"
                                @error="
                                  (e: Event) => {
                                    ;(e.target as HTMLImageElement).style.display = 'none'
                                  }
                                "
                              />
                              <span v-else class="text-muted-foreground">{{
                                feed.title.charAt(0)
                              }}</span>
                            </span>
                            <span class="truncate">{{ feed.title }}</span>
                          </span>
                          <span class="flex items-center gap-1 shrink-0">
                            <span
                              v-if="refreshingFeedIds.has(feed.id)"
                              class="text-accent animate-spin"
                            >
                              <LoaderCircle class="w-3 h-3" />
                            </span>
                            <Badge v-if="feed.unread_count > 0" variant="secondary" class="text-xs">
                              {{ feed.unread_count }}
                            </Badge>
                          </span>
                        </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem @select="handleMarkAllRead(feed.id)">
                          <CheckCheck class="w-3.5 h-3.5" />
                          全部标为已读
                        </ContextMenuItem>
                        <ContextMenuItem @select="handleRefreshFeed(feed.id, $event)">
                          <RefreshCw class="w-3.5 h-3.5" />
                          刷新
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem @select="handleEditFeed(feed.id)"> 编辑 </ContextMenuItem>
                        <ContextMenuItem
                          class="text-destructive! focus:text-destructive"
                          @select="handleDeleteFeed(feed.id)"
                        >
                          删除
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            <!-- 无分类的订阅源 -->
            <div
              v-if="feeds.filter((f) => f.category_id === null).length > 0"
              class="mt-2"
              @dragover.prevent="onDragOverCategory"
              @drop="onDropToCategory(null, $event)"
            >
              <div class="text-xs text-muted-foreground px-3 py-1">未分类</div>
              <div class="ml-2 mt-1 space-y-0.5">
                <ContextMenu
                  v-for="feed in feeds.filter((f) => f.category_id === null)"
                  :key="feed.id"
                >
                  <ContextMenuTrigger>
                    <button
                      :draggable="true"
                      class="w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center justify-between group"
                      :class="{
                        'bg-accent/10 text-accent': selectedFeedId === feed.id,
                        'text-muted-foreground hover:bg-accent/5': selectedFeedId !== feed.id,
                        'opacity-50': dragFeedId === feed.id
                      }"
                      @click="selectFeed(feed.id)"
                      @dragstart="onDragStart(feed.id, $event)"
                      @dragend="onDragEnd"
                      @dragover.prevent="onDragOverCategory"
                      @drop="onDropReorder(null, feed.id, $event)"
                    >
                      <span class="flex items-center gap-2 truncate min-w-0">
                        <span
                          class="w-4 h-4 shrink-0 rounded bg-muted flex items-center justify-center text-[10px] overflow-hidden"
                        >
                          <img
                            v-if="feed.favicon_url"
                            :src="feed.favicon_url"
                            alt=""
                            class="w-full h-full object-contain"
                            @error="
                              (e: Event) => {
                                ;(e.target as HTMLImageElement).style.display = 'none'
                              }
                            "
                          />
                          <span v-else class="text-muted-foreground">{{
                            feed.title.charAt(0)
                          }}</span>
                        </span>
                        <span class="truncate">{{ feed.title }}</span>
                      </span>
                      <span class="flex items-center gap-1 shrink-0">
                        <span
                          v-if="refreshingFeedIds.has(feed.id)"
                          class="text-accent animate-spin"
                        >
                          <LoaderCircle class="w-3 h-3" />
                        </span>
                        <Badge v-if="feed.unread_count > 0" variant="secondary" class="text-xs">
                          {{ feed.unread_count }}
                        </Badge>
                      </span>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem @select="handleMarkAllRead(feed.id)">
                      <CheckCheck class="w-3.5 h-3.5" />
                      全部标为已读
                    </ContextMenuItem>
                    <ContextMenuItem @select="handleRefreshFeed(feed.id, $event)">
                      <RefreshCw class="w-3.5 h-3.5" />
                      刷新
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem @select="handleEditFeed(feed.id)"> 编辑 </ContextMenuItem>
                    <ContextMenuItem
                      class="text-destructive! focus:text-destructive"
                      @select="handleDeleteFeed(feed.id)"
                    >
                      删除
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </div>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem @select="showAddCategory = true">
            <Plus class="w-3.5 h-3.5" />
            添加分类
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>

    <!-- 底部操作栏 -->
    <div class="p-2 border-t border-border">
      <Button variant="ghost" class="w-full justify-start gap-2" @click="showSettings = true">
        <Settings class="w-4 h-4" />
        设置
      </Button>
    </div>
  </aside>

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
