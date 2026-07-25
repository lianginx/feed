<script setup lang="ts">
import { onMounted } from 'vue'
import { useApp } from './composables/useApp'
import { useFeeds } from './composables/useFeeds'
import { useShortcuts } from './composables/useShortcuts'
import Sidebar from './components/Sidebar.vue'
import ArticleList from './components/ArticleList.vue'
import ArticleReader from './components/ArticleReader.vue'

const { loadSettings } = useApp()
const { loadFeeds } = useFeeds()

useShortcuts()

onMounted(async () => {
  await loadSettings()
  await loadFeeds()
})
</script>

<template>
  <div class="h-screen overflow-hidden bg-bg-primary flex">
    <!-- 侧边栏（固定宽度） -->
    <div class="w-80 shrink-0 overflow-hidden">
      <Sidebar />
    </div>
    <!-- 文章列表 -->
    <div class="flex-4 min-w-0 overflow-hidden">
      <ArticleList />
    </div>
    <!-- 阅读区域 -->
    <div class="flex-8 min-w-0 overflow-hidden">
      <ArticleReader />
    </div>
  </div>
</template>
