<script setup lang="ts">
import { watch, ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { ExternalLink, Star, Search } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem
} from '@/components/ui/context-menu'
import { useArticles } from '../composables/useArticles'
import { useFeeds } from '../composables/useFeeds'

const {
  articles,
  loading,
  loadingMore,
  hasMore,
  filter,
  loadArticles,
  loadMore,
  openArticle,
  search,
  toggleStar
} = useArticles()
const { selectedFeedId, selectedCategoryId } = useFeeds()

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
    loadArticles(selectedFeedId.value ?? undefined)
  },
  { immediate: true }
)

// 虚拟滚动
const virtualizer = useVirtualizer(
  computed(() => ({
    count: articles.value.length + (hasMore.value ? 1 : 0),
    getScrollElement: () => parentRef.value,
    estimateSize: () => 96,
    overscan: 10
  }))
)

function formatDate(timestamp: number | null): string {
  if (!timestamp) return ''
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return '昨天'
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function toggleSearch(): void {
  showSearch.value = !showSearch.value
  if (!showSearch.value) {
    searchQuery.value = ''
    if (searchActive.value) {
      searchActive.value = false
      loadArticles(selectedFeedId.value ?? undefined)
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
    await loadArticles(selectedFeedId.value ?? undefined)
    return
  }
  searchActive.value = true
  const results = await search(q)
  if (results) {
    articles.value = results
    hasMore.value = false
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

function onScroll(): void {
  const el = parentRef.value
  if (!el || !hasMore.value || loadingMore.value) return
  // 距底部 300px 以内时自动加载更多
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) {
    loadMore()
  }
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
      <Tabs v-model="filter" style="-webkit-app-region: no-drag">
        <TabsList class="h-8">
          <TabsTrigger
            v-for="f in [
              { key: 'all', label: '全部' },
              { key: 'unread', label: '未读' },
              { key: 'starred', label: '星标' }
            ] as const"
            :key="f.key"
            :value="f.key"
            class="h-6.5 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            {{ f.label }}
          </TabsTrigger>
        </TabsList>
      </Tabs>
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
    <div ref="parentRef" class="flex-1 overflow-y-overlay" @scroll="onScroll">
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
      <div v-else :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
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
          <!-- "加载更多"按钮 -->
          <div
            v-if="hasMore && row.index === articles.length"
            class="flex items-center justify-center h-full"
          >
            <Button variant="ghost" size="sm" :disabled="loadingMore" @click="loadMore">
              {{ loadingMore ? '加载中...' : '加载更多' }}
            </Button>
          </div>
          <!-- 文章条目 -->
          <ContextMenu v-else>
            <ContextMenuTrigger>
              <button
                class="w-full h-full text-left px-4 border-b border-border transition-colors hover:bg-accent/10"
                :class="{
                  'bg-accent/5': !articles[row.index].is_read
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
                          class="w-1.5 h-1.5 rounded-full bg-accent shrink-0"
                        />
                        <span v-if="articles[row.index].is_starred" class="text-yellow-500 text-xs"
                          >★</span
                        >
                        <h3 class="text-sm font-medium text-foreground truncate">
                          {{ articles[row.index].title }}
                        </h3>
                      </div>
                      <p
                        v-if="articles[row.index].summary"
                        class="text-xs text-muted-foreground mt-1 line-clamp-2"
                      >
                        {{ articles[row.index].summary }}
                      </p>
                    </div>
                    <div class="flex items-center gap-2 mt-auto text-xs text-muted-foreground">
                      <span>{{ articles[row.index].feed_title }}</span>
                      <span>{{ formatDate(articles[row.index].published_at) }}</span>
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
              <ContextMenuItem
                v-if="articles[row.index].url"
                @select="openInBrowser(articles[row.index].url)"
              >
                <ExternalLink class="size-3.5" />
                在浏览器中打开
              </ContextMenuItem>
              <ContextMenuItem @select="toggleStar(articles[row.index].id)">
                <Star class="w-3.5 h-3.5" />
                {{ articles[row.index].is_starred ? '取消星标' : '星标' }}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </div>
      </div>
    </div>
  </div>
</template>
