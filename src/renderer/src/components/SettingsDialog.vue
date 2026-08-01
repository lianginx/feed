<script setup lang="ts">
import { ref } from 'vue'
import { Upload, Download, CheckCircle2 } from '@lucide/vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useApp, type Theme } from '../composables/useApp'
import { useFeeds } from '../composables/useFeeds'

withDefaults(
  defineProps<{
    open?: boolean
  }>(),
  { open: false }
)

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { loadFeeds } = useFeeds()

const importResult = ref<string | null>(null)
const importing = ref(false)

async function handleImportOpml(): Promise<void> {
  importResult.value = null
  importing.value = true
  try {
    const result = await window.api.opml.import()
    if (result.success && result.data) {
      if ('canceled' in result.data && result.data.canceled) {
        return
      }
      if ('added' in result.data) {
        importResult.value = `导入完成：新增 ${result.data.added} 个，跳过 ${result.data.skipped} 个`
        await loadFeeds()
      }
    } else {
      importResult.value = `导入失败：${result.error || '未知错误'}`
    }
  } finally {
    importing.value = false
  }
}

const exporting = ref(false)

async function handleExportOpml(): Promise<void> {
  exporting.value = true
  try {
    const result = await window.api.opml.export()
    if (result.success && result.data) {
      if ('canceled' in result.data && result.data.canceled) {
        return
      }
      if ('filePath' in result.data) {
        importResult.value = `已导出到：${result.data.filePath}`
      }
    } else {
      importResult.value = `导出失败：${result.error || '未知错误'}`
    }
  } finally {
    exporting.value = false
  }
}

const { theme, updateInterval, setTheme, setUpdateInterval } = useApp()

const themes: { value: Theme; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' }
]

const intervalOptions = [
  { value: 15, label: '15 分钟' },
  { value: 30, label: '30 分钟' },
  { value: 60, label: '1 小时' },
  { value: 120, label: '2 小时' },
  { value: 0, label: '不自动刷新' }
]

const { autoCheckUpdate, updateCheckInterval, setAutoCheckUpdate, setUpdateCheckInterval } =
  useApp()

const updateCheckOptions = [
  { value: 360, label: '6 小时' },
  { value: 720, label: '12 小时' },
  { value: 1440, label: '24 小时' }
]

function close(): void {
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-120 max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>设置</DialogTitle>
      </DialogHeader>

      <div class="grid gap-6 py-2">
        <!-- 主题 -->
        <div class="grid gap-2">
          <label
            class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >主题</label
          >
          <Select :model-value="theme" @update:model-value="(v) => setTheme(v as Theme)">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="t in themes" :key="t.value" :value="t.value">
                {{ t.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- 刷新间隔 -->
        <div class="grid gap-2">
          <label
            class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >自动刷新</label
          >
          <Select
            :model-value="String(updateInterval)"
            @update:model-value="(v) => setUpdateInterval(Number(v))"
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="opt in intervalOptions"
                :key="opt.value"
                :value="String(opt.value)"
              >
                {{ opt.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- 自动检查更新 -->
        <div class="grid gap-2">
          <div class="flex items-center justify-between">
            <label
              class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >自动检查更新</label
            >
            <Switch
              :model-value="autoCheckUpdate"
              @update:model-value="(v) => setAutoCheckUpdate(!!v)"
            />
          </div>
          <Select
            :model-value="String(updateCheckInterval)"
            :disabled="!autoCheckUpdate"
            @update:model-value="(v) => setUpdateCheckInterval(Number(v))"
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="opt in updateCheckOptions"
                :key="opt.value"
                :value="String(opt.value)"
              >
                {{ opt.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- OPML 导入导出 -->
        <div class="grid gap-2">
          <label
            class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >OPML</label
          >
          <div class="flex gap-2">
            <Button
              variant="outline"
              class="flex-1"
              :disabled="importing"
              @click="handleImportOpml"
            >
              <Spinner v-if="importing" />
              <Upload v-else />
              {{ importing ? '导入中…' : '导入' }}
            </Button>
            <Button
              variant="outline"
              class="flex-1"
              :disabled="exporting"
              @click="handleExportOpml"
            >
              <Spinner v-if="exporting" />
              <Download v-else />
              {{ exporting ? '导出中…' : '导出' }}
            </Button>
          </div>
          <div
            v-if="importResult"
            class="mt-1 px-3 py-1.5 rounded-lg text-xs text-primary bg-primary/5 flex items-center gap-1 cursor-pointer"
            @click="importResult = null"
          >
            <CheckCircle2 class="w-3 h-3" />
            {{ importResult }}
          </div>
        </div>
      </div>

      <div class="flex justify-end">
        <Button variant="outline" @click="close">关闭</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
