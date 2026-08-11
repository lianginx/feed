<script setup lang="ts">
import { watch } from 'vue'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { buttonVariants } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

const props = withDefaults(
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
  cancel: []
  'update:open': [value: boolean]
}>()

// 取消 / 遮罩 / Esc 关闭时发出 cancel，供父级以 false 解决确认
watch(
  () => props.open,
  (val) => {
    if (!val) emit('cancel')
  }
)

function close(): void {
  emit('update:open', false)
}

function handleConfirm(): void {
  emit('confirm')
}
</script>

<template>
  <AlertDialog :open="open" @update:open="emit('update:open', $event)">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ title }}</AlertDialogTitle>
        <AlertDialogDescription v-if="message">{{ message }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="close">取消</AlertDialogCancel>
        <AlertDialogAction
          :class="
            cn(
              buttonVariants(),
              variant === 'danger'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : ''
            )
          "
          @click="handleConfirm"
        >
          {{ confirmText }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
