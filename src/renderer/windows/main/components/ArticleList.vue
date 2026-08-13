<script setup lang="ts">
import { watch, computed, useTemplateRef, nextTick } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import type { VirtualItem } from '@tanstack/vue-virtual'
import { Star, Newspaper, BookOpen, ArrowUp } from '@lucide/vue'
import { dayjs, formatRelativeDay } from '@renderer/windows/main/utils/dayjs'
import { Skeleton } from '@renderer/shared/components/ui/skeleton'
import { ScrollArea } from '@renderer/shared/components/ui/scroll-area'
import { Spinner } from '@renderer/shared/components/ui/spinner'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator
} from '@renderer/shared/components/ui/context-menu'
import { useArticles, TOP_THRESHOLD } from '@renderer/windows/main/composables/useArticles'
import { useFeeds } from '@renderer/windows/main/composables/useFeeds'
import { useArticleView } from '@renderer/windows/main/composables/useArticleView'
import ArticleSearch from '@renderer/windows/main/components/ArticleSearch.vue'
import Button from '@renderer/shared/components/ui/button/Button.vue'
import type { Article } from '@shared/types/articles'

const {
  articles,
  currentArticle,
  loading,
  loadingMore,
  hasMore,
  newArticleCount,
  atTop,
  searchQuery,
  reloadFirstPage,
  loadMore,
  openArticle,
  toggleStar,
  toggleRead,
  goNewArticles
} = useArticles()
const { selectedFeedId, selectedCategoryId } = useFeeds()
const { selectedView, isUnread, isStar, isToday } = useArticleView()

const scrollAreaRef = useTemplateRef<InstanceType<typeof ScrollArea>>('scrollArea')

interface DateRow {
  type: 'date'
  key: string
  label: string
}

interface ArticleRow {
  type: 'article'
  key: string
  article: Article
}

type ListRow = DateRow | ArticleRow

function formatDateLabel(date: string): string {
  const today = dayjs().format('YYYY-MM-DD')
  if (date === today) return '今天'
  if (date === dayjs().subtract(1, 'day').format('YYYY-MM-DD')) return '昨天'
  const d = dayjs(date)
  return `${d.month() + 1}月${d.date()}日`
}

const rows = computed<ListRow[]>(() => {
  const result: ListRow[] = []
  let lastLabel = ''
  for (const article of articles.value) {
    const date = article.published_at ? dayjs(article.published_at * 1000).format('YYYY-MM-DD') : ''
    const label = date ? formatDateLabel(date) : '未知时间'
    if (label !== lastLabel) {
      result.push({ type: 'date', key: `date-${label}`, label })
      lastLabel = label
    }
    result.push({ type: 'article', key: `article-${article.id}`, article })
  }
  return result
})

const virtualizer = useVirtualizer(
  computed(() => ({
    count: rows.value.length,
    getScrollElement: () => scrollAreaRef.value?.viewport ?? null,
    estimateSize: (index: number) => (rows.value[index]?.type === 'date' ? 30 : 128),
    overscan: 10
  }))
)

interface VirtualListRow extends VirtualItem {
  row: ListRow
}

const virtualRows = computed<VirtualListRow[]>(() =>
  virtualizer.value
    .getVirtualItems()
    .map((v) => ({ ...v, row: rows.value[v.index] }))
    .filter((v): v is VirtualListRow => v.row !== undefined)
)

function onViewportScroll(): void {
  const el = scrollAreaRef.value?.viewport
  if (!el) return
  atTop.value = el.scrollTop < TOP_THRESHOLD
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
    void loadMore()
  }
}

async function ensureFilled(): Promise<void> {
  if (loadingMore.value || !hasMore.value) return
  await nextTick()
  const el = scrollAreaRef.value?.viewport
  if (!el || el.scrollHeight > el.clientHeight) return
  await loadMore()
}

watch(
  [selectedFeedId, selectedCategoryId, isUnread, isStar, isToday],
  () => {
    currentArticle.value = null
    searchQuery.value = ''
    scrollAreaRef.value?.viewport?.scrollTo(0, 0)
    void reloadFirstPage()
  },
  { immediate: true }
)

watch([() => articles.value.length, loadingMore], () => {
  if (!loadingMore.value) void ensureFilled()
})

function openInBrowser(url: string | null): void {
  if (url) {
    window.open(url, '_blank')
  }
}

function toggleUnreadFilter(): void {
  isUnread.value = !isUnread.value
}

