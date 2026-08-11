<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight } from '@lucide/vue'
import { CollapsibleTrigger } from '@renderer/components/ui/collapsible'
import { useFeeds } from '@renderer/composables/useFeeds'
import { useArticleView } from '@renderer/composables/useArticleView'
import { useFeedDnD } from '@renderer/composables/useFeedDnD'

const props = defineProps<{
  catId: number | null
  name: string
}>()

const { feeds, selectedCategoryId } = useFeeds()
const { selectCategory } = useArticleView()
const {
  dragOverCategoryId,
  dragOverCategorySortId,
  categoryDropPosition,
  isCategoryCollapsed,
  toggleCategory,
  toggleUncategorized,
  uncategorizedCollapsed,
  onCategoryDragStart,
  onCategoryDragOver,
  onCategoryDragLeave,
  onCategoryDrop,
  onCategoryDragEnd
} = useFeedDnD()

const isCollapsed = computed(() =>
  props.catId === null ? uncategorizedCollapsed.value : isCategoryCollapsed(props.catId)
)

const unreadCount = computed(() =>
  feeds.value.reduce((sum, f) => (f.category_id === props.catId ? sum + f.unread_count : sum), 0)
)

function toggle(): void {
  if (props.catId === null) toggleUncategorized()
  else toggleCategory(props.catId)
}

function handleCategoryDragStart(event: DragEvent): void {
  if (props.catId !== null) onCategoryDragStart(props.catId, event)
}

function handleCategoryDragOver(event: DragEvent): void {
  if (props.catId !== null) onCategoryDragOver(props.catId, event)
}

function handleCategoryDrop(event: DragEvent): void {
  if (props.catId !== null) onCategoryDrop(props.catId, event)
}
</script>

<template>
  <div
    data-sidebar="group-label"
    :draggable="catId !== null"
    class="relative flex w-full items-center rounded-md text-sm transition-colors"
    :class="
      selectedCategoryId === catId
        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
        : dragOverCategoryId === catId
          ? 'bg-sidebar-accent/80 text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
    "
    @dragstart="handleCategoryDragStart"
    @dragend="onCategoryDragEnd"
    @dragover="handleCategoryDragOver"
    @dragleave="onCategoryDragLeave"
    @drop="handleCategoryDrop"
  >
    <template v-if="catId !== null">
      <span
        v-if="dragOverCategorySortId === catId && categoryDropPosition === 'before'"
        class="absolute top-0 left-2 right-2 h-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary z-10 pointer-events-none"
      />
      <span
        v-if="dragOverCategorySortId === catId && categoryDropPosition === 'after'"
        class="absolute bottom-0 left-2 right-2 h-0.5 translate-y-1/2 rounded-full bg-sidebar-primary z-10 pointer-events-none"
      />
    </template>
    <CollapsibleTrigger as-child>
      <button class="flex items-center justify-center size-8 shrink-0">
        <ChevronRight
          class="w-3.5 h-3.5 transition-transform duration-200"
          :class="{ 'rotate-90': !isCollapsed }"
        />
      </button>
    </CollapsibleTrigger>
    <button
      class="flex-1 text-left truncate py-1.5 pr-2 flex items-baseline justify-between gap-2"
      @click="selectCategory(catId)"
      @dblclick="toggle"
    >
      <span class="truncate">{{ name }}</span>
      <span v-if="unreadCount > 0" class="text-xs tabular-nums text-sidebar-foreground/50">
        {{ unreadCount }}
      </span>
    </button>
  </div>
</template>
