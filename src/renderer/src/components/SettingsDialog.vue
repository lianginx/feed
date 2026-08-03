<script setup lang="ts">
import { ref, watch } from 'vue'
import { Upload, Download, CheckCircle2, Save, Eye, EyeOff } from '@lucide/vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Spinner } from '@/components/ui/spinner'
import { Input } from '@/components/ui/input'
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
import { useSync } from '../composables/useSync'
import type { SyncConfig } from '../types'

const props = withDefaults(
  defineProps<{
    open?: boolean
  }>(),
  { open: false }
)

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { loadFeeds } = useFeeds()
const { runSync } = useSync()

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

const { theme, updateInterval, setTheme, setUpdateInterval, syncConfig, setSyncConfig } = useApp()

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

// ---------- 订阅同步配置（本地编辑态，点「保存同步设置」后写入配置） ----------
const syncProvider = ref<SyncConfig['provider']>(syncConfig.value.provider)
const syncTokenInput = ref(syncConfig.value.token ?? '')
const syncWebdavUrlInput = ref(syncConfig.value.webdavUrl ?? '')
const syncWebdavUsernameInput = ref(syncConfig.value.webdavUsername ?? '')
const syncWebdavPasswordInput = ref(syncConfig.value.webdavPassword ?? '')
const showWebdavPassword = ref(false)
const syncSaved = ref(false)
const syncError = ref<string | null>(null)

// 每次打开对话框时，用已保存的配置回填编辑态
watch(
  () => props.open,
  (open) => {
    if (!open) return
    syncProvider.value = syncConfig.value.provider
    syncTokenInput.value = syncConfig.value.token ?? ''
    syncWebdavUrlInput.value = syncConfig.value.webdavUrl ?? ''
    syncWebdavUsernameInput.value = syncConfig.value.webdavUsername ?? ''
    syncWebdavPasswordInput.value = syncConfig.value.webdavPassword ?? ''
    syncSaved.value = false
    syncError.value = null
    showWebdavPassword.value = false
  }
)

async function handleSaveSync(): Promise<void> {
  syncError.value = null
  // 校验所选载体的必填项
  if (syncProvider.value === 'gist' || syncProvider.value === 'gitee') {
    if (!syncTokenInput.value.trim()) {
      syncError.value = '请填写访问 Token'
      return
    }
  } else if (syncProvider.value === 'webdav') {
    if (!syncWebdavUrlInput.value.trim()) {
      syncError.value = '请填写服务器地址'
      return
    }
    if (!syncWebdavUsernameInput.value.trim()) {
      syncError.value = '请填写用户名'
      return
    }
    if (!syncWebdavPasswordInput.value) {
      syncError.value = '请填写密码'
      return
    }
  }
  const partial: Partial<SyncConfig> = { provider: syncProvider.value }
  if (syncProvider.value === 'gist' || syncProvider.value === 'gitee') {
    partial.token = syncTokenInput.value.trim()
  } else if (syncProvider.value === 'webdav') {
    partial.webdavUrl = syncWebdavUrlInput.value.trim()
    partial.webdavUsername = syncWebdavUsernameInput.value.trim()
    partial.webdavPassword = syncWebdavPasswordInput.value
  } else {
    // 关闭同步：清空凭据，避免敏感信息残留配置
    partial.token = ''
    partial.webdavUrl = ''
    partial.webdavUsername = ''
    partial.webdavPassword = ''
  }
  await setSyncConfig(partial)
  syncSaved.value = true
  // 配置变更后立即在后台执行一次同步，让设置立即可用
  await runSync()
  setTimeout(() => {
    syncSaved.value = false
  }, 2000)
}

