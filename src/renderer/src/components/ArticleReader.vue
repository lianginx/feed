<script setup lang="ts">
import { watch, ref } from 'vue'
import { Star, ExternalLink, Rss, Clock, UserRound, ArrowUp } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useArticles } from '../composables/useArticles'
import { useTitleInToolbar } from '../composables/useTitleInToolbar'
import { sanitizeHtml } from '../utils/sanitize'

const { currentArticle, toggleStar } = useArticles()

// 标题滚出视野后放进顶栏（类似 macOS 原生标题）
const contentRef = ref<HTMLElement | null>(null)
const toolbarRef = ref<HTMLElement | null>(null)
const { titleInToolbar } = useTitleInToolbar(contentRef, toolbarRef, currentArticle)

// 返回顶部按钮：滚动超过阈值才显示，悬浮在内容右下角
const BACK_TO_TOP_THRESHOLD = 400
const showBackToTop = ref(false)

function onContentScroll(): void {
  showBackToTop.value = (contentRef.value?.scrollTop ?? 0) > BACK_TO_TOP_THRESHOLD
}

function scrollToTop(): void {
  contentRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

// 切换文章时滚动回顶部
watch(currentArticle, () => {
  if (contentRef.value) {
    contentRef.value.scrollTop = 0
    showBackToTop.value = false
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
  <div class="relative h-full flex flex-col overflow-hidden">
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
      <div
        ref="contentRef"
        class="flex-1 overflow-y-auto overscroll-contain"
        @scroll="onContentScroll"
      >
        <div
          ref="toolbarRef"
          class="sticky top-0 z-10 p-3 flex items-center gap-2 min-h-9.5 bg-card"
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

          <!-- eslint-disable vue/no-v-html -- 内容已由 sanitizeHtml（DOMPurify）净化 -->
          <div
            v-if="currentArticle.content"
            v-highlight
            class="prose prose-neutral dark:prose-invert max-w-none pb-20"
            v-html="sanitizeHtml(currentArticle.content)"
          />
          <!-- eslint-enable vue/no-v-html -->
          <div v-else class="text-muted-foreground text-sm">暂无内容</div>
        </article>
      </div>

      <!-- 返回顶部：悬浮右下角，滚动超过阈值后出现 -->
      <Transition name="back-to-top">
        <Button
          v-if="showBackToTop"
          variant="ghost"
          size="icon"
          class="back-to-top-btn group absolute bottom-5 z-20 size-10 rounded-full bg-background/95 text-muted-foreground shadow-fab backdrop-blur-sm hover:bg-background hover:text-foreground hover:shadow-fab-hover active:scale-[0.96]"
          title="返回顶部"
          aria-label="返回顶部"
          @click="scrollToTop"
        >
          <ArrowUp
            class="size-5 transition-transform duration-200 ease-out group-hover:-translate-y-0.5"
          />
        </Button>
      </Transition>
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

.back-to-top-enter-active,
.back-to-top-leave-active {
  transition:
    opacity 0.2s ease-out,
    transform 0.2s ease-out;
}
.back-to-top-enter-from,
.back-to-top-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.96);
}

/* 返回顶部按钮：锚定正文列（max-w-3xl，即 48rem）右缘外侧。
   公式：正文右缘到卡片右缘的空白 d = (100% - min(100%, 48rem)) / 2，
   right = max(固定贴边 1.25rem, d - 按钮宽(2.5rem) - 间隙(1rem))。
   卡片宽度不足时自动退化为贴卡片右缘向内，避免溢出。 */
.back-to-top-btn {
  right: max(1.25rem, calc((100% - min(100%, 48rem)) / 2 - 3.5rem));
}
</style>
