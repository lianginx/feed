<script setup lang="ts">
import { Rss } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@renderer/components/ui/button'
import { useFeeds } from '@renderer/composables/useFeeds'

const { api } = window

const { loadFeeds } = useFeeds()

async function handleImportOpml(): Promise<void> {
  const result = await api.opml.import()
  if (result.success && result.data) {
    if ('canceled' in result.data && result.data.canceled) return
    if ('added' in result.data) {
      toast.success(`导入完成，新增 ${result.data.added} 个订阅源`)
      await loadFeeds()
    }
  }
}
</script>

<template>
  <div class="flex flex-col items-center justify-center py-10 px-4 text-center">
    <Rss class="size-10 text-sidebar-foreground/20 mb-3" />
    <p class="text-sm text-sidebar-foreground/50 mb-4">还没有订阅源</p>
    <div class="flex flex-col gap-2 w-full max-w-36">
      <Button size="sm" class="h-7 text-xs" @click="api.feeds.openAddFeedWindow()"
        >添加订阅源</Button
      >
      <Button size="sm" variant="outline" class="h-7 text-xs" @click="handleImportOpml">
        导入订阅源
      </Button>
    </div>
  </div>
</template>
