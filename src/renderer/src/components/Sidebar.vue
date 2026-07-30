<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import {
  RefreshCw,
  Plus,
  LoaderCircle,
  TriangleAlert,
  ChevronRight,
  Newspaper,
  BookOpen,
  Star,
  Rss
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator
} from '@/components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar'
import { useFeeds, type FeedItem } from '../composables/useFeeds'
import { useArticles } from '../composables/useArticles'
import { useToast } from '../composables/useToast'
import { useAddFeedDialog } from '../composables/useAddFeedDialog'
import { useAddCategoryDialog } from '../composables/useAddCategoryDialog'
import EditFeedDialog from './EditFeedDialog.vue'
const {
  categories,
  feeds,
  unreadCount,
  filter,
  selectFeed,
  selectCategory,
  selectedFeedId,
  selectedCategoryId,
  loadFeeds,
  deleteFeed,
  updateFeed,
  refreshingFeedIds,
  refreshSingleFeed,
  refreshCategoryFeeds,
  refreshAllFeeds
} = useFeeds()

const { showToast } = useToast()
const { showAddFeed } = useAddFeedDialog()
const { showAddCategory, handleEditCategory, handleDeleteCategory } = useAddCategoryDialog()
const dragFeedId = ref<number | null>(null)
const dragOverFeedId = ref<number | null>(null)
const dragOverCategoryId = ref<number | null>(null)
const dropPosition = ref<'before' | 'after'>('after')
const collapsedCategories = reactive<Record<number, boolean>>({})
const editingFeed = ref<FeedItem | null>(null)
const showEditFeed = ref(false)
const renamingFeedId = ref<number | null>(null)
const renameFocused = ref(false)

function isCategoryCollapsed(catId: number): boolean {
  return collapsedCategories[catId] === true
}

function toggleCategory(catId: number): void {
  collapsedCategories[catId] = !collapsedCategories[catId]
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
  editingFeed.value = feed
  showEditFeed.value = true
}

function handleFeedSaved(): void {
  showEditFeed.value = false
  editingFeed.value = null
}

function openFeedInBrowser(feed: FeedItem): void {
  window.open(feed.site_url || feed.url, '_blank')
}

function handleRenameFeed(feedId: number): void {
  renamingFeedId.value = feedId
  setTimeout(() => {
    const input = document.querySelector(
      `[data-rename-input="${feedId}"]`
    ) as HTMLInputElement | null
    if (!input) return
    input.focus()
    input.select()
  }, 200)
}

async function saveRename(): Promise<void> {
  if (!renameFocused.value) return
  if (renamingFeedId.value === null) return
  const feed = feeds.value.find((f) => f.id === renamingFeedId.value)
  if (!feed) return
  const inputEl = document.querySelector(
    `[data-rename-input="${renamingFeedId.value}"]`
  ) as HTMLInputElement | null
  const newTitle = (inputEl?.value || feed.title).trim()
  renameFocused.value = false
  renamingFeedId.value = null
  if (!newTitle || newTitle === feed.title) return
  await updateFeed(feed.id, { title: newTitle, customTitle: 1 })
}

function handleRenameKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') {
    e.preventDefault()
    saveRename()
  } else if (e.key === 'Escape') {
    renameFocused.value = false
    renamingFeedId.value = null
  }
}

function onRenameFocus(): void {
  renameFocused.value = true
}

async function handleDeleteFeed(feedId: number): Promise<void> {
  await deleteFeed(feedId)
}

function handleSelectAll(): void {
  selectFeed(null)
  selectCategory(null)
  filter.value = 'all'
}

function handleSelectUnread(): void {
  selectFeed(null)
  selectCategory(null)
  filter.value = 'unread'
}

function handleSelectStarred(): void {
  selectFeed(null)
  selectCategory(null)
  filter.value = 'starred'
}

function handleSelectFeed(id: number): void {
  filter.value = undefined
  selectFeed(id)
}

function handleSelectCategory(id: number): void {
  selectCategory(id)
  selectFeed(null)
  filter.value = undefined
}

async function handleRefreshFeed(feedId: number, event: Event): Promise<void> {
  event.stopPropagation()
  await refreshSingleFeed(feedId)
}

async function handleImportOpml(): Promise<void> {
  const result = await window.api.opml.import()
  if (result.success && result.data) {
    if ('canceled' in result.data && result.data.canceled) return
    if ('added' in result.data) {
      showToast(`导入完成，新增 ${result.data.added} 个订阅源`)
      await loadFeeds()
    }
  }
}

