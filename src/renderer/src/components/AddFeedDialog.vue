<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { useFeeds } from '../composables/useFeeds'

const { addFeed } = useFeeds()

const props = withDefaults(
  defineProps<{
    open?: boolean
  }>(),
  { open: false }
)

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const url = ref('')
const title = ref('')
const error = ref('')
const submitting = ref(false)

watch(
  () => props.open,
  (val) => {
    if (val) {
      url.value = ''
      title.value = ''
      error.value = ''
    }
  }
)

function close(): void {
  emit('update:open', false)
}

async function handleSubmit(): Promise<void> {
  if (!url.value.trim()) {
    error.value = '请输入订阅源地址'
    return
  }

  error.value = ''
  submitting.value = true
  const result = await addFeed(url.value.trim(), title.value.trim() || undefined)
  submitting.value = false
  if (result !== false) {
    close()
  } else {
    error.value = '添加失败，请检查地址是否正确'
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[384px]">
      <DialogHeader>
        <DialogTitle>添加订阅源</DialogTitle>
      </DialogHeader>

      <div class="grid gap-4 py-2">
        <div class="grid gap-2">
          <Label for="url">RSS 地址 *</Label>
          <Input
            id="url"
            v-model="url"
            type="url"
            placeholder="https://example.com/feed.xml"
            @keyup.enter="handleSubmit"
          />
        </div>
        <div class="grid gap-2">
          <Label for="title">标题（可选）</Label>
          <Input id="title" v-model="title" type="text" placeholder="自动获取" />
        </div>
        <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="close">取消</Button>
        <Button :disabled="submitting" @click="handleSubmit">
          <Spinner v-if="submitting" />
          {{ submitting ? '添加中…' : '添加' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
