<script setup lang="ts">
import { computed } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useUpdateDialog } from '../composables/useUpdateDialog'
import { sanitizeHtml } from '../utils/sanitize'

const { show, mode, info, percent, close, startDownload, install, openReleasePage } =
  useUpdateDialog()

const isMac = window.api.system.platform === 'darwin'

/** 下载进行中（准备中/下载中）：弹窗暂不可关闭，只能等待 */
const busy = computed(() => mode.value === 'preparing' || mode.value === 'downloading')

const hasNotes = computed(() => info.value.releaseNotes.trim().length > 0)

/**
 * releaseNotes 来自 GitHub Atom 源，是已渲染好的 HTML（非 markdown），
 * 直接经 sanitizeHtml（DOMPurify）净化后渲染即可。
 * 更新日志比 RSS 内容可信度更高，但仍收紧白名单：禁用音视频、图片与内联样式。
 */
const renderedNotes = computed(() => {
  const notes = info.value.releaseNotes
  if (!notes.trim()) return ''
  return sanitizeHtml(notes, { media: false, images: false, style: false })
})

const title = computed(() => {
  switch (mode.value) {
    case 'preparing':
      return '正在准备下载'
    case 'downloading':
      return '正在下载更新'
    case 'downloaded':
      return '更新已就绪'
    case 'uptodate':
      return '更新'
    default:
      return '发现新版本'
  }
})

const description = computed(() => {
  switch (mode.value) {
    case 'uptodate':
      return `当前已是最新版本 v${info.value.currentVersion}。`
    case 'preparing':
      return `正在准备下载 v${info.value.newVersion}…`
    case 'downloading':
      return `正在下载 v${info.value.newVersion}（${percent.value}%）`
    case 'downloaded':
      return `v${info.value.newVersion} 已下载完成，可以立即安装。`
    default:
      return `发现新版本 v${info.value.newVersion}，当前版本为 v${info.value.currentVersion}。`
  }
})

const installText = computed(() => (isMac ? '退出并打开安装包' : '重启安装'))
</script>

<template>
  <Dialog
    :open="show"
    @update:open="
      (v) => {
        if (!v && !busy) close()
      }
    "
  >
    <DialogContent :hide-close="busy" class="sm:max-w-120">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>

      <!-- 更新日志（GitHub Atom 源返回 HTML，已由 sanitizeHtml（DOMPurify）净化） -->
      <!-- eslint-disable vue/no-v-html -- 内容已由 sanitizeHtml（DOMPurify）净化 -->
      <div
        v-if="hasNotes && mode !== 'uptodate'"
        v-highlight
        class="release-notes max-h-75 overflow-y-auto rounded-md border bg-muted/40 p-3 prose prose-sm prose-neutral max-w-none dark:prose-invert"
        v-html="renderedNotes"
      />
      <!-- eslint-enable vue/no-v-html -->

      <DialogFooter>
        <!-- 发现新版本：取消 / 打开下载页 / 下载并安装 -->
        <template v-if="mode === 'available'">
          <Button variant="outline" @click="close">取消</Button>
          <Button variant="outline" @click="openReleasePage">打开下载页</Button>
          <Button @click="startDownload">下载并安装</Button>
        </template>

        <!-- 准备中：点击后立即反馈（下载不可取消，弹窗暂不可关闭） -->
        <template v-else-if="mode === 'preparing'">
          <Button variant="outline" @click="openReleasePage">打开下载页</Button>
          <Button class="relative min-w-28 overflow-hidden disabled:opacity-100" disabled>
            <span class="relative z-10 inline-flex items-center gap-2">
              <Spinner class="size-4" />
              准备中…
            </span>
            <span class="absolute inset-y-0 left-0 bg-white/25" style="width: 0%" />
          </Button>
        </template>

        <!-- 下载中：主按钮禁用并内嵌进度条 + 百分比 -->
        <template v-else-if="mode === 'downloading'">
          <Button variant="outline" @click="openReleasePage">打开下载页</Button>
          <Button class="relative min-w-28 overflow-hidden disabled:opacity-100" disabled>
            <span class="relative z-10 inline-flex items-center gap-2">
              <Spinner class="size-4" />
              {{ percent }}%
            </span>
            <span
              class="absolute inset-y-0 left-0 bg-white/25 transition-[width] duration-200 ease-out"
              :style="{ width: `${percent}%` }"
            />
          </Button>
        </template>

        <!-- 下载完成：取消 / 打开下载页 / 退出并安装 -->
        <template v-else-if="mode === 'downloaded'">
          <Button variant="outline" @click="close">取消</Button>
          <Button variant="outline" @click="openReleasePage">打开下载页</Button>
          <Button @click="install">{{ installText }}</Button>
        </template>

        <!-- 已是最新：取消 / 打开下载页 -->
        <template v-else>
          <Button variant="outline" @click="close">取消</Button>
          <Button @click="openReleasePage">打开下载页</Button>
        </template>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
/*
 * 更新日志卡片紧凑排版：prose 默认按文章阅读设计（标题约 2em、列表间距宽），
 * 放在 480px 弹窗内嵌卡片里过大，这里仅在弹窗范围内覆盖尺度，不影响全局。
 *
 * 关键：:deep() 必须放在「子节点」位置（.release-notes :deep(...)），
 * 编译成 .release-notes[data-v-x] ...，scope id 落在 release-notes 元素自身。
 * 若写成 :deep(.release-notes ...)（deep 在开头），编译为 [data-v-x] .release-notes ...，
 * 要求「祖先」带 scope id——而 DialogContent 经 Teleport 到 body，其根不带父级 scope id，
 * 导致选择器完全匹配不到、覆盖不生效。
 * 只调尺度与间距，颜色沿用主题（浅色正文 / dark:prose-invert）。
 */
.release-notes {
  font-size: 0.8125rem; /* 13px，比弹窗正文 text-sm 更紧凑 */
  line-height: 1.55;
}

/* 标题：降为接近正文的小标题，去掉大号与宽间距 */
.release-notes :deep(:is(h1, h2, h3, h4, h5, h6)) {
  margin-top: 0.75rem;
  margin-bottom: 0.25rem;
  font-size: 0.875rem; /* 14px */
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0;
}

.release-notes :deep(:is(h1, h2, h3):first-child) {
  margin-top: 0;
}

/* 段落 / 列表 / 代码块 / 引用 / 表格：收紧上下留白 */
.release-notes :deep(:is(p, ul, ol, pre, blockquote, table)) {
  margin-top: 0.375rem;
  margin-bottom: 0.375rem;
}

.release-notes :deep(:is(p, ul, ol, blockquote):first-child) {
  margin-top: 0;
}

.release-notes :deep(:is(ul, ol)) {
  padding-left: 1.125rem;
}

.release-notes :deep(li) {
  margin: 0.125rem 0;
  padding-left: 0;
}

.release-notes :deep(li p) {
  margin: 0;
}

.release-notes :deep(:is(ul, ol) :is(ul, ol)) {
  margin-top: 0.125rem;
  margin-bottom: 0.125rem;
}

/* 行内代码 / 代码块：微缩以适配卡片 */
.release-notes :deep(code) {
  font-size: 0.8em;
}

.release-notes :deep(pre) {
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  line-height: 1.5;
}

.release-notes :deep(pre code) {
  padding: 0;
  font-size: inherit;
  line-height: inherit;
}

.release-notes :deep(hr) {
  margin: 0.5rem 0;
}

.release-notes :deep(blockquote) {
  padding-left: 0.75rem;
  font-style: normal;
}

.release-notes :deep(a) {
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
