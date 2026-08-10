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
import { useFeeds, type FeedItem } from '@/composables/useFeeds'

const { updateFeed, refreshSingleFeed } = useFeeds()

const props = withDefaults(
  defineProps<{
    open?: boolean
    feed?: FeedItem | null
  }>(),
  { open: false, feed: null }
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  saved: []
}>()

const url = ref('')
const submitting = ref(false)

watch(
  () => props.open,
  (val) => {
    if (val) {
      url.value = props.feed?.url || ''
    }
  }
)

function close(): void {
  emit('update:open', false)
}

async function handleSubmit(): Promise<void> {
  if (!props.feed) return

  const trimmed = url.value.trim()
  if (!trimmed) return

  submitting.value = true
  const result = await updateFeed(props.feed.id, { url: trimmed })
  if (result) {
    refreshSingleFeed(props.feed.id)
    emit('saved')
    close()
  }
  submitting.value = false
}
</script>

<template>
  <Dialog :open="open && feed !== null" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[384px]">
      <DialogHeader>
        <DialogTitle>编辑订阅源</DialogTitle>
      </DialogHeader>

      <div class="grid gap-4 py-2">
        <div class="grid gap-2">
          <Label for="edit-feed-url">RSS 地址</Label>
          <Input
            id="edit-feed-url"
            v-model="url"
            type="url"
            placeholder="https://example.com/feed.xml"
            @keyup.enter="handleSubmit"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="close">取消</Button>
        <Button :disabled="submitting" @click="handleSubmit">
          <Spinner v-if="submitting" />
          {{ submitting ? '保存中…' : '保存' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
