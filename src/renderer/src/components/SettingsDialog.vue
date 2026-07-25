<script setup lang="ts">
import { ref } from 'vue'
import { Upload, Download, CheckCircle2 } from '@lucide/vue'
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
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="close">
    <div class="bg-bg-secondary rounded-xl shadow-lg w-[28rem] p-6 max-h-[90vh] overflow-y-overlay">
      <h2 class="text-lg font-semibold text-text-primary mb-4">设置</h2>

      <div class="space-y-5">
        <!-- 主题 -->
        <div>
          <label class="text-sm text-text-secondary mb-2 block">主题</label>
          <div class="flex gap-2">
            <button v-for="t in themes" :key="t.value" class="px-3 py-1.5 rounded-lg text-sm transition-colors" :class="theme === t.value
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary/80'
              " @click="setTheme(t.value)">
              {{ t.label }}
            </button>
          </div>
        </div>

        <!-- 刷新间隔 -->
        <div>
          <label class="text-sm text-text-secondary mb-2 block">自动刷新</label>
          <select :value="updateInterval"
            class="w-full px-3 py-1.5 rounded-lg text-sm bg-bg-tertiary text-text-primary border border-border focus:outline-none"
            @change="setUpdateInterval(Number(($event.target as HTMLSelectElement).value))">
            <option v-for="opt in intervalOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <!-- 快捷键开关 -->
        <div class="flex items-center justify-between">
          <label class="text-sm text-text-secondary">启用快捷键</label>
          <button class="w-10 h-5 rounded-full transition-colors relative"
            :class="shortcutsEnabled ? 'bg-accent' : 'bg-bg-tertiary'" @click="setShortcutsEnabled(!shortcutsEnabled)">
            <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
              :class="shortcutsEnabled ? 'translate-x-5' : 'translate-x-0.5'" />
          </button>
        </div>

        <!-- 快捷键列表 -->
        <div v-if="shortcutsEnabled">
          <label class="text-sm text-text-secondary mb-2 block">快捷键</label>
          <div class="space-y-1 text-sm">
            <div class="flex justify-between">
              <span class="text-text-secondary">下移 / 上移</span>
              <span class="text-text-tertiary font-mono">↓ / ↑</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-secondary">打开文章</span>
              <span class="text-text-tertiary font-mono">Enter</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-secondary">返回列表</span>
              <span class="text-text-tertiary font-mono">Esc</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-secondary">切换星标</span>
              <span class="text-text-tertiary font-mono">⌘B</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-secondary">刷新</span>
              <span class="text-text-tertiary font-mono">⌘R</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-secondary">全部标为已读</span>
              <span class="text-text-tertiary font-mono">⌘⇧A</span>
            </div>
          </div>
        </div>

        <!-- 字体大小 -->
        <div>
          <label class="text-sm text-text-secondary mb-2 block">字体大小：{{ fontSize }}px</label>
          <input :value="fontSize" type="range" min="12" max="24" class="w-full accent-accent"
            @input="setFontSize(Number(($event.target as HTMLInputElement).value))" />
        </div>
      </div>

      <!-- OPML 导入导出 -->
      <div>
        <label class="text-sm text-text-secondary mb-2 block">OPML</label>
        <div class="flex gap-2">
          <button
            class="flex-1 px-3 py-2 rounded-lg text-sm bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary/80 transition-colors flex items-center justify-center gap-2"
            @click="handleImportOpml">
            <Upload class="w-4 h-4" />
            导入
          </button>
          <button
            class="flex-1 px-3 py-2 rounded-lg text-sm bg-bg-tertiary text-text-secondary hover:bg-bg-tertiary/80 transition-colors flex items-center justify-center gap-2"
            @click="handleExportOpml">
            <Download class="w-4 h-4" />
            导出
          </button>
        </div>
        <div v-if="importResult"
          class="mt-2 px-3 py-1.5 rounded-lg text-xs text-accent bg-accent/5 flex items-center gap-1"
          @click="importResult = null">
          <CheckCircle2 class="w-3 h-3" />
          {{ importResult }}
        </div>
      </div>

      <div class="flex justify-end mt-6">
        <button class="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-bg-tertiary transition-colors"
          @click="close">
          关闭
        </button>
      </div>
    </div>
  </div>
</template>
