<script setup lang="ts">
import { ref } from 'vue'
import { Upload, Download, CheckCircle2 } from '@lucide/vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useApp, type Theme } from '../composables/useApp'
import { useFeeds } from '../composables/useFeeds'
import { useToast } from '../composables/useToast'

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
const { showToast } = useToast()

const importResult = ref<string | null>(null)

async function handleImportOpml(): Promise<void> {
  importResult.value = null
  const result = await window.api.opml.importFromFile()
  if (result.success && result.data) {
    if ('canceled' in result.data && result.data.canceled) {
      return
    }
    if ('added' in result.data) {
      importResult.value = `导入完成：新增 ${result.data.added} 个，跳过 ${result.data.skipped} 个`
      showToast(`导入完成，新增 ${result.data.added} 个订阅源`)
      await loadFeeds()
    }
  } else {
    importResult.value = `导入失败：${result.error || '未知错误'}`
  }
}

async function handleExportOpml(): Promise<void> {
  const result = await window.api.opml.exportToFile()
  if (result.success && result.data) {
    if ('canceled' in result.data && result.data.canceled) {
      return
    }
    if ('filePath' in result.data) {
      importResult.value = `已导出到：${result.data.filePath}`
      showToast(`已导出到 ${result.data.filePath}`)
    }
  } else {
    importResult.value = `导出失败：${result.error || '未知错误'}`
  }
}

const {
  theme,
  fontSize,
  shortcutsEnabled,
  updateInterval,
  setTheme,
  setFontSize,
  setShortcutsEnabled,
  setUpdateInterval
} = useApp()

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

function close(): void {
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
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

        <!-- 快捷键开关 -->
        <div class="flex items-center justify-between">
          <label
            class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >启用快捷键</label
          >
          <Switch :checked="shortcutsEnabled" @update:checked="setShortcutsEnabled" />
        </div>

        <!-- 快捷键列表 -->
        <div v-if="shortcutsEnabled">
          <label
            class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 block"
            >快捷键</label
          >
          <div class="space-y-1.5 text-sm">
            <div class="flex justify-between">
              <span class="text-muted-foreground">下移 / 上移</span>
              <span class="text-muted-foreground font-mono">↓ / ↑</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">打开文章</span>
              <span class="text-muted-foreground font-mono">Enter</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">返回列表</span>
              <span class="text-muted-foreground font-mono">Esc</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">切换星标</span>
              <span class="text-muted-foreground font-mono">⌘B</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">刷新</span>
              <span class="text-muted-foreground font-mono">⌘R</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">全部标为已读</span>
              <span class="text-muted-foreground font-mono">⌘⇧A</span>
            </div>
          </div>
        </div>

        <!-- 字体大小 -->
        <div class="grid gap-2">
          <label
            class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >字体大小：{{ fontSize }}px</label
          >
          <Slider
            :model-value="[fontSize]"
            :min="12"
            :max="24"
            :step="1"
            @update:model-value="(v) => setFontSize((v ?? [fontSize])[0])"
          />
        </div>

        <!-- OPML 导入导出 -->
        <div class="grid gap-2">
          <label
            class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >OPML</label
          >
          <div class="flex gap-2">
            <Button variant="outline" class="flex-1" @click="handleImportOpml">
              <Upload class="w-4 h-4 mr-2" />
              导入
            </Button>
            <Button variant="outline" class="flex-1" @click="handleExportOpml">
              <Download class="w-4 h-4 mr-2" />
              导出
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
