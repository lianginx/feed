<script setup lang="ts">
import { Star, ExternalLink } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useArticles } from '../composables/useArticles'
import { sanitizeHtml } from '../utils/sanitize'

const { currentArticle, toggleStar } = useArticles()

function formatDate(timestamp: number | null): string {
  if (!timestamp) return ''
  return new Date(timestamp * 1000).toLocaleString('zh-CN')
}

function openInBrowser(url: string | null): void {
  if (url) {
    window.open(url, '_blank')
  }
}
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <!-- 空状态 - 未选中文章 -->
    <div v-if="!currentArticle" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <div class="w-12 h-12 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
          <svg
            class="w-6 h-6 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
        </div>
        <p class="text-sm text-muted-foreground">选择一篇文章开始阅读</p>
      </div>
    </div>

    <!-- 文章内容 - 已选中文章 -->
    <template v-else>
      <!-- 工具栏（可拖动区域） -->
      <div
        class="px-6 py-3.5 border-b border-border flex items-center gap-3"
        style="-webkit-app-region: drag"
      >
        <div class="flex-1" />
        <div style="-webkit-app-region: no-drag" class="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            :class="currentArticle.is_starred ? 'text-yellow-500' : ''"
            @click="toggleStar(currentArticle.id)"
          >
            <Star class="w-4 h-4" :fill="currentArticle.is_starred ? 'currentColor' : 'none'" />
            {{ currentArticle.is_starred ? '已星标' : '星标' }}
          </Button>
          <Button variant="ghost" size="sm" @click="openInBrowser(currentArticle.url)">
            <ExternalLink class="w-4 h-4" />
            在浏览器打开
          </Button>
        </div>
      </div>

      <!-- 文章内容 -->
      <div class="flex-1 overflow-y-overlay">
        <article class="max-w-3xl mx-auto px-8 py-6" style="user-select: text">
          <header class="mb-6">
            <h1 class="text-2xl font-bold text-foreground leading-snug mb-3">
              {{ currentArticle.title }}
            </h1>
            <div class="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span>{{ currentArticle.feed_title }}</span>
              <span v-if="currentArticle.author">{{ currentArticle.author }}</span>
              <span>{{ formatDate(currentArticle.published_at) }}</span>
            </div>
          </header>

          <div
            v-if="currentArticle.content"
            class="prose prose-sm max-w-none text-foreground"
            :style="{ fontSize: '15px', lineHeight: '1.75' }"
            v-html="sanitizeHtml(currentArticle.content)"
          />
          <div v-else class="text-muted-foreground text-sm">暂无内容</div>
        </article>
      </div>
    </template>
  </div>
</template>