async function onClickNewArticles(): Promise<void> {
  scrollAreaRef.value?.viewport?.scrollTo(0, 0)
  await goNewArticles()
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

    <div class="relative flex-1 min-h-0">
      <ScrollArea ref="scrollArea" class="h-full" @scroll="onViewportScroll">
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
              v-for="vr in virtualRows"
              :key="vr.row.key"
              :style="{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${vr.size}px`,
                transform: `translateY(${vr.start}px)`
              }"
            >
              <div
                v-if="vr.row.type === 'date'"
                class="h-full pl-6 pr-3 flex items-end pb-1.5 text-xs font-semibold text-muted-foreground/70"
              >
                {{ vr.row.label }}
              </div>
              <div v-else class="h-full px-3 pb-2">
                <ContextMenu>
                  <ContextMenuTrigger class="block h-full">
                    <button
                      class="w-full h-full text-left rounded-lg p-3 transition-colors hover:bg-accent"
                      :class="{
                        'bg-accent': vr.row.article.id === currentArticle?.id
                      }"
                      @click="openArticle(vr.row.article.id)"
                      @dblclick="openInBrowser(vr.row.article.url)"
                    >
                      <div class="flex items-start gap-3 h-full">
                        <div class="flex-1 min-w-0 h-full flex flex-col">
                          <div>
                            <div class="flex items-center gap-1.5">
                              <Star
                                v-if="vr.row.article.is_starred"
                                class="w-3 h-3 text-starred shrink-0 fill-starred"
                              />
                              <h3
                                class="line-clamp-2 text-sm font-semibold"
                                :class="
                                  vr.row.article.is_read
                                    ? 'text-muted-foreground/80'
                                    : 'text-foreground'
                                "
                              >
                                {{ vr.row.article.title }}
                              </h3>
                            </div>
                            <p
                              v-if="vr.row.article.summary"
                              class="text-xs mt-1 truncate"
                              :class="
                                vr.row.article.is_read
                                  ? 'text-muted-foreground/80'
                                  : 'text-muted-foreground'
                              "
                            >
                              {{ vr.row.article.summary }}
                            </p>
                          </div>
                          <div
                            class="flex items-center gap-3 mt-auto text-xs overflow-hidden"
                            :class="
                              vr.row.article.is_read
                                ? 'text-muted-foreground/40'
                                : 'text-muted-foreground/60'
                            "
                          >
                            <span class="truncate min-w-0">
                              {{ vr.row.article.feed_title }}
                            </span>
                            <span v-if="vr.row.article.published_at" class="shrink-0">
                              {{ formatRelativeDay(vr.row.article.published_at) }}
                            </span>
                          </div>
                        </div>
                        <img
                          v-if="vr.row.article.cover_image"
                          :src="vr.row.article.cover_image ?? undefined"
                          class="h-full aspect-square rounded-md object-cover shrink-0 bg-muted ring-1 ring-inset ring-black/10 dark:ring-white/10"
                          :class="vr.row.article.is_read ? 'opacity-60' : ''"
                          loading="lazy"
                          @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
                        />
                      </div>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem @select="toggleRead(vr.row.article.id)">
                      {{ vr.row.article.is_read ? '标记未读' : '标为已读' }}
                    </ContextMenuItem>
                    <ContextMenuItem @select="toggleStar(vr.row.article.id)">
                      {{ vr.row.article.is_starred ? '取消星标' : '星标' }}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      v-if="vr.row.article.url"
                      @select="openInBrowser(vr.row.article.url)"
                    >
                      在浏览器中打开
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </div>
            </div>
          </div>
          <div class="h-20 flex items-center justify-center gap-2 text-xs text-muted-foreground/70">
            <Spinner v-if="loadingMore" class="size-4" />
            <span v-else-if="!hasMore">已经到底了</span>
          </div>
        </template>
      </ScrollArea>
      <div class="absolute left-1/2 top-2 z-10 -translate-x-1/2">
        <Transition
          enter-active-class="animate-in fade-in slide-in-from-top-2 duration-200 ease-out"
          leave-active-class="animate-out fade-out slide-out-to-top-2 duration-150 ease-in"
        >
          <button
            v-if="newArticleCount > 0"
            class="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-md transition-colors hover:bg-primary/90 active:scale-[0.96]"
            @click="onClickNewArticles"
          >
            <ArrowUp class="size-3.5" />
            查看 {{ newArticleCount }} 篇新文章
          </button>
        </Transition>
      </div>
    </div>
  </div>
</template>
