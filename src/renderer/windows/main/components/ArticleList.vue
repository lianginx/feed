<script setup lang="ts">
import { watch, ref, computed } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { Star, Newspaper, BookOpen } from '@lucide/vue'
import { dayjs } from '@renderer/windows/main/utils/dayjs'
import { Skeleton } from '@renderer/shared/components/ui/skeleton'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator
} from '@renderer/shared/components/ui/context-menu'
import { useArticles } from '@renderer/windows/main/composables/useArticles'
import { useFeeds } from '@renderer/windows/main/composables/useFeeds'
import { useArticleView } from '@renderer/windows/main/composables/useArticleView'
import ArticleSearch from '@renderer/windows/main/components/ArticleSearch.vue'
import Button from '@renderer/shared/components/ui/button/Button.vue'

const { articles, currentArticle, loading, reloadScope, openArticle, toggleStar, toggleRead } =
  useArticles()
const { selectedFeedId, selectedCategoryId } = useFeeds()
const { selectedView, isUnread, isStar, isToday } = useArticleView()

const parentRef = ref<HTMLElement | null>(null)

watch(
  [selectedFeedId, selectedCategoryId, isUnread, isStar, isToday],
  () => {
    currentArticle.value = null
    parentRef.value?.scrollTo(0, 0)
    reloadScope()
  },
  { immediate: true }
)

const virtualizer = useVirtualizer(
  computed(() => ({
    count: articles.value.length,
    getScrollElement: () => parentRef.value,
    estimateSize: () => 128,
    overscan: 10
  }))
)

function openInBrowser(url: string | null): void {
  if (url) {
    window.open(url, '_blank')
  }
}

function toggleUnreadFilter(): void {
  isUnread.value = !isUnread.value
}
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="p-3 flex items-center gap-2 min-h-9.5" style="app-region: drag">
      <ArticleSearch />
      <Button
        v-if="selectedView !== 'unread'"
        class="size-8 shrink-0 flex items-center justify-center rounded-md bg-transparent text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
        :class="{ 'text-foreground bg-muted': isUnread }"
        title="只看未读"
        style="app-region: no-drag"
        @click="toggleUnreadFilter"
      >
        <BookOpen class="size-4" />
      </Button>
    </div>

    <div ref="parentRef" class="flex-1 overflow-y-auto">
      <div v-if="loading && articles.length === 0" class="space-y-2 p-4">
        <Skeleton class="h-20 w-full" />
        <Skeleton class="h-20 w-full" />
        <Skeleton class="h-20 w-full" />
      </div>
      <div
        v-else-if="articles.length === 0"
        class="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground"
      >
        <div class="size-10 rounded-full bg-muted flex items-center justify-center">
          <Newspaper class="size-5 text-muted-foreground/60" />
        </div>
        <p class="text-sm">暂无文章</p>
      </div>
      <template v-else>
        <div :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
          <div
            v-for="row in virtualizer.getVirtualItems()"
            :key="`article-${row.index}`"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${row.size}px`,
              transform: `translateY(${row.start}px)`
            }"
          >
            <div v-if="row.index < articles.length" class="h-full px-3 pb-2">
              <ContextMenu>
                <ContextMenuTrigger class="block h-full">
                  <button
                    class="w-full h-full text-left rounded-lg p-3 transition-colors hover:bg-accent"
                    :class="{
                      'bg-accent': articles[row.index].id === currentArticle?.id
                    }"
                    @click="openArticle(articles[row.index].id)"
                    @dblclick="openInBrowser(articles[row.index].url)"
                  >
                    <div class="flex items-start gap-3 h-full">
                      <div class="flex-1 min-w-0 h-full flex flex-col">
                        <div>
                          <div class="flex items-center gap-1.5">
                            <Star
                              v-if="articles[row.index].is_starred"
                              class="w-3 h-3 text-starred shrink-0 fill-starred"
                            />
                            <h3
                              class="line-clamp-2 text-sm font-semibold"
                              :class="
                                articles[row.index].is_read
                                  ? 'text-muted-foreground/80'
                                  : 'text-foreground'
                              "
                            >
                              {{ articles[row.index].title }}
                            </h3>
                          </div>
                          <p
                            v-if="articles[row.index].summary"
                            class="text-xs mt-1 truncate"
                            :class="
                              articles[row.index].is_read
                                ? 'text-muted-foreground/80'
                                : 'text-muted-foreground'
                            "
                          >
                            {{ articles[row.index].summary }}
                          </p>
                        </div>
                        <div
                          class="flex items-center gap-3 mt-auto text-xs overflow-hidden"
                          :class="
                            articles[row.index].is_read
                              ? 'text-muted-foreground/40'
                              : 'text-muted-foreground/60'
                          "
                        >
                          <span class="truncate min-w-0">
                            {{ articles[row.index].feed_title }}
                          </span>
                          <span class="shrink-0">
                            {{ dayjs(articles[row.index].published_at! * 1000).fromNow() }}
                          </span>
                        </div>
                      </div>
                      <img
                        v-if="articles[row.index].cover_image"
                        :src="articles[row.index].cover_image ?? undefined"
                        class="h-full aspect-square rounded-md object-cover shrink-0 bg-muted ring-1 ring-inset ring-black/10 dark:ring-white/10"
                        :class="articles[row.index].is_read ? 'opacity-60' : ''"
                        loading="lazy"
                        @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
                      />
                    </div>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem @select="toggleRead(articles[row.index].id)">
                    {{ articles[row.index].is_read ? '标记未读' : '标为已读' }}
                  </ContextMenuItem>
                  <ContextMenuItem @select="toggleStar(articles[row.index].id)">
                    {{ articles[row.index].is_starred ? '取消星标' : '星标' }}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    v-if="articles[row.index].url"
                    @select="openInBrowser(articles[row.index].url)"
                  >
                    在浏览器中打开
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </div>
          </div>
        </div>
        <div class="h-20 flex justify-center text-xs text-muted-foreground/70">
          <span class="mt-4">已经到底了</span>
        </div>
      </template>
    </div>
  </div>
</template>
