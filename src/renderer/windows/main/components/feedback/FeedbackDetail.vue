<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Copy } from '@lucide/vue'
import type { FeedbackCategoryOption, MyFeedbackItem } from '@shared/types/feedback'
import { Button } from '@renderer/shared/components/ui/button'
import { feedbackStatusMeta } from '@renderer/windows/main/components/feedback/statusMeta'
import { dayjs } from '@renderer/windows/main/utils/dayjs'

const props = defineProps<{
  item: MyFeedbackItem
  categories: FeedbackCategoryOption[]
}>()

const copied = ref(false)

const status = computed(() => feedbackStatusMeta[props.item.status])

const categoryLabel = computed(
  () => props.categories.find((c) => c.value === props.item.category)?.label || props.item.category
)

function dateText(iso: string): string {
  const d = dayjs(iso)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : iso
}

async function copyId(): Promise<void> {
  await window.api.clipboard.writeText(props.item.id)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <div class="min-h-0 overflow-y-auto rounded-lg border border-border p-5">
    <div class="flex flex-wrap items-center gap-3">
      <span class="flex items-center gap-1.5 text-sm" :class="status.text">
        <span class="size-2 rounded-full" :class="status.dot" />
        {{ status.label }}
      </span>
      <span v-if="item.fixed_version" class="text-xs text-muted-foreground">
        修复于 {{ item.fixed_version }}
      </span>
      <span class="ml-auto text-xs text-muted-foreground">{{ dateText(item.created_at) }}</span>
    </div>

    <p class="mt-4 text-sm leading-6 whitespace-pre-wrap break-words">{{ item.content }}</p>

    <div v-if="item.reply" class="mt-4 rounded-md bg-muted/60 p-3">
      <p class="text-xs font-medium text-muted-foreground">官方回复</p>
      <p class="mt-1 text-sm leading-6 whitespace-pre-wrap break-words">{{ item.reply }}</p>
    </div>

    <div v-else-if="item.reject_reason" class="mt-4 rounded-md bg-muted/60 p-3">
      <p class="text-xs font-medium text-muted-foreground">驳回原因</p>
      <p class="mt-1 text-sm leading-6 whitespace-pre-wrap break-words">{{ item.reject_reason }}</p>
    </div>

    <div class="mt-5 grid gap-2 border-t border-border pt-4 text-sm">
      <div class="flex justify-between">
        <span class="text-muted-foreground">类别</span>
        <span>{{ categoryLabel }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">最近更新</span>
        <span>{{ dateText(item.updated_at) }}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-muted-foreground">凭证号</span>
        <span class="flex items-center gap-1.5">
          <code class="text-xs">{{ item.id }}</code>
          <Button
            variant="ghost"
            size="icon"
            class="size-6 text-muted-foreground hover:text-foreground"
            :title="copied ? '已复制' : '复制凭证号'"
            @click="copyId"
          >
            <Check v-if="copied" class="size-3.5 text-green-600" />
            <Copy v-else class="size-3.5" />
          </Button>
        </span>
      </div>
    </div>
  </div>
</template>