function getFeedsByCategory(catId: number | null): FeedItem[] {
  return feeds.value.filter((f) => f.category_id === catId)
}

const categoryUnreadCount = computed(() => {
  const map: Record<number, number> = {}
  for (const f of feeds.value) {
    if (f.category_id !== null) {
      map[f.category_id] = (map[f.category_id] || 0) + f.unread_count
    }
  }
  return map
})

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

  const draggedFeed = feeds.value.find((f) => f.id === draggedId)
  if (!draggedFeed) return
  if (draggedFeed.category_id === catId) {
    return
  }

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
    const draggedFeed = feeds.value.find((f) => f.id === draggedId)!
    const insertAt = dropPosition.value === 'after' ? toIndex + 1 : toIndex
    const reordered = [...catFeeds]
    reordered.splice(insertAt, 0, draggedFeed)
    await window.api.feeds.update(draggedId, { categoryId: catId })
    await window.api.feeds.updateSortOrder(reordered.map((f, i) => ({ id: f.id, sort_order: i })))
    await loadFeeds()
    return
  }

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
  <SidebarHeader class="border-b border-sidebar-border" style="-webkit-app-region: drag">
    <div class="flex items-center justify-between">
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
  </SidebarHeader>

  <SidebarHeader class="border-b border-sidebar-border gap-1">
    <SidebarMenuButton :is-active="filter === 'all'" @click="handleSelectAll">
      <span class="flex w-full items-center justify-between">
        <span class="flex items-center gap-2">
          <Newspaper class="size-4" />
          <span>全部文章</span>
        </span>
      </span>
    </SidebarMenuButton>
    <SidebarMenuButton :is-active="filter === 'unread'" @click="handleSelectUnread">
      <span class="flex w-full items-center justify-between">
        <span class="flex items-center gap-2">
          <BookOpen class="size-4" />
          <span>未读文章</span>
        </span>
        <span v-if="unreadCount > 0" class="text-xs tabular-nums text-sidebar-foreground/50">{{
          unreadCount
        }}</span>
      </span>
    </SidebarMenuButton>
    <SidebarMenuButton :is-active="filter === 'starred'" @click="handleSelectStarred">
      <span class="flex items-center gap-2">
        <Star class="size-4" />
        <span>星标文章</span>
      </span>
    </SidebarMenuButton>
  </SidebarHeader>

  <SidebarContent>
    <div class="p-2 h-full">
      <ContextMenu>
        <ContextMenuTrigger class="block h-full">
          <div
            class="h-full"
            @dragover="onDragOverCategory(null, $event)"
            @dragleave="onDragLeaveCategory"
            @drop="onDropToCategory(null, $event)"
          >
            <div
              v-if="categories.length === 0 && feeds.length === 0"
              class="flex flex-col items-center justify-center py-10 px-4 text-center"
            >
              <Rss class="size-10 text-sidebar-foreground/20 mb-3" />
              <p class="text-sm text-sidebar-foreground/50 mb-4">还没有订阅源</p>
              <div class="flex flex-col gap-2 w-full max-w-36">
                <Button size="sm" class="h-7 text-xs" @click="showAddFeed = true">
                  添加订阅源
                </Button>
                <Button size="sm" variant="outline" class="h-7 text-xs" @click="handleImportOpml">
                  导入订阅源
                </Button>
              </div>
            </div>
            <template v-else>
              <div
                v-for="cat in categories"
                :key="cat.id"
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
                      <SidebarGroup>
                        <div
                          data-sidebar="group-label"
                          class="flex w-full items-center gap-1.5 rounded-md my-1 px-2 py-1.5 text-sm transition-colors"
                          :class="
                            selectedCategoryId === cat.id
                              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                              : dragOverCategoryId === cat.id
                                ? 'bg-sidebar-accent/80 text-sidebar-accent-foreground'
                                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                          "
                        >
                          <CollapsibleTrigger as-child>
                            <button
                              class="flex items-center justify-center size-5 shrink-0 -ml-0.5"
                            >
                              <ChevronRight
                                class="w-3.5 h-3.5 transition-transform duration-200"
                                :class="{ 'rotate-90': !isCategoryCollapsed(cat.id) }"
                              />
                            </button>
                          </CollapsibleTrigger>
                          <button
                            class="flex-1 text-left truncate"
                            @click="handleSelectCategory(cat.id)"
                            @dblclick="toggleCategory(cat.id)"
                          >
                            {{ cat.name }}
                          </button>
                          <span
                            v-if="categoryUnreadCount[cat.id] > 0"
                            class="text-xs tabular-nums ml-auto text-sidebar-foreground/50"
                          >
                            {{ categoryUnreadCount[cat.id] }}
                          </span>
                        </div>
                        <CollapsibleContent>
                          <SidebarGroupContent>
                            <SidebarMenu>
                              <SidebarMenuItem
                                v-for="feed in feeds.filter((f) => f.category_id === cat.id)"
                                :key="feed.id"
                              >
                                <ContextMenu>
                                  <ContextMenuTrigger>
                                    <SidebarMenuButton
                                      :is-active="selectedFeedId === feed.id"
                                      draggable="true"
                                      class="relative pl-8"
                                      @click="handleSelectFeed(feed.id)"
                                      @dblclick="openFeedInBrowser(feed)"
                                      @dragstart="onDragStart(feed.id, $event)"
                                      @dragend="onDragEnd"
                                      @dragover="onDragOverFeed(feed.id, $event)"
                                      @dragleave="onDragLeaveFeed"
                                      @drop="onDropReorder(cat.id, feed.id, $event)"
                                    >
                                      <span
                                        v-if="
                                          dragOverFeedId === feed.id && dropPosition === 'before'
                                        "
                                        class="absolute top-0 left-2 right-2 h-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary z-10 pointer-events-none"
                                      />
                                      <span
                                        v-if="
                                          dragOverFeedId === feed.id && dropPosition === 'after'
                                        "
                                        class="absolute bottom-0 left-2 right-2 h-0.5 translate-y-1/2 rounded-full bg-sidebar-primary z-10 pointer-events-none"
                                      />
                                      <span class="flex items-center gap-2 truncate min-w-0 flex-1">
                                        <span
                                          class="w-4 h-4 shrink-0 rounded bg-sidebar-accent flex items-center justify-center text-[10px] overflow-hidden"
                                        >
                                          <img
                                            v-if="feed.favicon_url"
                                            :src="feed.favicon_url"
                                            alt=""
                                            class="w-full h-full object-contain"
                                            @error="
                                              (e: Event) => {
                                                ;(e.target as HTMLImageElement).style.display =
                                                  'none'
                                              }
                                            "
                                          />
                                          <span v-else class="text-sidebar-foreground/70">{{
                                            feed.title.charAt(0)
                                          }}</span>
                                        </span>
                                        <Input
                                          v-if="renamingFeedId === feed.id"
                                          :data-rename-input="feed.id"
                                          :default-value="feed.title"
                                          class="h-6 py-0 px-1 text-sm"
                                          @focus="onRenameFocus"
                                          @keydown="handleRenameKeydown"
                                          @blur="saveRename"
                                        />
                                        <span v-else class="truncate">{{ feed.title }}</span>
                                      </span>
                                      <span
                                        class="flex items-center gap-1 shrink-0 ml-auto overflow-visible"
                                      >
                                        <span
                                          v-if="refreshingFeedIds.has(feed.id)"
                                          class="text-sidebar-foreground/70 animate-spin"
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
                                        <span
                                          v-if="feed.unread_count > 0"
                                          class="text-xs tabular-nums text-sidebar-foreground/50"
                                        >
                                          {{ feed.unread_count }}
                                        </span>
                                      </span>
                                    </SidebarMenuButton>
                                  </ContextMenuTrigger>
                                  <ContextMenuContent>
                                    <ContextMenuItem @select="handleMarkAllRead(feed.id)">
                                      全部标为已读
                                    </ContextMenuItem>
                                    <ContextMenuItem @select="handleRefreshFeed(feed.id, $event)">
                                      刷新
                                    </ContextMenuItem>
                                    <ContextMenuItem @select="openFeedInBrowser(feed)">
                                      打开主页
                                    </ContextMenuItem>
                                    <ContextMenuSeparator />
                                    <ContextMenuItem @select="handleRenameFeed(feed.id)">
                                      重命名
                                    </ContextMenuItem>
                                    <ContextMenuItem @select="handleEditFeed(feed.id)">
                                      编辑
                                    </ContextMenuItem>
                                    <ContextMenuSeparator />
                                    <ContextMenuItem
                                      class="text-destructive! focus:text-destructive"
                                      @select="handleDeleteFeed(feed.id)"
                                    >
                                      删除
                                    </ContextMenuItem>
                                  </ContextMenuContent>
                                </ContextMenu>
                              </SidebarMenuItem>
                            </SidebarMenu>
                          </SidebarGroupContent>
                        </CollapsibleContent>
                      </SidebarGroup>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem @select="handleMarkAllReadByCategory(cat.id)">
                        全部标为已读
                      </ContextMenuItem>
                      <ContextMenuItem @select="handleRefreshCategory(cat.id, $event)">
                        刷新
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem @select="handleEditCategory(cat)">编辑</ContextMenuItem>
                      <ContextMenuItem
                        class="text-destructive! focus:text-destructive"
                        @select="handleDeleteCategory(cat.id)"
                      >
                        删除
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </Collapsible>
              </div>
              <div
                v-if="feeds.filter((f) => f.category_id === null).length > 0"
                class="mt-1"
                @dragover="onDragOverCategory(null, $event)"
                @dragleave="onDragLeaveCategory"
                @drop="onDropToCategory(null, $event)"
              >
                <SidebarGroup>
                  <SidebarGroupLabel
                    :class="
                      dragOverCategoryId === null
                        ? 'bg-sidebar-accent/80 text-sidebar-accent-foreground'
                        : ''
                    "
                  >
                    未分类
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem
                        v-for="feed in feeds.filter((f) => f.category_id === null)"
                        :key="feed.id"
                      >
                        <ContextMenu>
                          <ContextMenuTrigger>
                            <SidebarMenuButton
                              :is-active="selectedFeedId === feed.id"
                              draggable="true"
                              class="relative"
                              @click="handleSelectFeed(feed.id)"
                              @dblclick="openFeedInBrowser(feed)"
                              @dragstart="onDragStart(feed.id, $event)"
                              @dragend="onDragEnd"
                              @dragover="onDragOverFeed(feed.id, $event)"
                              @dragleave="onDragLeaveFeed"
                              @drop="onDropReorder(null, feed.id, $event)"
                            >
                              <span
                                v-if="dragOverFeedId === feed.id && dropPosition === 'before'"
                                class="absolute top-0 left-2 right-2 h-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary z-10 pointer-events-none"
                              />
                              <span
                                v-if="dragOverFeedId === feed.id && dropPosition === 'after'"
                                class="absolute bottom-0 left-2 right-2 h-0.5 translate-y-1/2 rounded-full bg-sidebar-primary z-10 pointer-events-none"
                              />
                              <span class="flex items-center gap-2 truncate min-w-0 flex-1">
                                <span
                                  class="w-4 h-4 shrink-0 rounded bg-sidebar-accent flex items-center justify-center text-[10px] overflow-hidden"
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
                                  <span v-else class="text-sidebar-foreground/70">{{
                                    feed.title.charAt(0)
                                  }}</span>
                                </span>
                                <Input
                                  v-if="renamingFeedId === feed.id"
                                  :data-rename-input="feed.id"
                                  :default-value="feed.title"
                                  class="h-6 py-0 px-1 text-sm"
                                  @focus="onRenameFocus"
                                  @keydown="handleRenameKeydown"
                                  @blur="saveRename"
                                />
                                <span v-else class="truncate">{{ feed.title }}</span>
                              </span>
                              <span
                                class="flex items-center gap-1 shrink-0 ml-auto overflow-visible"
                              >
                                <span
                                  v-if="refreshingFeedIds.has(feed.id)"
                                  class="text-sidebar-foreground/70 animate-spin"
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
                                <span
                                  v-if="feed.unread_count > 0"
                                  class="text-xs tabular-nums text-sidebar-foreground/50"
                                >
                                  {{ feed.unread_count }}
                                </span>
                              </span>
                            </SidebarMenuButton>
                          </ContextMenuTrigger>
                          <ContextMenuContent>
                            <ContextMenuItem @select="handleMarkAllRead(feed.id)">
                              全部标为已读
                            </ContextMenuItem>
                            <ContextMenuItem @select="handleRefreshFeed(feed.id, $event)">
                              刷新
                            </ContextMenuItem>
                            <ContextMenuItem @select="openFeedInBrowser(feed)">
                              打开主页
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem @select="handleRenameFeed(feed.id)">
                              重命名
                            </ContextMenuItem>
                            <ContextMenuItem @select="handleEditFeed(feed.id)"
                              >编辑</ContextMenuItem
                            >
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              class="text-destructive! focus:text-destructive"
                              @select="handleDeleteFeed(feed.id)"
                            >
                              删除
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </div>
              <div class="h-40" />
            </template>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem @select="showAddCategory = true">添加分类</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  </SidebarContent>

  <EditFeedDialog v-model:open="showEditFeed" :feed="editingFeed" @saved="handleFeedSaved" />
</template>
