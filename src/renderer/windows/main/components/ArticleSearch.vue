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
  <div class="relative flex-1 h-8">
    <Transition
      enter-active-class="transition-all duration-300 ease-in-out"
      enter-from-class="opacity-0 max-w-0"
      enter-to-class="opacity-100 max-w-full"
      leave-active-class="transition-all duration-300 ease-in-out"
      leave-from-class="opacity-100 max-w-full"
      leave-to-class="opacity-0 max-w-0"
    >
      <button
        v-if="!searchExpanded"
        class="size-8 flex items-center justify-start pl-2 rounded-md text-accent-foreground transition-colors hover:text-foreground hover:bg-accent"
        style="app-region: no-drag"
        title="搜索"
        @click="focusSearch"
      >
        <Search class="size-4" />
      </button>
      <div v-else class="absolute inset-0 overflow-hidden">
        <Search
          class="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
        />
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="text"
          placeholder="搜索文章..."
          class="h-full w-full px-8 rounded-md bg-accent/70 border-transparent shadow-none transition-colors hover:bg-accent focus:bg-accent"
          style="app-region: no-drag"
          @input="onSearchInput"
          @keydown.esc="clearSearch"
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
      </div>
    </Transition>
  </div>
</template>
