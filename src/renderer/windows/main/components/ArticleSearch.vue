<script setup lang="ts">
import { watch, ref, nextTick, useTemplateRef } from 'vue'
import { Search, X } from '@lucide/vue'
import { useArticles } from '@renderer/windows/main/composables/useArticles'
import { useSearchFocus } from '@renderer/windows/main/composables/useSearchFocus'
import { useDebounceFn } from '@vueuse/core'

const { searchQuery, applySearch } = useArticles()
const { focusSignal } = useSearchFocus()

const searchInput = useTemplateRef('searchInput')
const searchExpanded = ref(false)

const search = useDebounceFn((query: string) => {
  if (query === searchQuery.value) applySearch(query)
})

function onSearchInput() {
  search(searchQuery.value)
}

watch(focusSignal, focusSearch)

async function focusSearch() {
  searchExpanded.value = true
  nextTick(() => {
    searchInput.value?.focus()
    searchInput.value?.select()
  })
}

function onSearchBlur() {
  if (!searchQuery.value.trim()) {
    searchExpanded.value = false
  }
}

function clearSearch() {
  if (searchQuery.value) {
    applySearch('')
    searchInput.value?.focus()
  } else {
    searchInput.value?.blur()
  }
}
</script>

<template>
  <div class="relative flex items-center h-full rounded-md">
    <button
      class="absolute size-8 flex items-center justify-center rounded-md text-accent-foreground transition-colors hover:text-foreground hover:bg-accent"
      :class="{ 'text-muted-foreground bg-transparent hover:bg-transparent': searchExpanded }"
      style="app-region: no-drag"
      title="搜索"
      @click="focusSearch"
    >
      <Search class="size-4" />
    </button>
    <input
      v-if="searchExpanded"
      ref="searchInput"
      v-model="searchQuery"
      type="text"
      placeholder="搜索文章..."
      class="size-full px-8 text-sm"
      :class="{ 'border-b': searchExpanded }"
      style="app-region: no-drag"
      @input="onSearchInput"
      @keydown.esc="clearSearch"
      @blur="onSearchBlur"
    />
    <button
      v-if="searchQuery"
      class="absolute right-0 size-8 flex items-center justify-center rounded-md transition-colors text-muted-foreground hover:text-foreground"
      style="app-region: no-drag"
      title="清除"
      @click="clearSearch"
    >
      <X class="size-4" />
    </button>
  </div>
</template>
