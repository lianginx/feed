<script setup lang="ts">
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
        <AlertDialogAction :class="cn(
          buttonVariants(),
          variant === 'danger' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''
        )" @click="handleConfirm">
          {{ confirmText }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
