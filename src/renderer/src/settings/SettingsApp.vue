<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Upload, Download, CheckCircle2, Settings, Database } from '@lucide/vue'
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

const { theme, updateInterval, setTheme, setUpdateInterval, loadSettings } = useApp()
const { autoCheckUpdate, updateCheckInterval, setAutoCheckUpdate, setUpdateCheckInterval } =
  useApp()

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

const updateCheckOptions = [
  { value: 360, label: '6 小时' },
  { value: 720, label: '12 小时' },
  { value: 1440, label: '24 小时' }
]

// ---------- OPML 导入导出 ----------
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

// ---------- 左侧导航 ----------
const activeSection = ref<'general' | 'data'>('general')

const navItems = [
  { id: 'general', label: '常规', icon: Settings },
  { id: 'data', label: '数据', icon: Database }
] as const

onMounted(async () => {
  await loadSettings()
})
</script>

<template>
  <div class="relative flex h-screen overflow-hidden bg-background text-foreground">
    <!-- 顶部可拖拽区域（macOS hiddenInset 透明标题栏需要它才能拖动窗口） -->
    <div class="absolute inset-x-0 top-0 z-10 h-8 shrink-0" style="-webkit-app-region: drag"></div>
    <!-- 左侧导航 -->
    <nav class="flex w-44 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-2 pt-8">
      <div class="space-y-1">
        <button
          v-for="item in navItems"
          :key="item.id"
          type="button"
          class="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors"
          :class="
            activeSection === item.id
              ? 'bg-sidebar-primary text-sidebar-primary-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
          "
          @click="activeSection = item.id"
        >
          <component :is="item.icon" class="size-4 shrink-0" />
          <span>{{ item.label }}</span>
        </button>
      </div>
    </nav>

    <!-- 内容区 -->
    <main class="min-w-0 flex-1 overflow-y-auto px-8 pt-8 pb-6">
      <div v-if="activeSection === 'general'">
        <!-- 外观 -->
        <section>
          <h2 class="text-sm font-medium text-foreground">外观</h2>
          <div class="mt-1 divide-y divide-border">
            <div class="flex items-center justify-between gap-6 py-3">
              <span class="text-sm">主题</span>
              <div class="w-44 shrink-0">
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
            </div>
          </div>
        </section>

        <!-- 内容 -->
        <section class="mt-8">
          <h2 class="text-sm font-medium text-foreground">内容</h2>
          <div class="mt-1 divide-y divide-border">
            <div class="flex items-center justify-between gap-6 py-3">
              <div class="min-w-0">
                <div class="text-sm">自动刷新</div>
                <div class="mt-0.5 text-xs text-muted-foreground">
                  按设定间隔自动拉取订阅源最新内容
                </div>
              </div>
              <div class="w-44 shrink-0">
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
            </div>
            <div class="flex items-center justify-between gap-6 py-3">
              <div class="min-w-0">
                <div class="text-sm">自动检查更新</div>
                <div class="mt-0.5 text-xs text-muted-foreground">有新版本时自动下载并提示安装</div>
              </div>
              <Switch
                :model-value="autoCheckUpdate"
                @update:model-value="(v) => setAutoCheckUpdate(!!v)"
              />
            </div>
            <div class="flex items-center justify-between gap-6 py-3">
              <span class="text-sm">检查间隔</span>
              <div class="w-44 shrink-0">
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
            </div>
          </div>
        </section>
      </div>

      <div v-else>
        <section>
          <h2 class="text-sm font-medium text-foreground">数据</h2>
          <div class="mt-1 divide-y divide-border">
            <div class="flex items-center justify-between gap-6 py-3">
              <div class="min-w-0">
                <div class="text-sm">OPML 导入导出</div>
                <div class="mt-0.5 text-xs text-muted-foreground">用标准 OPML 格式迁移订阅列表</div>
              </div>
              <div class="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" :disabled="importing" @click="handleImportOpml">
                  <Spinner v-if="importing" />
                  <Upload v-else class="size-3.5" />
                  {{ importing ? '导入中…' : '导入' }}
                </Button>
                <Button variant="outline" size="sm" :disabled="exporting" @click="handleExportOpml">
                  <Spinner v-if="exporting" />
                  <Download v-else class="size-3.5" />
                  {{ exporting ? '导出中…' : '导出' }}
                </Button>
              </div>
            </div>
          </div>
          <div
            v-if="importResult"
            class="mt-4 flex cursor-pointer items-center gap-1 rounded-lg bg-primary/5 px-3 py-1.5 text-xs text-primary"
            @click="importResult = null"
          >
            <CheckCircle2 class="size-3" />
            {{ importResult }}
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