function close(): void {
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-120 flex h-[480px] max-h-[90vh] flex-col overflow-hidden p-6">
      <DialogHeader>
        <DialogTitle>设置</DialogTitle>
      </DialogHeader>

      <Tabs default-value="general" class="flex min-h-0 flex-1 flex-col">
        <TabsList class="flex w-full justify-start gap-6 border-b border-border bg-transparent p-0">
          <TabsTrigger
            value="general"
            class="-mb-px rounded-none border-b-2 border-transparent px-0 pb-2 pt-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            常规
          </TabsTrigger>
          <TabsTrigger
            value="sync"
            class="-mb-px rounded-none border-b-2 border-transparent px-0 pb-2 pt-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            同步
          </TabsTrigger>
          <TabsTrigger
            value="data"
            class="-mb-px rounded-none border-b-2 border-transparent px-0 pb-2 pt-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            数据
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" class="min-h-0 flex-1 overflow-y-auto pr-1 grid gap-5 mt-4">
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
        </TabsContent>

        <TabsContent value="sync" class="min-h-0 flex-1 overflow-y-auto pr-1 grid gap-4 mt-4">
          <!-- 订阅源同步 -->
          <div class="grid gap-2">
            <label
              class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >订阅源同步</label
            >
            <Select
              :model-value="syncProvider"
              @update:model-value="(v) => (syncProvider = v as SyncConfig['provider'])"
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">关闭</SelectItem>
                <SelectItem value="gist">GitHub Gist</SelectItem>
                <SelectItem value="gitee">Gitee 代码片段</SelectItem>
                <SelectItem value="webdav">WebDAV</SelectItem>
              </SelectContent>
            </Select>

            <template v-if="syncProvider === 'gist' || syncProvider === 'gitee'">
              <Input v-model="syncTokenInput" type="password" placeholder="访问 Token" />
            </template>
            <template v-else-if="syncProvider === 'webdav'">
              <Input
                v-model="syncWebdavUrlInput"
                placeholder="WebDAV 地址，如 https://dav.jianguoyun.com/dav"
              />
              <Input v-model="syncWebdavUsernameInput" placeholder="用户名" />
              <div class="relative">
                <Input
                  v-model="syncWebdavPasswordInput"
                  :type="showWebdavPassword ? 'text' : 'password'"
                  placeholder="密码"
                  class="pr-9"
                />
                <button
                  type="button"
                  class="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                  :aria-label="showWebdavPassword ? '隐藏密码' : '显示密码'"
                  @click="showWebdavPassword = !showWebdavPassword"
                >
                  <EyeOff v-if="showWebdavPassword" class="size-4" />
                  <Eye v-else class="size-4" />
                </button>
              </div>
            </template>

            <div class="flex items-center gap-2">
              <Button variant="outline" size="sm" @click="handleSaveSync">
                <Save class="size-3.5" />
                保存同步设置
              </Button>
              <span v-if="syncSaved" class="text-xs text-primary flex items-center gap-1">
                <CheckCircle2 class="size-3" />
                已保存
              </span>
              <span v-else-if="syncError" class="text-xs text-destructive">{{ syncError }}</span>
            </div>
            <p class="text-xs text-muted-foreground leading-relaxed">
              <template v-if="syncProvider === 'none'">
                启用后，订阅源与分类会自动同步到云端（未读/已读/星标、文章内容不参与同步）。
              </template>
              <template v-else-if="syncProvider === 'gist'">
                在 GitHub Settings → Developer settings → Personal access tokens 创建 classic
                token，勾选 gist 权限。
              </template>
              <template v-else-if="syncProvider === 'gitee'">
                在 Gitee 个人设置 → 私人令牌 创建 token（勾选 gists 权限）。
              </template>
              <template v-else>
                WebDAV 支持坚果云、Nextcloud 等；地址填写父目录 URL（如
                https://dav.jianguoyun.com/dav），应用会自动创建 feed-sync 子目录存放同步数据。
              </template>
            </p>
          </div>
        </TabsContent>

        <TabsContent value="data" class="min-h-0 flex-1 overflow-y-auto pr-1 grid gap-4 mt-4">
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
        </TabsContent>
      </Tabs>

      <div class="flex justify-end">
        <Button variant="outline" @click="close">关闭</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
