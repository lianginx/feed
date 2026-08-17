<script setup lang="ts">
import { ListFilterIcon } from '@lucide/vue'
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
  <div
    class="px-3 py-2 flex items-center justify-between gap-2 min-h-9.5 border-b border-border/60 bg-card"
    style="app-region: drag"
  >
    <ArticleSearch class="flex-1" />
    <Button
      v-if="selectedView !== 'unread'"
      class="size-8 shrink-0 flex items-center justify-center transition-colors bg-transparent text-accent-foreground hover:bg-accent"
      :class="{ 'bg-accent': isUnread }"
      title="只看未读"
      style="app-region: no-drag"
      @click="$emit('toggle-unread')"
    >
      <ListFilterIcon class="size-4" />
    </Button>
  </div>
</template>
