<script setup lang="ts">
import { watch, ref, computed } from 'vue'
import { Star, ExternalLink, Rss, ArrowUp, Languages, RefreshCw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useArticles } from '../composables/useArticles'
import { useTitleInToolbar } from '../composables/useTitleInToolbar'
import { useTranslate } from '../composables/useTranslate'
import { sanitizeHtml } from '../utils/sanitize'
import { dayjs } from '../utils/dayjs'
import { estimateReadingTime } from '../utils/readingTime'

const { currentArticle, toggleStar } = useArticles()
const { translating, translated, shown, configured, toggle, refresh } = useTranslate()

// 标题：译文显示时用译文标题（h1 与顶栏共用）
const displayTitle = computed(() =>
  shown.value && translated.value ? translated.value.title : (currentArticle.value?.title ?? '')
)

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

// 时间显示：默认相对时间（如「3 小时前」），点击切换为绝对时间
const useRelativeTime = ref(true)

function formatDate(timestamp: number | null): string {
  if (!timestamp) return ''
  return new Date(timestamp * 1000).toLocaleString('zh-CN')
}

function formatTime(timestamp: number | null): string {
  if (!timestamp) return ''
  return useRelativeTime.value ? dayjs(timestamp * 1000).fromNow() : formatDate(timestamp)
}

function toggleTimeFormat(): void {
  useRelativeTime.value = !useRelativeTime.value
}

function openInBrowser(url: string | null): void {
  if (url) {
    window.open(url, '_blank')
  }
}

// 阅读时间：根据文章正文字数估算（中文按字、英文按词，分开计速）
const readingTime = computed(() => estimateReadingTime(currentArticle.value?.content ?? null))
</script>

<template>
  <div class="relative h-full flex flex-col overflow-hidden">
    <!-- 空状态 - 未选中文章 -->
    <div
      v-if="!currentArticle"
      class="flex-1 flex items-center justify-center"
      style="app-region: drag"
    >
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
          style="app-region: drag"
        >
          <!-- 增加 ml-2 与右边图标视觉对齐 -->
          <div class="flex-1 min-w-0 flex items-center ml-2">
            <Transition name="title-fade">
              <span v-if="titleInToolbar" class="font-medium line-clamp-1">
                {{ displayTitle }}
              </span>
            </Transition>
          </div>
          <div style="app-region: no-drag" class="flex items-center gap-1 shrink-0">
            <Button
              v-if="configured"
              variant="ghost"
              size="icon-sm"
              class="size-8 text-muted-foreground"
              :class="shown ? 'text-primary' : ''"
              :disabled="translating"
              :title="shown ? '显示原文' : '翻译'"
              aria-label="翻译"
              @click="toggle"
            >
              <Spinner v-if="translating" class="size-4" />
              <Languages v-else class="size-4" />
            </Button>
            <Button
              v-if="configured && shown"
              variant="ghost"
              size="icon-sm"
              class="size-8 text-muted-foreground"
              :disabled="translating"
              title="重新翻译（忽略缓存）"
              aria-label="重新翻译"
              @click="refresh"
            >
              <RefreshCw class="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              class="size-8 text-muted-foreground"
              :class="currentArticle.is_starred ? 'text-starred' : ''"
              @click="toggleStar(currentArticle.id)"
            >
              <Star :fill="currentArticle.is_starred ? 'currentColor' : 'none'" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              class="size-8 text-muted-foreground"
              @click="openInBrowser(currentArticle.url)"
            >
              <ExternalLink />
            </Button>
          </div>
        </div>

        <article class="max-w-3xl mx-auto px-8" style="user-select: text">
          <header class="mb-8 flex flex-col">
            <div
              class="flex items-center gap-1.5 mb-2 text-sm text-muted-foreground cursor-default"
            >
              <img
                v-if="currentArticle.favicon_url"
                :src="currentArticle.favicon_url"
                class="size-4 rounded-sm"
                alt=""
                @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
              />
              <Rss v-else class="size-4 text-muted-foreground/50" />
              {{ currentArticle.feed_title }}
            </div>
            <h1
              ref="articleTitle"
              class="mb-4 text-3xl font-bold text-foreground leading-snug text-balance cursor-default hover:underline transition-colors"
              :title="currentArticle.url ? '在浏览器中打开' : undefined"
              @click="openInBrowser(currentArticle.url)"
            >
              {{ displayTitle }}
            </h1>
            <div
              class="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground cursor-default"
            >
              <span v-if="currentArticle.author" class="flex items-center transition-colors">
                {{ currentArticle.author }}
              </span>
              <span
                class="flex items-center transition-colors"
                title="点击切换时间格式"
                role="button"
                @click="toggleTimeFormat"
              >
                {{ formatTime(currentArticle.published_at) }}
              </span>
              <span v-if="readingTime" class="flex items-center">
                阅读约 {{ readingTime }} 分钟
              </span>
            </div>
          </header>

          <!-- eslint-disable vue/no-v-html -- 内容已由 sanitizeHtml（DOMPurify）净化 -->
          <div
            v-if="currentArticle.content"
            v-highlight
            class="prose prose-neutral dark:prose-invert max-w-none pb-20"
            v-html="sanitizeHtml(shown && translated ? translated.content : currentArticle.content)"
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
