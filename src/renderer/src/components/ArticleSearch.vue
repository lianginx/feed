<script setup lang="ts">
import { watch, ref, nextTick } from 'vue'
import { Search, X } from '@lucide/vue'
import { Input } from '@/components/ui/input'
import { useArticles } from '@/composables/useArticles'
import { useFeeds } from '@/composables/useFeeds'
import { useArticleView } from '@/composables/useArticleView'
import { useSearchFocus } from '@/composables/useSearchFocus'

const { articles, reloadScope, search } = useArticles()
const { selectedFeedId, selectedCategoryId } = useFeeds()
const { isUnread, isStar, isToday } = useArticleView()

const searchQuery = ref('')
const searchExpanded = ref(true)
const searchInput = ref<{ $el: Element } | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | null = null

const { focusSignal } = useSearchFocus()

async function focusSearch(): Promise<void> {
  searchExpanded.value = true
  await nextTick()
  const el = searchInput.value?.$el
  if (el instanceof HTMLInputElement) {
    el.focus()
    el.select()
  }
}

// 菜单触发的搜索聚焦（⌘F）
watch(focusSignal, focusSearch)

async function handleSearch(): Promise<void> {
  const q = searchQuery.value.trim()
  if (!q) {
    await reloadScope()
    return
  }
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

function onSearchBlur(): void {
  // 暂时不折叠
}

// 切换订阅源/分类/筛选时清空搜索
watch([selectedFeedId, selectedCategoryId, isUnread, isStar, isToday], () => {
  searchQuery.value = ''
})
</script>

<template>
  <div class="relative flex-1 h-8" style="app-region: no-drag">
    <button
      v-if="!searchExpanded"
      class="size-8 flex items-center justify-start pl-2 rounded-md text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
      title="搜索"
      @click="focusSearch"
    >
      <Search class="size-4" />
    </button>
    <template v-else>
      <Search
        class="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
      />
      <Input
        ref="searchInput"
        v-model="searchQuery"
        type="text"
        placeholder="搜索文章..."
        class="h-full w-full pl-8 pr-8 rounded-md bg-muted/70 border-transparent shadow-none transition-colors hover:bg-muted focus:bg-muted"
        @input="onSearchInput"
        @keyup.escape="clearSearch"
        @blur="onSearchBlur"
      />
      <button
        v-if="searchQuery"
        class="absolute right-1 top-1/2 -translate-y-1/2 size-7 flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
        title="清除"
        @click="clearSearch"
      >
        <X class="size-3.5" />
      </button>
    </template>
  </div>
</template>
