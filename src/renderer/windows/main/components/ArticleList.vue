<script setup lang="ts">
import { watch, useTemplateRef, nextTick, onUnmounted } from 'vue'
import { ScrollArea } from '@renderer/shared/components/ui/scroll-area'
import { Collapsible, CollapsibleContent } from '@renderer/shared/components/ui/collapsible'
import { useArticles, TOP_THRESHOLD } from '@renderer/windows/main/composables/useArticles'
import { useFeeds } from '@renderer/windows/main/composables/useFeeds'
import { useArticleView } from '@renderer/windows/main/composables/useArticleView'
import { useArticleGroups } from '@renderer/windows/main/composables/useArticleGroups'
import { useStickyDateHeaders } from '@renderer/windows/main/composables/useStickyDateHeaders'
import ArticleListToolbar from '@renderer/windows/main/components/article-list/ArticleListToolbar.vue'
import ArticleGroupHeader from '@renderer/windows/main/components/article-list/ArticleGroupHeader.vue'
import ArticleListItem from '@renderer/windows/main/components/article-list/ArticleListItem.vue'
import ArticleListStates from '@renderer/windows/main/components/article-list/ArticleListStates.vue'
import NewArticlesBadge from '@renderer/windows/main/components/article-list/NewArticlesBadge.vue'

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

const { groups, isDateCollapsed, toggleDateCollapse, resetCollapsed } = useArticleGroups(
  () => articles.value
)
const { stuckDates, setHeaderRef, updateStuckHeaders } = useStickyDateHeaders(
  () => scrollAreaRef.value?.viewport ?? null
)

function onViewportScroll() {
  const el = scrollAreaRef.value?.viewport
  if (!el) return
  atTop.value = el.scrollTop < TOP_THRESHOLD
  updateStuckHeaders()
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
    void loadMore()
  }
}

async function ensureFilled() {
  if (loadingMore.value || !hasMore.value) return
  await nextTick()
  const el = scrollAreaRef.value?.viewport
  if (!el || el.scrollHeight > el.clientHeight) return
  await loadMore()
}

let collapseTimer: ReturnType<typeof setTimeout> | null = null

function onToggleDateCollapse(dateKey: string) {
  toggleDateCollapse(dateKey)
  // 收起动画（200ms）完成前 scrollHeight 未变化，需等动画结束后再判断视口是否填满
  if (collapseTimer) clearTimeout(collapseTimer)
  collapseTimer = setTimeout(() => void ensureFilled(), 250)
}

onUnmounted(() => {
  if (collapseTimer) clearTimeout(collapseTimer)
})

watch(
  [selectedFeedId, selectedCategoryId, isUnread, isStar, isToday],
  () => {
    currentArticle.value = null
    searchQuery.value = ''
    resetCollapsed()
    if (collapseTimer) clearTimeout(collapseTimer)
    scrollAreaRef.value?.viewport?.scrollTo(0, 0)
    void reloadFirstPage()
  },
  { immediate: true }
)

watch([() => articles.value.length, loadingMore], () => {
  if (!loadingMore.value) void ensureFilled()
})

function toggleUnreadFilter() {
  isUnread.value = !isUnread.value
}

async function onClickNewArticles() {
  scrollAreaRef.value?.viewport?.scrollTo(0, 0)
  await goNewArticles()
}
</script>

<template>
  <div class="h-full flex flex-col">
    <ArticleListToolbar
      :selected-view="selectedView"
      :is-unread="isUnread"
      @toggle-unread="toggleUnreadFilter"
    />

    <div class="relative flex-1 min-h-0">
      <ScrollArea ref="scrollArea" class="h-full" @scroll="onViewportScroll">
        <ArticleListStates v-if="articles.length === 0" :loading="loading" empty />
        <template v-else>
          <div v-for="group in groups" :key="group.dateKey" class="mb-6">
            <Collapsible :open="!isDateCollapsed(group.dateKey)">
              <ArticleGroupHeader
                :label="group.label"
                :date-key="group.dateKey"
                :collapsed="isDateCollapsed(group.dateKey)"
                :stuck="stuckDates.has(group.dateKey)"
                :header-ref="setHeaderRef"
                @toggle-collapse="onToggleDateCollapse"
              />
              <CollapsibleContent>
                <div
                  v-for="article in group.articles"
                  :key="`article-${article.id}`"
                  class="pl-6 pr-5 border-t last:border-b border-border/50 transition-colors hover:bg-muted"
                  :class="{ 'bg-muted': article.id === currentArticle?.id }"
                >
                  <ArticleListItem
                    :article="article"
                    @select="openArticle"
                    @toggle-read="toggleRead"
                    @toggle-star="toggleStar"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
          <ArticleListStates :loading-more="loadingMore" :has-more="hasMore" />
        </template>
      </ScrollArea>
      <div class="absolute left-1/2 top-10 z-10 -translate-x-1/2">
        <NewArticlesBadge :count="newArticleCount" @click="onClickNewArticles" />
      </div>
    </div>
  </div>
</template>
