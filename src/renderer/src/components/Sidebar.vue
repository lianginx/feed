<script setup lang="ts">
import { ref, reactive } from 'vue'
import { RefreshCw, Plus, CheckCheck, LoaderCircle, TriangleAlert } from '@lucide/vue'
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
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { useFeeds, type FeedItem } from '../composables/useFeeds'
import { useArticles } from '../composables/useArticles'
import { useAddFeedDialog } from '../composables/useAddFeedDialog'
import { useAddCategoryDialog } from '../composables/useAddCategoryDialog'
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

const { showAddFeed } = useAddFeedDialog()
const { showAddCategory, handleEditCategory, handleDeleteCategory } = useAddCategoryDialog()
const dragFeedId = ref<number | null>(null)
const dragOverFeedId = ref<number | null>(null)
const dragOverCategoryId = ref<number | null>(null)
const dropPosition = ref<'before' | 'after'>('after')
const collapsedCategories = reactive<Record<number, boolean>>({})

function isCategoryCollapsed(catId: number): boolean {
  return collapsedCategories[catId] === true
}

async function handleMarkAllRead(feedId?: number): Promise<void> {
  const { markAllRead: markAllArticlesRead } = useArticles()
  await markAllArticlesRead(feedId)
}

async function handleMarkAllReadByCategory(catId: number): Promise<void> {
  await window.api.categories.markAllRead(catId)
  const { loadFeeds } = useFeeds()
  await loadFeeds()
}

async function handleRefreshCategory(catId: number, event: Event): Promise<void> {
  event.stopPropagation()
  await refreshCategoryFeeds(catId)
}

async function handleEditFeed(feedId: number): Promise<void> {
  const feed = feeds.value.find((f) => f.id === feedId)
  if (!feed) return
}

async function handleDeleteFeed(feedId: number): Promise<void> {
  await deleteFeed(feedId)
}

function toggleCategory(catId: number): void {
  collapsedCategories[catId] = !collapsedCategories[catId]
}

function handleSelectAll(): void {
  selectFeed(null)
  selectCategory(null)
}

function handleSelectCategory(id: number): void {
  selectCategory(id)
  selectFeed(null)
}

async function handleRefreshFeed(feedId: number, event: Event): Promise<void> {
  event.stopPropagation()
  await refreshSingleFeed(feedId)
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

function onDragOverFeed(feedId: number, event: DragEvent): void {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dragOverFeedId.value = feedId
  dragOverCategoryId.value = null
  const el = event.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  dropPosition.value = event.clientY - rect.top < rect.height / 2 ? 'before' : 'after'
}

function onDragLeaveFeed(): void {
  dragOverFeedId.value = null
}

function onDragOverCategory(catId: number | null, event: DragEvent): void {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  if ((event.target as HTMLElement).closest('[draggable="true"]')) return
  dragOverCategoryId.value = catId
  dragOverFeedId.value = null
}

function onDragLeaveCategory(): void {
  dragOverCategoryId.value = null
}

function onDragEnd(): void {
  dragFeedId.value = null
  dragOverFeedId.value = null
  dragOverCategoryId.value = null
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

  // 跨分类移动：更新 category_id 并放到目标分类末尾
  const catFeeds = getFeedsByCategory(catId)
  const orderPayload = [
    ...catFeeds.map((f, i) => ({ id: f.id, sort_order: i })),
    { id: draggedId, sort_order: catFeeds.length }
  ]
  await window.api.feeds.update(draggedId, { categoryId: catId })
  await window.api.feeds.updateSortOrder(orderPayload)
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
    // 跨分类拖动到特定位置（按插入线位置插入）
    const draggedFeed = feeds.value.find((f) => f.id === draggedId)!
    const insertAt = dropPosition.value === 'after' ? toIndex + 1 : toIndex
    const reordered = [...catFeeds]
    reordered.splice(insertAt, 0, draggedFeed)
    await window.api.feeds.update(draggedId, { categoryId: catId })
    await window.api.feeds.updateSortOrder(reordered.map((f, i) => ({ id: f.id, sort_order: i })))
    await loadFeeds()
    return
  }

  // 同分类重新排序
  const reordered = [...catFeeds]
  const [moved] = reordered.splice(fromIndex, 1)
  const targetInNew = fromIndex < toIndex ? toIndex - 1 : toIndex
  const insertAt = dropPosition.value === 'after' ? targetInNew + 1 : targetInNew
  reordered.splice(insertAt, 0, moved)

  const orderPayload = reordered.map((f, i) => ({ id: f.id, sort_order: i }))
  await window.api.feeds.updateSortOrder(orderPayload)
  await loadFeeds()
}
</script>

