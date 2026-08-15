<script setup lang="ts">
import { Star } from '@lucide/vue'
import { formatRelativeDay } from '@renderer/windows/main/utils/dayjs'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator
} from '@renderer/shared/components/ui/context-menu'
import type { Article } from '@shared/types/articles'

const props = defineProps<{
  article: Article
}>()

const emit = defineEmits<{
  select: [id: number]
  'toggle-read': [id: number]
  'toggle-star': [id: number]
}>()

function openInBrowser(url: string | null) {
  if (url) window.open(url, '_blank')
}
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger class="block">
      <button
        class="flex flex-col w-full py-4 text-left"
        @click="emit('select', props.article.id)"
        @dblclick="openInBrowser(props.article.url)"
      >
        <div class="flex gap-2 h-21">
          <div class="flex flex-col gap-1 flex-1 min-w-0">
            <div class="flex items-baseline gap-1.5">
              <Star
                v-if="props.article.is_starred"
                class="-ml-4.5 w-3 h-3 text-starred shrink-0 fill-starred"
              />
              <h3
                class="line-clamp-2 font-semibold text-sm"
                :class="props.article.is_read ? 'text-muted-foreground' : 'text-foreground'"
              >
                {{ props.article.title }}
              </h3>
            </div>
            <p
              v-if="props.article.summary"
              class="text-xs line-clamp-2"
              :class="
                props.article.is_read ? 'text-muted-foreground/70' : 'text-muted-foreground/90'
              "
            >
              {{ props.article.summary }}
            </p>
          </div>
          <img
            v-if="props.article.cover_image"
            :src="props.article.cover_image ?? undefined"
            class="h-full aspect-square rounded-md object-cover shrink-0 bg-muted border-[0.5px] border-muted-foreground/10"
            :class="props.article.is_read ? 'opacity-60' : ''"
            loading="lazy"
            @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
          />
        </div>
        <div class="flex items-center gap-3 mt-2 text-xs overflow-hidden text-muted-foreground/70">
          <span class="truncate min-w-0">
            {{ props.article.feed_title }}
          </span>
          <span v-if="props.article.published_at" class="shrink-0">
            {{ formatRelativeDay(props.article.published_at) }}
          </span>
        </div>
      </button>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem @select="emit('toggle-read', props.article.id)">
        {{ props.article.is_read ? '标记未读' : '标为已读' }}
      </ContextMenuItem>
      <ContextMenuItem @select="emit('toggle-star', props.article.id)">
        {{ props.article.is_starred ? '取消星标' : '星标' }}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem v-if="props.article.url" @select="openInBrowser(props.article.url)">
        在浏览器中打开
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
