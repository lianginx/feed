<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

withDefaults(
  defineProps<{
    open?: boolean
  }>(),
  { open: false }
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  choose: [choice: 'local' | 'remote']
}>()

function chooseRemote(): void {
  emit('choose', 'remote')
}

function chooseLocal(): void {
  emit('choose', 'local')
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>同步冲突</DialogTitle>
        <DialogDescription>
          本机和云端在各自都修改了订阅列表，无法自动合并。请选择以哪一方的数据为准：
        </DialogDescription>
      </DialogHeader>
      <div class="grid gap-2 pt-1">
        <Button variant="outline" class="justify-between h-auto py-2.5" @click="chooseRemote">
          <span>使用云端数据</span>
          <span class="text-xs text-muted-foreground">放弃本机本次改动</span>
        </Button>
        <Button variant="outline" class="justify-between h-auto py-2.5" @click="chooseLocal">
          <span>使用本机数据</span>
          <span class="text-xs text-muted-foreground">覆盖云端，另一台设备会再提示</span>
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
