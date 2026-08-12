<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/shared/lib/utils'
import { ScrollArea } from '@/shared/components/ui/scroll-area'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <ScrollArea
    data-sidebar="content"
    :class="cn('flex min-h-0 flex-1 group-data-[collapsible=icon]:overflow-hidden')"
  >
    <div :class="cn('flex min-h-full flex-col gap-2', props.class)">
      <slot />
    </div>
  </ScrollArea>
</template>
