<script setup lang="ts">
withDefaults(
  defineProps<{
    open?: boolean
    title?: string
    message?: string
    confirmText?: string
    variant?: 'danger' | 'default'
  }>(),
  {
    open: false,
    title: '确认操作',
    message: '',
    confirmText: '删除',
    variant: 'danger'
  }
)

const emit = defineEmits<{
  confirm: []
  'update:open': [value: boolean]
}>()

function close(): void {
  emit('update:open', false)
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="close">
    <div class="bg-bg-secondary rounded-xl shadow-lg w-80 p-6">
      <h2 class="text-lg font-semibold text-text-primary mb-2">{{ title }}</h2>
      <p class="text-sm text-text-secondary mb-6">{{ message }}</p>
      <div class="flex justify-end gap-2">
        <button class="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-bg-tertiary transition-colors"
          @click="close">
          取消
        </button>
        <button class="px-4 py-2 rounded-lg text-sm text-white transition-colors"
          :class="variant === 'danger' ? 'bg-red-500 hover:bg-red-600' : 'bg-accent hover:bg-accent/90'"
          @click="emit('confirm')">
          {{ confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>
