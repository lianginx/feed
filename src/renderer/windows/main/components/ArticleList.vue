<script setup lang="ts">
import { watch, computed, ref, useTemplateRef, nextTick } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { Star, Newspaper, BookOpen, ArrowUp, ChevronDown } from '@lucide/vue'
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

const stuckDates = ref<Set<string>>(new Set())
const headerEls = new Map<string, HTMLElement>()

function setHeaderRef(el: Element | ComponentPublicInstance | null, dateKey: string): void {
  if (el instanceof HTMLElement) headerEls.set(dateKey, el)
  else headerEls.delete(dateKey)
}

function updateStuckHeaders(): void {
  const viewport = scrollAreaRef.value?.viewport
  if (!viewport) return
  if (viewport.scrollTop <= 0) {
    if (stuckDates.value.size > 0) stuckDates.value = new Set()
    return
  }
  const vTop = viewport.getBoundingClientRect().top
  const next = new Set<string>()
  for (const [dateKey, el] of headerEls) {
    if (el.getBoundingClientRect().top <= vTop) next.add(dateKey)
  }
  if (next.size !== stuckDates.value.size || [...next].some((k) => !stuckDates.value.has(k))) {
    stuckDates.value = next
  }
}

interface ArticleGroup {
  dateKey: string
  label: string
  articles: Article[]
}

function formatDateLabel(date: string): string {
  const today = dayjs().format('YYYY-MM-DD')
  if (date === today) return '今天'
  if (date === dayjs().subtract(1, 'day').format('YYYY-MM-DD')) return '昨天'
  const d = dayjs(date)
  return `${d.month() + 1}月${d.date()}日`
}

const collapsedDates = ref<Set<string>>(new Set())

function isDateCollapsed(dateKey: string): boolean {
  return collapsedDates.value.has(dateKey)
}

function toggleDateCollapse(dateKey: string): void {
  const next = new Set(collapsedDates.value)
  if (next.has(dateKey)) next.delete(dateKey)
  else next.add(dateKey)
  collapsedDates.value = next
  void ensureFilled()
}

const groups = computed<ArticleGroup[]>(() => {
  const result: ArticleGroup[] = []
  let last: ArticleGroup | null = null
  for (const article of articles.value) {
    const date = article.published_at ? dayjs(article.published_at * 1000).format('YYYY-MM-DD') : ''
    const dateKey = date || 'unknown'
    if (!last || last.dateKey !== dateKey) {
      last = { dateKey, label: date ? formatDateLabel(date) : '未知时间', articles: [] }
      result.push(last)
    }
    last.articles.push(article)
  }
  return result
})

function onViewportScroll(): void {
  const el = scrollAreaRef.value?.viewport
  if (!el) return
  atTop.value = el.scrollTop < TOP_THRESHOLD
  updateStuckHeaders()
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
    collapsedDates.value = new Set()
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
          <div v-for="group in groups" :key="group.dateKey" class="mb-6">
            <div
              :ref="(el) => setHeaderRef(el, group.dateKey)"
              class="sticky top-0 z-10 flex items-end gap-1 select-none bg-background px-6 py-2 text-xs font-semibold text-muted-foreground/90 transition-colors hover:text-foreground"
              :class="{ 'shadow-sm': stuckDates.has(group.dateKey) }"
              @click="toggleDateCollapse(group.dateKey)"
            >
              <span class="flex-1">{{ group.label }}</span>
              <ChevronDown
                class="size-3.5 transition-transform duration-150"
                :class="{ '-rotate-90': isDateCollapsed(group.dateKey) }"
              />
            </div>
            <template v-if="!isDateCollapsed(group.dateKey)">
              <div
                v-for="article in group.articles"
                :key="`article-${article.id}`"
                class="px-3 transition-colors hover:bg-accent/60"
                :class="{ 'bg-accent': article.id === currentArticle?.id }"
              >
                <ContextMenu>
                  <ContextMenuTrigger class="block">
                    <button
                      class="w-full h-32 text-left px-3 py-3 border-b border-border/40"
                      @click="openArticle(article.id)"
                      @dblclick="openInBrowser(article.url)"
                    >
                      <div class="flex items-start gap-3 h-full">
                        <div class="flex-1 min-w-0 h-full flex flex-col">
                          <div>
                            <div class="flex items-center gap-1.5">
                              <Star
                                v-if="article.is_starred"
                                class="w-3 h-3 text-starred shrink-0 fill-starred"
                              />
                              <h3
                                class="line-clamp-2 text-sm font-semibold"
                                :class="
                                  article.is_read ? 'text-muted-foreground/80' : 'text-foreground'
                                "
                              >
                                {{ article.title }}
                              </h3>
                            </div>
                            <p
                              v-if="article.summary"
                              class="text-xs mt-1 truncate"
                              :class="
                                article.is_read
                                  ? 'text-muted-foreground/80'
                                  : 'text-muted-foreground'
                              "
                            >
                              {{ article.summary }}
                            </p>
                          </div>
                          <div
                            class="flex items-center gap-3 mt-auto text-xs overflow-hidden"
                            :class="
                              article.is_read
                                ? 'text-muted-foreground/40'
                                : 'text-muted-foreground/60'
                            "
                          >
                            <span class="truncate min-w-0">
                              {{ article.feed_title }}
                            </span>
                            <span v-if="article.published_at" class="shrink-0">
                              {{ formatRelativeDay(article.published_at) }}
                            </span>
                          </div>
                        </div>
                        <img
                          v-if="article.cover_image"
                          :src="article.cover_image ?? undefined"
                          class="h-full aspect-square rounded-md object-cover shrink-0 bg-muted ring-1 ring-inset ring-black/10 dark:ring-white/10"
                          :class="article.is_read ? 'opacity-60' : ''"
                          loading="lazy"
                          @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
                        />
                      </div>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem @select="toggleRead(article.id)">
                      {{ article.is_read ? '标记未读' : '标为已读' }}
                    </ContextMenuItem>
                    <ContextMenuItem @select="toggleStar(article.id)">
                      {{ article.is_starred ? '取消星标' : '星标' }}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem v-if="article.url" @select="openInBrowser(article.url)">
                      在浏览器中打开
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </div>
            </template>
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
