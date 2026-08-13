<script setup lang="ts">
import type { ScrollAreaRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { useTemplateRef } from 'vue'
import { ScrollAreaCorner, ScrollAreaRoot, ScrollAreaViewport } from 'reka-ui'
import { cn } from '@/shared/lib/utils'
import ScrollBar from './ScrollBar.vue'

const props = withDefaults(
  defineProps<
    ScrollAreaRootProps & {
      class?: HTMLAttributes['class']
      viewportClass?: HTMLAttributes['class']
    }
  >(),
  {
    type: 'scroll'
  }
)

const emit = defineEmits<{
  scroll: [event: Event]
}>()

const delegatedProps = reactiveOmit(props, 'class', 'viewportClass')

const viewportRef = useTemplateRef<InstanceType<typeof ScrollAreaViewport>>('viewport')

defineExpose({
  get viewport(): HTMLElement | null {
    return viewportRef.value?.viewportElement ?? null
  }
})

function onViewportScroll(event: Event): void {
  emit('scroll', event)
}
</script>

<template>
  <ScrollAreaRoot
    v-bind="delegatedProps"
    :class="cn('relative isolate overflow-hidden', props.class)"
  >
    <ScrollAreaViewport
      ref="viewport"
      :class="cn('h-full w-full rounded-[inherit]', props.viewportClass)"
      @scroll="onViewportScroll"
    >
      <slot />
    </ScrollAreaViewport>
    <ScrollBar />
    <ScrollAreaCorner />
  </ScrollAreaRoot>
</template>
