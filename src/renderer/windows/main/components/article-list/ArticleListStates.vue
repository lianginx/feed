<script setup lang="ts">
import { Newspaper } from '@lucide/vue'
import { Skeleton } from '@renderer/shared/components/ui/skeleton'
import { Spinner } from '@renderer/shared/components/ui/spinner'

withDefaults(
  defineProps<{
    loading?: boolean
    empty?: boolean
    loadingMore?: boolean
    hasMore?: boolean
  }>(),
  {
    loading: false,
    empty: false,
    loadingMore: false,
    hasMore: false
  }
)
</script>

<template>
  <template v-if="empty">
    <div v-if="loading" class="space-y-2 p-4">
      <Skeleton class="h-20 w-full" />
      <Skeleton class="h-20 w-full" />
      <Skeleton class="h-20 w-full" />
    </div>
    <div v-else class="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
      <div class="size-10 rounded-full bg-muted flex items-center justify-center">
        <Newspaper class="size-5 text-muted-foreground/60" />
      </div>
      <p class="text-sm">暂无文章</p>
    </div>
  </template>
  <div
    v-else
    class="h-30 -mt-10 flex items-center justify-center gap-2 text-xs text-muted-foreground/70"
  >
    <Spinner v-if="loadingMore" class="size-4" />
    <span v-else-if="!hasMore">已经到底了</span>
  </div>
</template>
