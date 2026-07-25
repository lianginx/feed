<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    open?: boolean
    editCategoryId?: number
    editCategoryName?: string
  }>(),
  { open: false, editCategoryId: undefined, editCategoryName: undefined }
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  add: [name: string]
  update: [id: number, name: string]
}>()

const name = ref('')
const error = ref('')

watch(
  () => props.open,
  (val) => {
    if (val) {
      name.value = props.editCategoryName || ''
      error.value = ''
    }
  }
)

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const isEditing = () => props.editCategoryId !== undefined

function close(): void {
  emit('update:open', false)
}

async function handleSubmit(): Promise<void> {
  if (!name.value.trim()) {
    error.value = '请输入分类名称'
    return
  }
  error.value = ''
  if (isEditing()) {
    emit('update', props.editCategoryId!, name.value.trim())
  } else {
    emit('add', name.value.trim())
  }
  close()
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="close">
    <div class="bg-bg-secondary rounded-xl shadow-lg w-80 p-6">
      <h2 class="text-lg font-semibold text-text-primary mb-4">
        {{ isEditing() ? '编辑分类' : '添加分类' }}
      </h2>

      <div>
        <input v-model="name" type="text" placeholder="分类名称"
          class="w-full px-3 py-2 rounded-lg border border-border bg-bg-primary text-text-primary text-sm focus:outline-none"
          @keyup.enter="handleSubmit" />
        <p v-if="error" class="text-red-500 text-sm mt-1">{{ error }}</p>
      </div>

      <div class="flex justify-end gap-2 mt-4">
        <button class="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-bg-tertiary transition-colors"
          @click="close">
          取消
        </button>
        <button class="px-4 py-2 rounded-lg text-sm bg-accent text-white hover:bg-accent/90 transition-colors"
          @click="handleSubmit">
          {{ isEditing() ? '保存' : '添加' }}
        </button>
      </div>
    </div>
  </div>
</template>
