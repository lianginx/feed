<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'
import type { ComponentPublicInstance } from 'vue'

defineProps<{
  label: string
  dateKey: string
  collapsed: boolean
  stuck: boolean
  headerRef?: (el: Element | ComponentPublicInstance | null, dateKey: string) => void
}>()

defineEmits<{
  'toggle-collapse': [dateKey: string]
}>()
</script>

<template>
  <div
    :ref="(el) => headerRef?.(el, dateKey)"
    class="sticky top-0 z-10 flex items-center select-none bg-card/95 pl-6 pr-5 py-2 text-xs font-semibold text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
    :class="{ 'border-b border-border/50': stuck }"
    @click="$emit('toggle-collapse', dateKey)"
  >
    <span class="flex-1">{{ label }}</span>
    <ChevronDown
      class="size-3.5 transition-transform duration-150"
      :class="{ '-rotate-90': collapsed }"
    />
  </div>
</template>
