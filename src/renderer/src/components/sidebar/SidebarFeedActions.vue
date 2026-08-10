<script setup lang="ts">
import { RefreshCw, Plus } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useFeeds } from '@/composables/useFeeds'

const { refreshingFeedIds, refreshAllFeeds } = useFeeds()

function openAddFeedWindow(): void {
  void window.api.feeds.openAddFeedWindow()
}
</script>

<template>
  <div class="flex items-center justify-between pl-2">
    <span class="flex items-center gap-1 text-xs text-sidebar-foreground/50">订阅源</span>
    <div class="flex items-center gap-1" style="app-region: no-drag">
      <Button
        class="size-7 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground active:scale-[0.96] transition-[color,background-color,transform]"
        size="icon-sm"
        variant="ghost"
        title="刷新全部"
        :disabled="refreshingFeedIds.size > 0"
        @click="refreshAllFeeds"
      >
        <RefreshCw class="size-4" :class="{ 'animate-spin': refreshingFeedIds.size > 0 }" />
      </Button>
      <Button
        class="size-7 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground active:scale-[0.96] transition-[color,background-color,transform]"
        size="icon-sm"
        variant="ghost"
        title="添加订阅源"
        @click="openAddFeedWindow"
      >
        <Plus class="size-4" />
      </Button>
    </div>
  </div>
</template>
