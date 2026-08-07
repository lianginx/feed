<script setup lang="ts">
import { watch, ref, computed, nextTick } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { Search, Star, X, Newspaper } from '@lucide/vue'
import { dayjs } from '../utils/dayjs'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator
} from '@/components/ui/context-menu'
import { useArticles } from '../composables/useArticles'
import { useFeeds } from '../composables/useFeeds'
import { useSearchFocus } from '../composables/useSearchFocus'

const {
  articles,
  currentArticle,
  loading,
  loadArticles,
  openArticle,
  search,
  toggleStar,
  toggleRead
} = useArticles()
const { selectedFeedId, selectedCategoryId, filter } = useFeeds()

const parentRef = ref<HTMLElement | null>(null)
const searchQuery = ref('')
const searchActive = ref(false)
const searchInput = ref<{ $el: Element } | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | null = null

const { focusSignal } = useSearchFocus()

// 菜单触发的搜索聚焦（⌘F）
watch(focusSignal, () => {
  nextTick(() => {
    const el = searchInput.value?.$el
    if (el instanceof HTMLInputElement) {
      el.focus()
      el.select()
    }
  })
})

// 当选择的订阅源或筛选条件变化时重新加载
watch(
  [selectedFeedId, selectedCategoryId, filter],
  () => {
    searchActive.value = false
    searchQuery.value = ''
    currentArticle.value = null // 切换时关闭文章详情
    parentRef.value?.scrollTo(0, 0) // 滚动到顶部
    reloadArticles()
  },
  { immediate: true }
)

// 虚拟滚动
const virtualizer = useVirtualizer(
  computed(() => ({
    count: articles.value.length,
    getScrollElement: () => parentRef.value,
    estimateSize: () => 128,
    overscan: 10
  }))
)

function reloadArticles(): void {
  if (selectedFeedId.value !== null) {
    loadArticles(selectedFeedId.value, undefined, filter.value)
  } else if (selectedCategoryId.value !== undefined) {
    loadArticles(undefined, selectedCategoryId.value, filter.value)
  } else {
    loadArticles(undefined, undefined, filter.value)
  }
}

async function handleSearch(): Promise<void> {
  const q = searchQuery.value.trim()
  if (!q) {
    searchActive.value = false
    await reloadArticles()
    return
  }
  searchActive.value = true
  const results = await search(q)
  if (results) {
    articles.value = results
  }
}

function onSearchInput(): void {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(handleSearch, 300)
}

function clearSearch(): void {
  searchQuery.value = ''
  handleSearch()
}

function openInBrowser(url: string | null): void {
  if (url) {
    window.open(url, '_blank')
  }
}
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="p-3 flex items-center min-h-9.5" style="app-region: drag">
      <div class="relative flex-1 h-8" style="app-region: no-drag">
        <Search
          class="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
        />
        <Input
          ref="searchInput"
          v-model="searchQuery"
          type="text"
          placeholder="搜索文章..."
          class="h-full w-full pl-8 pr-8 rounded-md bg-muted/70 border-transparent shadow-none transition-colors hover:bg-muted focus:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
          @input="onSearchInput"
          @keyup.escape="clearSearch"
        />
        <button
          v-if="searchQuery"
          class="absolute right-1 top-1/2 -translate-y-1/2 size-7 flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          title="清除"
          @click="clearSearch"
        >
          <X class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- 文章列表 -->
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
            <!-- 文章条目：悬浮行 + 圆角 hover，无分隔线 -->
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
