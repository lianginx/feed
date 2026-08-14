<script setup lang="ts">
import { BookOpen } from '@lucide/vue'
import Button from '@renderer/shared/components/ui/button/Button.vue'
import ArticleSearch from '@renderer/windows/main/components/ArticleSearch.vue'

defineProps<{
  selectedView?: string
  isUnread: boolean
}>()

defineEmits<{
  'toggle-unread': []
}>()
</script>

<template>
  <div class="p-3 pb-2 flex items-center gap-2 min-h-9.5" style="app-region: drag">
    <ArticleSearch />
    <Button
      v-if="selectedView !== 'unread'"
      class="size-8 shrink-0 flex items-center justify-center rounded-md bg-transparent text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
      :class="{ 'text-foreground bg-muted': isUnread }"
      title="只看未读"
      style="app-region: no-drag"
      @click="$emit('toggle-unread')"
    >
      <BookOpen class="size-4" />
    </Button>
  </div>
</template>
