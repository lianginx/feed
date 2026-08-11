<script setup lang="ts">
import { ref } from 'vue'
import type { HTMLAttributes } from 'vue'
import { LoaderCircle, TriangleAlert } from '@lucide/vue'
import { Input } from '@renderer/components/ui/input'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator
} from '@renderer/components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { SidebarMenuButton, SidebarMenuItem } from '@renderer/components/ui/sidebar'
import { useFeeds, type FeedItem } from '@renderer/composables/useFeeds'
import { useArticleView } from '@renderer/composables/useArticleView'
import { useArticles } from '@renderer/composables/useArticles'
import { useConfirmDialog } from '@renderer/composables/useConfirmDialog'
import { useFeedDnD } from '@renderer/composables/useFeedDnD'
import { useFeedEditDialog } from '@renderer/composables/useFeedEditDialog'

const props = defineProps<{
  feed: FeedItem
  dropCategoryId: number | null
  class?: HTMLAttributes['class']
}>()

const { selectedFeedId, refreshingFeedIds, updateFeed, deleteFeed, refreshSingleFeed } = useFeeds()
const { selectFeed } = useArticleView()
const { markAllRead } = useArticles()
const { confirm } = useConfirmDialog()
const {
  dragOverFeedId,
  dropPosition,
  onDragStart,
  onDragOverFeed,
  onDragLeaveFeed,
  onDragEnd,
  onDropReorder
} = useFeedDnD()
const { open: openEditFeed } = useFeedEditDialog()

const renamingFeedId = ref<number | null>(null)
const renameFocused = ref(false)

function openFeedInBrowser(): void {
  window.open(props.feed.site_url || props.feed.url, '_blank')
}

function hideBrokenFavicon(e: Event): void {
  ;(e.target as HTMLImageElement).style.display = 'none'
}

function handleEditFeed(): void {
  openEditFeed(props.feed)
}

function handleRenameFeed(): void {
  renamingFeedId.value = props.feed.id
  setTimeout(() => {
    const input = document.querySelector(
      `[data-rename-input="${props.feed.id}"]`
    ) as HTMLInputElement | null
    if (!input) return
    input.focus()
    input.select()
  }, 200)
}

async function saveRename(): Promise<void> {
  if (!renameFocused.value) return
  if (renamingFeedId.value !== props.feed.id) return
  const inputEl = document.querySelector(
    `[data-rename-input="${props.feed.id}"]`
  ) as HTMLInputElement | null
  const newTitle = (inputEl?.value || props.feed.title).trim()
  renameFocused.value = false
  renamingFeedId.value = null
  if (!newTitle || newTitle === props.feed.title) return
  await updateFeed(props.feed.id, { title: newTitle, customTitle: 1 })
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

async function handleDeleteFeed(): Promise<void> {
  const ok = await confirm({
    title: '删除订阅源',
    message: `将删除「${props.feed.title}」及其全部文章，确定？`,
    confirmText: '删除',
    variant: 'danger'
  })
  if (!ok) return
  await deleteFeed(props.feed.id)
}
</script>

<template>
  <SidebarMenuItem
    :class="props.class"
    draggable="true"
    @click="selectFeed(props.feed.id)"
    @dblclick="openFeedInBrowser"
    @dragstart="onDragStart(props.feed.id, $event)"
    @dragend="onDragEnd"
    @dragover="onDragOverFeed(props.feed.id, $event)"
    @dragleave="onDragLeaveFeed"
    @drop="onDropReorder(props.dropCategoryId, props.feed.id, $event)"
  >
    <span
      v-if="dragOverFeedId === props.feed.id && dropPosition === 'before'"
      class="absolute top-0 left-2 right-2 h-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary z-10 pointer-events-none"
    />
    <span
      v-if="dragOverFeedId === props.feed.id && dropPosition === 'after'"
      class="absolute bottom-0 left-2 right-2 h-0.5 translate-y-1/2 rounded-full bg-sidebar-primary z-10 pointer-events-none"
    />
    <ContextMenu>
      <ContextMenuTrigger>
        <SidebarMenuButton :is-active="selectedFeedId === props.feed.id">
          <span class="flex items-center gap-2 truncate min-w-0 flex-1">
            <span
              class="size-4 shrink-0 rounded bg-sidebar-accent flex items-center justify-center text-[10px] overflow-hidden"
            >
              <img
                v-if="props.feed.favicon_url"
                :src="props.feed.favicon_url"
                alt=""
                class="w-full h-full object-contain"
                @error="hideBrokenFavicon"
              />
              <span v-else class="text-sidebar-foreground/70">{{
                props.feed.title.charAt(0)
              }}</span>
            </span>
            <Input
              v-if="renamingFeedId === props.feed.id"
              :data-rename-input="props.feed.id"
              :default-value="props.feed.title"
              class="h-6 py-0 px-1 text-sm"
              @focus="onRenameFocus"
              @keydown="handleRenameKeydown"
              @blur="saveRename"
            />
            <span v-else class="truncate">{{ props.feed.title }}</span>
          </span>
          <span class="flex items-center gap-1 shrink-0 ml-auto overflow-visible">
            <span
              v-if="refreshingFeedIds.has(props.feed.id)"
              class="text-sidebar-foreground/70 animate-spin"
            >
              <LoaderCircle class="w-3 h-3" />
            </span>
            <Tooltip v-else-if="props.feed.last_error">
              <TooltipTrigger>
                <TriangleAlert class="w-3 h-3 text-amber-500" />
              </TooltipTrigger>
              <TooltipContent>
                {{ props.feed.last_error }}
              </TooltipContent>
            </Tooltip>
            <span
              v-if="props.feed.unread_count > 0"
              class="text-xs tabular-nums text-sidebar-foreground/50"
            >
              {{ props.feed.unread_count }}
            </span>
          </span>
        </SidebarMenuButton>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem @select="markAllRead(props.feed.id)">全部标为已读</ContextMenuItem>
        <ContextMenuItem @select.stop="refreshSingleFeed(props.feed.id)">刷新</ContextMenuItem>
        <ContextMenuItem @select="openFeedInBrowser">打开主页</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem @select="handleRenameFeed">重命名</ContextMenuItem>
        <ContextMenuItem @select="handleEditFeed">编辑</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          class="text-destructive! focus:text-destructive"
          @select="handleDeleteFeed"
        >
          删除
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  </SidebarMenuItem>
</template>
