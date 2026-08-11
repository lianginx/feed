<script setup lang="ts">
import { RefreshCw, Plus, ChevronsDownUp, ChevronsUpDown } from '@lucide/vue'
import { Button } from '@renderer/shared/components/ui/button'
import { useFeeds } from '@renderer/windows/main/composables/useFeeds'
import { useFeedDnD } from '@renderer/windows/main/composables/useFeedDnD'

const { api } = window

const { refreshingFeedIds, refreshAllFeeds } = useFeeds()
const { allCategoriesCollapsed, toggleAllCategories } = useFeedDnD()
</script>

<template>
  <div class="flex items-center justify-between pl-2">
    <span class="flex items-center gap-1 text-xs text-sidebar-foreground/50">订阅源</span>
    <div class="flex items-center gap-1" style="app-region: no-drag">
      <Button
        class="size-7 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground active:scale-[0.96] transition-[color,background-color,transform]"
        size="icon-sm"
        variant="ghost"
        :title="allCategoriesCollapsed ? '展开全部分组' : '折叠全部分组'"
        @click="toggleAllCategories"
      >
        <component :is="allCategoriesCollapsed ? ChevronsUpDown : ChevronsDownUp" />
      </Button>
      <Button
        class="size-7 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground active:scale-[0.96] transition-[color,background-color,transform]"
        size="icon-sm"
        variant="ghost"
        title="刷新全部"
        :disabled="refreshingFeedIds.size > 0"
        @click="refreshAllFeeds"
      >
        <RefreshCw :class="{ 'animate-spin': refreshingFeedIds.size > 0 }" />
      </Button>
      <Button
        class="size-7 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground active:scale-[0.96] transition-[color,background-color,transform]"
        size="icon-sm"
        variant="ghost"
        title="添加订阅源"
        @click="api.feeds.openAddFeedWindow()"
      >
        <Plus />
      </Button>
    </div>
  </div>
</template>
