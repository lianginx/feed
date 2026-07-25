<script setup lang="ts">
import { ref, watch } from 'vue'
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
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="close">
    <div class="bg-bg-secondary rounded-xl shadow-lg w-96 p-6">
      <h2 class="text-lg font-semibold text-text-primary mb-4">添加订阅源</h2>

      <div class="space-y-3">
        <div>
          <label class="text-sm text-text-secondary mb-1 block">RSS 地址 *</label>
          <input v-model="url" type="url" placeholder="https://example.com/feed.xml"
            class="w-full px-3 py-2 rounded-lg border border-border bg-bg-primary text-text-primary text-sm focus:outline-none"
            @keyup.enter="handleSubmit" />
        </div>
        <div>
          <label class="text-sm text-text-secondary mb-1 block">标题（可选）</label>
          <input v-model="title" type="text" placeholder="自动获取"
            class="w-full px-3 py-2 rounded-lg border border-border bg-bg-primary text-text-primary text-sm focus:outline-none" />
        </div>
        <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
      </div>

      <div class="flex justify-end gap-2 mt-6">
        <button class="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-bg-tertiary transition-colors"
          @click="close">
          取消
        </button>
        <button
          class="px-4 py-2 rounded-lg text-sm bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          :disabled="submitting" @click="handleSubmit">
          <svg v-if="submitting" class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {{ submitting ? '添加中…' : '添加' }}
        </button>
      </div>
    </div>
  </div>
</template>
