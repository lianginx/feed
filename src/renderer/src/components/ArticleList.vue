<script setup lang="ts">
import { watch, ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { Search, Star } from '@lucide/vue'
import { dayjs } from '../utils/dayjs'
import { Button } from '@/components/ui/button'
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
const showSearch = ref(false)
const searchInput = ref<HTMLInputElement | null>(null)

// 展开搜索栏时自动聚焦输入框
watch(showSearch, (val) => {
  if (val) {
    nextTick(() => searchInput.value?.focus())
  }
})
let searchTimer: ReturnType<typeof setTimeout> | null = null

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
    estimateSize: () => 100,
    overscan: 10
  }))
)

function reloadArticles(): void {
  if (selectedFeedId.value !== null) {
    loadArticles(selectedFeedId.value, undefined, filter.value)
  } else if (selectedCategoryId.value !== null) {
    loadArticles(undefined, selectedCategoryId.value, filter.value)
  } else {
    loadArticles(undefined, undefined, filter.value)
  }
}

function toggleSearch(): void {
  showSearch.value = !showSearch.value
  if (!showSearch.value) {
    searchQuery.value = ''
    if (searchActive.value) {
      searchActive.value = false
      reloadArticles()
    }
  }
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key === 'f') {
    event.preventDefault()
    showSearch.value = true
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})

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
  <div class="h-full border-r border-border flex flex-col">
    <!-- 筛选栏（可拖动区域） -->
    <div
      class="p-2 border-b border-border flex items-center gap-2 min-h-9.5"
      style="-webkit-app-region: drag"
    >
      <div class="flex-1" />
      <Button
        class="size-8"
        style="-webkit-app-region: no-drag"
        variant="ghost"
        size="icon-sm"
        title="搜索"
        @click="toggleSearch"
      >
        <Search />
      </Button>
    </div>

    <!-- 搜索框 -->
    <div v-if="showSearch" class="px-4 py-2 border-b border-border">
      <Input
        ref="searchInput"
        v-model="searchQuery"
        type="text"
        placeholder="搜索文章..."
        @input="onSearchInput"
        @keyup.escape="clearSearch"
      />
    </div>

    <!-- 文章列表 -->
    <div ref="parentRef" class="flex-1 overflow-y-overlay">
      <div v-if="loading && articles.length === 0" class="space-y-2 p-4">
        <Skeleton class="h-20 w-full" />
        <Skeleton class="h-20 w-full" />
        <Skeleton class="h-20 w-full" />
      </div>
      <div
        v-else-if="articles.length === 0"
        class="flex items-center justify-center h-32 text-muted-foreground text-sm"
      >
        暂无文章
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
            <!-- 文章条目 -->
            <ContextMenu v-if="row.index < articles.length">
              <ContextMenuTrigger>
                <button
                  class="w-full h-full text-left px-4 border-b border-border transition-colors hover:bg-accent"
                  :class="{
                    'bg-accent': articles[row.index].id === currentArticle?.id
                  }"
                  @click="openArticle(articles[row.index].id)"
                  @dblclick="openInBrowser(articles[row.index].url)"
                >
                  <div class="flex items-start gap-3 py-2.5 h-full">
                    <div class="flex-1 min-w-0 h-full flex flex-col">
                      <div>
                        <div class="flex items-center gap-1.5">
                          <span
                            v-if="!articles[row.index].is_read"
                            class="w-2 h-2 rounded-full bg-unread-dot shrink-0"
                          />
                          <Star
                            v-if="articles[row.index].is_starred"
                            class="w-3 h-3 text-starred shrink-0 fill-starred"
                          />
                          <h3
                            class="text-sm font-medium truncate"
                            :class="
                              articles[row.index].is_read ? 'text-foreground/60' : 'text-foreground'
                            "
                          >
                            {{ articles[row.index].title }}
                          </h3>
                        </div>
                        <p
                          v-if="articles[row.index].summary"
                          class="text-xs mt-1 line-clamp-2"
                          :class="
                            articles[row.index].is_read
                              ? 'text-muted-foreground/60'
                              : 'text-muted-foreground'
                          "
                        >
                          {{ articles[row.index].summary }}
                        </p>
                      </div>
                      <div
                        class="flex items-center gap-2 mt-auto text-xs overflow-hidden"
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
                      class="h-full aspect-4/3 rounded-md object-cover shrink-0 mt-0.5 bg-muted"
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
        <div class="h-40" />
      </template>
    </div>
  </div>
</template>
