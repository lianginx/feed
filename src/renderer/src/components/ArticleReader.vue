<script setup lang="ts">
import { watch, ref } from 'vue'
import { Star, ExternalLink, Rss, Clock, UserRound } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useArticles } from '../composables/useArticles'
import { useTitleInToolbar } from '../composables/useTitleInToolbar'
import { sanitizeHtml } from '../utils/sanitize'

const { currentArticle, toggleStar } = useArticles()

// 标题滚出视野后放进顶栏（类似 macOS 原生标题）
const contentRef = ref<HTMLElement | null>(null)
const toolbarRef = ref<HTMLElement | null>(null)
const { titleInToolbar } = useTitleInToolbar(contentRef, toolbarRef, currentArticle)

// 切换文章时滚动回顶部
watch(currentArticle, () => {
  if (contentRef.value) {
    contentRef.value.scrollTop = 0
  }
})

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
      <div ref="contentRef" class="flex-1 overflow-y-auto overscroll-contain">
        <div
          ref="toolbarRef"
          class="sticky top-0 z-10 p-3 flex items-center gap-2 min-h-9.5 bg-background"
          style="-webkit-app-region: drag"
        >
          <div class="flex-1 min-w-0 flex items-center">
            <Transition name="title-fade">
              <span
                v-if="titleInToolbar"
                class="min-w-0 font-medium text-foreground truncate select-none cursor-default"
                :title="currentArticle.url ? '在浏览器中打开' : undefined"
              >
                {{ currentArticle.title }}
              </span>
            </Transition>
          </div>
          <div style="-webkit-app-region: no-drag" class="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon-sm"
              class="text-muted-foreground"
              :class="currentArticle.is_starred ? 'text-starred' : ''"
              @click="toggleStar(currentArticle.id)"
            >
              <Star :fill="currentArticle.is_starred ? 'currentColor' : 'none'" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              class="text-muted-foreground"
              @click="openInBrowser(currentArticle.url)"
            >
              <ExternalLink />
            </Button>
          </div>
        </div>

        <article class="max-w-3xl mx-auto px-8" style="user-select: text">
          <header class="mb-8">
            <h1
              ref="articleTitle"
              class="text-3xl font-bold text-foreground leading-snug mb-4 text-balance cursor-default hover:underline transition-colors"
              :title="currentArticle.url ? '在浏览器中打开' : undefined"
              @click="openInBrowser(currentArticle.url)"
            >
              {{ currentArticle.title }}
            </h1>
            <div
              class="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground"
            >
              <span class="flex items-center gap-1.5">
                <img
                  v-if="currentArticle.favicon_url"
                  :src="currentArticle.favicon_url"
                  class="size-4 rounded-sm"
                  alt=""
                  @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
                />
                <Rss v-else class="size-4 text-muted-foreground/50" />
                {{ currentArticle.feed_title }}
              </span>
              <span v-if="currentArticle.author" class="flex items-center gap-1.5">
                <UserRound class="size-4 text-muted-foreground/50" />
                {{ currentArticle.author }}
              </span>
              <span class="flex items-center gap-1.5">
                <Clock class="size-4 text-muted-foreground/50" />
                {{ formatDate(currentArticle.published_at) }}
              </span>
            </div>
          </header>

          <div
            v-if="currentArticle.content"
            v-highlight
            class="prose prose-sm prose-neutral max-w-none dark:prose-invert pb-20"
            v-html="sanitizeHtml(currentArticle.content)"
          />
          <div v-else class="text-muted-foreground text-sm">暂无内容</div>
        </article>
      </div>
    </template>
  </div>
</template>

<style scoped>
.title-fade-enter-active,
.title-fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.title-fade-enter-from,
.title-fade-leave-to {
  opacity: 0;
  transform: translateY(3px);
}
</style>
