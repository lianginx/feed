<script setup lang="ts">
import { ref } from 'vue'
import { Check, Copy, Plus, RefreshCw } from '@lucide/vue'
import type { MyFeedbackItem } from '@shared/types/feedback'
import { Button } from '@renderer/shared/components/ui/button'
import { Spinner } from '@renderer/shared/components/ui/spinner'
import { feedbackStatusMeta } from '@renderer/windows/main/components/feedback/statusMeta'
import { formatRelativeDay } from '@renderer/windows/main/utils/dayjs'

defineProps<{
  items: MyFeedbackItem[]
  loading: boolean
  error: string
}>()

const emit = defineEmits<{ refresh: []; create: []; select: [item: MyFeedbackItem] }>()

const copiedId = ref('')

function timeText(iso: string): string {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? '' : formatRelativeDay(t / 1000)
}

function detailLine(item: MyFeedbackItem): string {
  if (item.reply) return `回复：${item.reply}`
  if (item.reject_reason) return `原因：${item.reject_reason}`
  if (item.fixed_version) return `修复于 ${item.fixed_version}`
  return ''
}

async function copyId(id: string): Promise<void> {
  await window.api.clipboard.writeText(id)
  copiedId.value = id
  setTimeout(() => {
    if (copiedId.value === id) copiedId.value = ''
  }, 1500)
}
</script>

<template>
  <div class="flex min-h-0 flex-col overflow-y-auto rounded-lg border border-border">
    <div
      class="sticky top-0 z-10 grid shrink-0 grid-cols-[4.5rem_1fr_10rem_2rem] items-center gap-3 border-b border-border bg-card px-4 py-2 text-xs text-muted-foreground"
    >
      <span>状态</span>
      <span>问题描述</span>
      <span>ID</span>
      <span />
    </div>

    <div v-if="loading && items.length === 0" class="flex flex-1 items-center justify-center">
      <Spinner class="size-5 text-muted-foreground" />
    </div>

    <p
      v-else-if="error"
      class="flex flex-1 items-center justify-center px-4 text-sm text-destructive"
    >
      {{ error }}
    </p>

    <p
      v-else-if="items.length === 0"
      class="flex flex-1 items-center justify-center px-4 text-sm text-muted-foreground"
    >
      还没有提交过反馈
    </p>

    <template v-else>
      <div
        v-for="item in items"
        :key="item.id"
        class="grid shrink-0 cursor-pointer grid-cols-[4.5rem_1fr_10rem_2rem] items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/50"
        @click="emit('select', item)"
      >
        <span
          class="flex items-center gap-1.5 text-sm"
          :class="feedbackStatusMeta[item.status].text"
        >
          <span
            class="size-1.5 shrink-0 rounded-full"
            :class="feedbackStatusMeta[item.status].dot"
          />
          {{ feedbackStatusMeta[item.status].label }}
        </span>

        <div class="min-w-0">
          <p class="truncate text-sm text-foreground">{{ item.content }}</p>
          <p class="truncate text-xs text-muted-foreground">
            {{ timeText(item.created_at) }}
            <span v-if="detailLine(item)" class="ml-2">{{ detailLine(item) }}</span>
          </p>
        </div>

        <code class="truncate text-xs text-muted-foreground">{{ item.id }}</code>

        <Button
          variant="ghost"
          size="icon"
          class="size-7 text-muted-foreground hover:text-foreground"
          :title="copiedId === item.id ? '已复制' : '复制 ID'"
          @click.stop="copyId(item.id)"
        >
          <Check v-if="copiedId === item.id" class="size-4 text-green-600" />
          <Copy v-else class="size-4" />
        </Button>
      </div>
    </template>
  </div>

  <div class="mt-2 flex items-center">
    <Button
      variant="ghost"
      size="icon"
      :disabled="loading"
      title="刷新"
      class="mr-auto"
      @click="emit('refresh')"
    >
      <RefreshCw class="size-4" :class="loading ? 'animate-spin' : ''" />
    </Button>
    <Button @click="emit('create')">
      <Plus class="mr-1.5 size-4" />
      新建反馈
    </Button>
  </div>
</template>
