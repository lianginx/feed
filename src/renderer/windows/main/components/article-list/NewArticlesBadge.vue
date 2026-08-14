<script setup lang="ts">
import { ArrowUp } from '@lucide/vue'

defineProps<{
  count: number
}>()

defineEmits<{
  click: []
}>()
</script>

<template>
  <Transition
    enter-active-class="animate-in fade-in slide-in-from-top-2 duration-200 ease-out"
    leave-active-class="animate-out fade-out slide-out-to-top-2 duration-150 ease-in"
  >
    <button
      v-if="count > 0"
      class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-md transition-colors hover:bg-primary/90 active:scale-[0.96]"
      @click="$emit('click')"
    >
      <ArrowUp class="size-3.5" />
      查看 {{ count }} 篇新文章
    </button>
  </Transition>
</template>
