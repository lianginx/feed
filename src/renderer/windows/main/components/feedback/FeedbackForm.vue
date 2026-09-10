<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { ChevronDown, Inbox } from '@lucide/vue'
import type { FeedbackCategoryOption } from '@shared/types/feedback'
import { Button } from '@renderer/shared/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/shared/components/ui/collapsible'
import { DialogFooter } from '@renderer/shared/components/ui/dialog'
import { Input } from '@renderer/shared/components/ui/input'
import { Label } from '@renderer/shared/components/ui/label'
import { ScrollArea } from '@renderer/shared/components/ui/scroll-area'
import { Textarea } from '@renderer/shared/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/shared/components/ui/select'
import { Spinner } from '@renderer/shared/components/ui/spinner'
import { useFeedbackDialog } from '@renderer/windows/main/composables/useFeedbackDialog'

const CONTENT_MIN = 10
const CONTENT_MAX = 2000
const CONTACT_MAX = 200

defineProps<{ categories: FeedbackCategoryOption[] }>()
const emit = defineEmits<{ openMine: [] }>()

const { show, close, category, content, contact } = useFeedbackDialog()

const CONTEXT_ITEMS: { key: string; label: string }[] = [
  { key: 'app_version', label: '应用版本' },
  { key: 'platform', label: '平台' },
  { key: 'os_version', label: '系统版本' },
  { key: 'device', label: '设备型号' },
  { key: 'arch', label: 'CPU 架构' },
  { key: 'install_id', label: '匿名标识' }
]

const categoryError = ref('')
const contentError = ref('')
const submitError = ref('')
const submitting = ref(false)
const context = ref<Record<string, string>>({})

const contentLength = computed(() => [...content.value.trim()].length)

const visibleContextItems = computed(() =>
  CONTEXT_ITEMS.filter((item) => context.value[item.key]).map((item) => ({
    ...item,
    value: context.value[item.key]
  }))
)

async function loadContext(): Promise<void> {
  try {
    const res = await window.api.feedback.context()
    context.value = res.success && res.data ? res.data : {}
  } catch {
    context.value = {}
  }
}

watch(
  show,
  (val) => {
    if (val) {
      categoryError.value = ''
      contentError.value = ''
      submitError.value = ''
      submitting.value = false
      void loadContext()
    }
  },
  { immediate: true }
)

watch(category, () => {
  categoryError.value = ''
})

watch(content, () => {
  contentError.value = ''
})

async function handleSubmit(): Promise<void> {
  if (submitting.value) return
  categoryError.value = category.value ? '' : '请选择反馈类别'
  contentError.value = contentLength.value >= CONTENT_MIN ? '' : `请至少填写 ${CONTENT_MIN} 个字符`
  if (categoryError.value || contentError.value) return
  submitError.value = ''
  submitting.value = true
  const res = await window.api.feedback.submit({
    category: category.value,
    content: content.value.trim(),
    contact: contact.value.trim() || undefined
  })
  submitting.value = false
  if (!res.success) {
    submitError.value = res.error || '提交失败，请稍后重试'
    return
  }
  close()
  toast.success(res.data ? `已提交，感谢反馈！凭证号 ${res.data.id}` : '已提交，感谢反馈')
}
</script>

<template>
  <ScrollArea class="min-h-0" hide-scrollbar>
    <div class="grid gap-4">
      <div class="grid gap-1.5">
        <Label for="feedback-category">类别</Label>
        <Select v-model="category">
          <SelectTrigger id="feedback-category" class="w-full">
            <SelectValue placeholder="选择类别" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="c in categories" :key="c.value" :value="c.value">
              {{ c.label }}
            </SelectItem>
          </SelectContent>
        </Select>
        <p v-if="categoryError" class="text-xs text-destructive">{{ categoryError }}</p>
      </div>

      <div class="grid gap-1.5">
        <div class="flex items-center justify-between">
          <Label for="feedback-content">问题描述</Label>
          <span class="text-xs text-muted-foreground tabular-nums">
            {{ contentLength }}/{{ CONTENT_MAX }}
          </span>
        </div>
        <Textarea
          id="feedback-content"
          v-model="content"
          :maxlength="CONTENT_MAX"
          class="min-h-40 resize-none"
          placeholder="请描述你遇到的问题、发生场景、期望结果，或希望改进的地方。"
        />
        <p v-if="contentError" class="text-xs text-destructive">{{ contentError }}</p>
      </div>

      <div class="grid gap-1.5">
        <Label for="feedback-contact">联系方式</Label>
        <Input
          id="feedback-contact"
          v-model="contact"
          :maxlength="CONTACT_MAX"
          type="text"
          placeholder="邮箱等（选填），便于回复进展"
        />
      </div>

      <div
        v-if="visibleContextItems.length > 0"
        class="overflow-hidden rounded-md border border-border"
      >
        <Collapsible default-open>
          <CollapsibleTrigger as-child>
            <button
              class="group flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <span>提交时自动附带以下系统信息</span>
              <ChevronDown
                class="size-3.5 transition-transform group-data-[state=open]:rotate-180"
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div class="grid gap-1.5 border-t border-border bg-muted/40 px-3 py-2.5">
              <div
                v-for="item in visibleContextItems"
                :key="item.key"
                class="flex items-center justify-between gap-4 text-xs"
              >
                <span class="shrink-0 text-muted-foreground">{{ item.label }}</span>
                <code class="truncate font-mono text-muted-foreground">{{ item.value }}</code>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  </ScrollArea>

  <p v-if="submitError" class="mt-2 text-sm text-destructive">{{ submitError }}</p>

  <DialogFooter class="mt-2">
    <Button variant="outline" class="mr-auto" @click="emit('openMine')">
      <Inbox class="mr-1.5 size-4" />
      我的反馈
    </Button>
    <Button variant="ghost" :disabled="submitting" @click="close">取消</Button>
    <Button :disabled="submitting" @click="handleSubmit">
      <Spinner v-if="submitting" class="mr-1 size-4" />
      {{ submitting ? '提交中…' : '提交反馈' }}
    </Button>
  </DialogFooter>
</template>
