<script setup lang="ts">
import { Newspaper, BookOpen, Star, CalendarDays } from '@lucide/vue'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem
} from '@renderer/shared/components/ui/context-menu'
import { SidebarMenuButton } from '@renderer/shared/components/ui/sidebar'
import { useFeeds } from '@renderer/windows/main/composables/useFeeds'
import { useArticleView } from '@renderer/windows/main/composables/useArticleView'
import { useArticles } from '@renderer/windows/main/composables/useArticles'
import { useConfirmDialog } from '@renderer/windows/main/composables/useConfirmDialog'

const { unreadCount } = useFeeds()
const { selectedView, selectView } = useArticleView()
const { markAllRead } = useArticles()
const { confirm } = useConfirmDialog()

async function handleMarkAllReadGlobal(): Promise<void> {
  const ok = await confirm({
    title: '全部标为已读',
    message: '将把全部文章标记为已读，确定？',
    confirmText: '全部标为已读'
  })
  if (!ok) return
  await markAllRead()
}
</script>

<template>
  <SidebarMenuButton
    style="app-region: no-drag"
    :is-active="selectedView === 'today'"
    @click="selectView('today')"
  >
    <span class="flex items-center gap-2">
      <CalendarDays class="size-4" />
      <span>今日文章</span>
    </span>
  </SidebarMenuButton>
  <SidebarMenuButton
    style="app-region: no-drag"
    :is-active="selectedView === 'all'"
    @click="selectView('all')"
  >
    <span class="flex w-full items-center justify-between">
      <span class="flex items-center gap-2">
        <Newspaper class="size-4" />
        <span>全部文章</span>
      </span>
    </span>
  </SidebarMenuButton>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <SidebarMenuButton
        style="app-region: no-drag"
        :is-active="selectedView === 'unread'"
        @click="selectView('unread')"
      >
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
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem style="app-region: no-drag" @select="handleMarkAllReadGlobal">
        全部标为已读
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
  <SidebarMenuButton
    style="app-region: no-drag"
    :is-active="selectedView === 'starred'"
    @click="selectView('starred')"
  >
    <span class="flex items-center gap-2">
      <Star class="size-4" />
      <span>星标文章</span>
    </span>
  </SidebarMenuButton>
</template>