<template>
  <aside class="h-full bg-muted/50 border-r border-border flex flex-col">
    <TooltipProvider>
      <!-- 标题（可拖动区域） -->
      <div
        class="p-2 border-b border-border flex items-center justify-between min-h-9.5"
        style="-webkit-app-region: drag"
      >
        <div />
        <div class="flex items-center gap-1" style="-webkit-app-region: no-drag">
          <Button
            class="size-8"
            variant="ghost"
            size="icon-sm"
            title="添加订阅源"
            @click="showAddFeed = true"
          >
            <Plus />
          </Button>
          <Button
            class="size-8"
            variant="ghost"
            size="icon-sm"
            title="刷新全部"
            :disabled="refreshingFeedIds.size > 0"
            @click="refreshAllFeeds"
          >
            <RefreshCw :class="{ 'animate-spin': refreshingFeedIds.size > 0 }" />
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
              @dragover="onDragOverCategory(null, $event)"
              @dragleave="onDragLeaveCategory"
              @drop="onDropToCategory(null, $event)"
            >
              <!-- 分类区块 -->
              <div
                v-for="cat in categories"
                :key="cat.id"
                class="mt-2"
                @dragover="onDragOverCategory(cat.id, $event)"
                @dragleave="onDragLeaveCategory"
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
                            : dragOverCategoryId === cat.id
                              ? 'bg-accent/15 text-accent'
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
                      <ContextMenuItem @select="handleEditCategory(cat)">
                        编辑分类
                      </ContextMenuItem>
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
                            class="w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center justify-between group relative"
                            :class="{
                              'bg-accent/10 text-accent': selectedFeedId === feed.id,
                              'text-muted-foreground hover:bg-accent/5': selectedFeedId !== feed.id,
                              'opacity-50': dragFeedId === feed.id
                            }"
                            @click="selectFeed(feed.id)"
                            @dragstart="onDragStart(feed.id, $event)"
                            @dragend="onDragEnd"
                            @dragover="onDragOverFeed(feed.id, $event)"
                            @dragleave="onDragLeaveFeed"
                            @drop="onDropReorder(cat.id, feed.id, $event)"
                          >
                            <span
                              v-if="dragOverFeedId === feed.id && dropPosition === 'before'"
                              class="absolute top-0 left-2 right-2 h-0.5 -translate-y-1/2 rounded-full bg-accent z-10 pointer-events-none"
                            />
                            <span
                              v-if="dragOverFeedId === feed.id && dropPosition === 'after'"
                              class="absolute bottom-0 left-2 right-2 h-0.5 translate-y-1/2 rounded-full bg-accent z-10 pointer-events-none"
                            />
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
                              <Tooltip v-else-if="feed.last_error">
                                <TooltipTrigger class="cursor-help">
                                  <TriangleAlert class="w-3 h-3 text-amber-500" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  {{ feed.last_error }}
                                </TooltipContent>
                              </Tooltip>
                              <Badge
                                v-if="feed.unread_count > 0"
                                variant="secondary"
                                class="text-xs"
                              >
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
                          <ContextMenuItem @select="handleEditFeed(feed.id)">
                            编辑
                          </ContextMenuItem>
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
                @dragover="onDragOverCategory(null, $event)"
                @dragleave="onDragLeaveCategory"
                @drop="onDropToCategory(null, $event)"
              >
                <div
                  class="text-xs text-muted-foreground px-3 py-1 rounded-lg transition-colors"
                  :class="dragOverCategoryId === null ? 'bg-accent/10 text-accent' : ''"
                >
                  未分类
                </div>
                <div class="ml-2 mt-1 space-y-0.5">
                  <ContextMenu
                    v-for="feed in feeds.filter((f) => f.category_id === null)"
                    :key="feed.id"
                  >
                    <ContextMenuTrigger>
                      <button
                        :draggable="true"
                        class="w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center justify-between group relative"
                        :class="{
                          'bg-accent/10 text-accent': selectedFeedId === feed.id,
                          'text-muted-foreground hover:bg-accent/5': selectedFeedId !== feed.id,
                          'opacity-50': dragFeedId === feed.id
                        }"
                        @click="selectFeed(feed.id)"
                        @dragstart="onDragStart(feed.id, $event)"
                        @dragend="onDragEnd"
                        @dragover="onDragOverFeed(feed.id, $event)"
                        @dragleave="onDragLeaveFeed"
                        @drop="onDropReorder(null, feed.id, $event)"
                      >
                        <span
                          v-if="dragOverFeedId === feed.id && dropPosition === 'before'"
                          class="absolute top-0 left-2 right-2 h-0.5 -translate-y-1/2 rounded-full bg-accent z-10 pointer-events-none"
                        />
                        <span
                          v-if="dragOverFeedId === feed.id && dropPosition === 'after'"
                          class="absolute bottom-0 left-2 right-2 h-0.5 translate-y-1/2 rounded-full bg-accent z-10 pointer-events-none"
                        />
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
                          <Tooltip v-else-if="feed.last_error">
                            <TooltipTrigger>
                              <TriangleAlert class="w-3 h-3 text-amber-500" />
                            </TooltipTrigger>
                            <TooltipContent>
                              {{ feed.last_error }}
                            </TooltipContent>
                          </Tooltip>
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
    </TooltipProvider>
  </aside>
</template>
