<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[320px]">
      <DialogHeader>
        <DialogTitle>{{ isEditing() ? '编辑分类' : '添加分类' }}</DialogTitle>
      </DialogHeader>

      <div class="grid gap-2">
        <Label for="category-name">分类名称</Label>
        <Input
          id="category-name"
          v-model="name"
          type="text"
          placeholder="分类名称"
          @keyup.enter="handleSubmit"
        />
        <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="close">取消</Button>
        <Button @click="handleSubmit">{{ isEditing() ? '保存' : '添加' }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
