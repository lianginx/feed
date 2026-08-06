<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  Upload,
  Download,
  CheckCircle2,
  Save,
  Settings,
  Cloud,
  Database,
  Rocket,
  Eye,
  EyeOff,
  Languages
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
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
import { useSync } from '../composables/useSync'
import type { SyncConfig, TranslateConfig } from '../types'

const {
  theme,
  updateInterval,
  setTheme,
  setUpdateInterval,
  syncConfig,
  setSyncConfig,
  translateConfig,
  setTranslateConfig,
  loadSettings,
  autoCheckUpdate,
  updateCheckInterval,
  setAutoCheckUpdate,
  setUpdateCheckInterval,
  autoLaunch,
  launchHidden,
  setAutoLaunch,
  setLaunchHidden
} = useApp()
const { runSync } = useSync()

const themes: { value: Theme; label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' }
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

// ---------- 订阅源同步（本地编辑态，点「保存同步设置」后写入配置） ----------
const syncProvider = ref<SyncConfig['provider']>(syncConfig.value.provider)
const syncTokenInput = ref(syncConfig.value.token ?? '')
const syncWebdavUrlInput = ref(syncConfig.value.webdavUrl ?? '')
const syncWebdavUsernameInput = ref(syncConfig.value.webdavUsername ?? '')
const syncWebdavPasswordInput = ref(syncConfig.value.webdavPassword ?? '')
const showWebdavPassword = ref(false)
const syncSaved = ref(false)
const syncError = ref<string | null>(null)

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

// ---------- 文章翻译（本地编辑态，点「保存翻译设置」后写入配置） ----------
const translateProvider = ref<TranslateConfig['provider']>(translateConfig.value.provider)
const translateAppidInput = ref(translateConfig.value.baiduAppid ?? '')
const translateSecretKeyInput = ref(translateConfig.value.baiduSecretKey ?? '')
const translateTargetLang = ref(translateConfig.value.targetLang)
const showTranslateSecretKey = ref(false)
const translateSaved = ref(false)
const translateError = ref<string | null>(null)
const translating = ref(false)
const translateTestResult = ref<string | null>(null)

const targetLanguageOptions = [
  { value: 'zh', label: '简体中文' },
  { value: 'zh-Hant', label: '繁体中文' },
  { value: 'en', label: '英语' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'fr', label: '法语' },
  { value: 'de', label: '德语' },
  { value: 'ru', label: '俄语' },
  { value: 'es', label: '西班牙语' }
]

function buildTranslateConfig(): TranslateConfig | null {
  const config: TranslateConfig = {
    provider: translateProvider.value,
    targetLang: translateTargetLang.value
  }
  if (translateProvider.value === 'baidu') {
    if (!translateAppidInput.value.trim() || !translateSecretKeyInput.value) {
      translateError.value = '请先填写百度翻译 AppID 与密钥'
      return null
    }
    config.baiduAppid = translateAppidInput.value.trim()
    config.baiduSecretKey = translateSecretKeyInput.value
  } else {
    translateError.value = '请先选择翻译服务'
    return null
  }
  return config
}

async function handleTestTranslate(): Promise<void> {
  translateTestResult.value = null
  translateError.value = null
  // 用当前表单值调 translate:test，未保存也能测
  const config = buildTranslateConfig()
  if (!config) return
  translating.value = true
  try {
    const result = await window.api.translate.test(config)
    if (result.success) {
      translateTestResult.value = '测试成功'
    } else {
      translateError.value = `测试失败：${result.error || '未知错误'}`
    }
  } finally {
    translating.value = false
  }
}

async function handleSaveTranslate(): Promise<void> {
  translateError.value = null
  if (translateProvider.value === 'baidu') {
    if (!translateAppidInput.value.trim()) {
      translateError.value = '请填写百度翻译 AppID'
      return
    }
    if (!translateSecretKeyInput.value) {
      translateError.value = '请填写百度翻译密钥'
      return
    }
  }
  const partial: Partial<TranslateConfig> = {
    provider: translateProvider.value,
    targetLang: translateTargetLang.value
  }
  if (translateProvider.value === 'baidu') {
    partial.baiduAppid = translateAppidInput.value.trim()
    partial.baiduSecretKey = translateSecretKeyInput.value
  } else {
    // 关闭翻译：清空凭据，避免敏感信息残留配置
    partial.baiduAppid = ''
    partial.baiduSecretKey = ''
  }
  await setTranslateConfig(partial)
  translateSaved.value = true
  setTimeout(() => {
    translateSaved.value = false
  }, 2000)
}

// ---------- 左侧导航 ----------
const activeSection = ref<'general' | 'startup' | 'sync' | 'translate' | 'data'>('general')

const navItems = [
  { id: 'general', label: '常规', icon: Settings },
  { id: 'startup', label: '启动', icon: Rocket },
  { id: 'sync', label: '同步', icon: Cloud },
  { id: 'translate', label: '翻译', icon: Languages },
  { id: 'data', label: '数据', icon: Database }
] as const

onMounted(async () => {
  await loadSettings()
  // 用已保存的配置回填同步编辑态
  syncProvider.value = syncConfig.value.provider
  syncTokenInput.value = syncConfig.value.token ?? ''
  syncWebdavUrlInput.value = syncConfig.value.webdavUrl ?? ''
  syncWebdavUsernameInput.value = syncConfig.value.webdavUsername ?? ''
  syncWebdavPasswordInput.value = syncConfig.value.webdavPassword ?? ''
  syncSaved.value = false
  // 用已保存的配置回填翻译编辑态
  translateProvider.value = translateConfig.value.provider
  translateAppidInput.value = translateConfig.value.baiduAppid ?? ''
  translateSecretKeyInput.value = translateConfig.value.baiduSecretKey ?? ''
  translateTargetLang.value = translateConfig.value.targetLang
  translateSaved.value = false
  translateTestResult.value = null
})
</script>

<template>
  <div class="relative flex gap-2 p-2 h-screen overflow-hidden bg-canvas text-foreground">
    <!-- 顶部可拖拽区域（macOS hiddenInset 透明标题栏需要它才能拖动窗口） -->
    <div class="absolute inset-x-0 top-0 z-10 h-10 shrink-0" style="app-region: drag" />

    <!-- 左侧导航 -->
    <nav class="flex w-44 shrink-0 flex-col gap-2 pt-8 px-1">
      <button
        v-for="item in navItems"
        :key="item.id"
        type="button"
        class="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent data-[activated=true]:bg-sidebar-accent"
        :data-activated="activeSection === item.id"
        @click="activeSection = item.id"
      >
        <component :is="item.icon" class="size-4 shrink-0" />
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <!-- 内容区 -->
    <main class="min-w-0 flex-1 overflow-y-auto p-8 bg-card rounded-xl">
      <div v-if="activeSection === 'general'">
        <!-- 外观 -->
        <section>
          <h2 class="text-sm font-semibold text-foreground mb-1">外观</h2>
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
        </section>

        <!-- 内容 -->
        <section class="mt-8">
          <h2 class="text-sm font-semibold text-foreground mb-1">内容</h2>
          <div class="flex items-center justify-between gap-6 py-3">
            <div class="min-w-0">
              <div class="text-sm">自动刷新</div>
              <div class="mt-0.5 text-xs text-muted-foreground">
                按设定间隔自动拉取订阅源最新内容
              </div>
            </div>
            <div class="w-44 shrink-0">
              <Select
                class="hover:bg-muted"
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
        </section>

        <!-- 更新 -->
        <section class="mt-8">
          <h2 class="text-sm font-semibold text-foreground mb-1">更新</h2>
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
        </section>
      </div>

      <!-- 启动 -->
      <div v-else-if="activeSection === 'startup'">
        <section>
          <h2 class="text-sm font-semibold text-foreground mb-1">启动</h2>
          <div class="flex items-center justify-between gap-6 py-3">
            <div class="min-w-0">
              <div class="text-sm">开机自动启动</div>
              <div class="mt-0.5 text-xs text-muted-foreground">登录系统后自动启动 Feed</div>
            </div>
            <Switch :model-value="autoLaunch" @update:model-value="(v) => setAutoLaunch(!!v)" />
          </div>
          <div class="flex items-center justify-between gap-6 py-3">
            <div class="min-w-0">
              <div class="text-sm">启动时隐藏窗口</div>
              <div class="mt-0.5 text-xs text-muted-foreground">
                仅开机自动启动时生效，可从托盘恢复窗口
              </div>
            </div>
            <Switch
              :model-value="launchHidden"
              :disabled="!autoLaunch"
              @update:model-value="(v) => setLaunchHidden(!!v)"
            />
          </div>
        </section>
      </div>

      <div v-else-if="activeSection === 'sync'">
        <section>
          <h2 class="text-sm font-semibold text-foreground mb-1">订阅源同步</h2>
          <div class="flex items-center justify-between gap-6 py-3">
            <div class="min-w-0">
              <div class="text-sm">同步方式</div>
              <div class="mt-0.5 text-xs text-muted-foreground">订阅源与分类自动同步到云端</div>
            </div>
            <div class="w-44 shrink-0">
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
            </div>
          </div>

          <template v-if="syncProvider === 'gist' || syncProvider === 'gitee'">
            <div class="flex items-center justify-between gap-6 py-3">
              <span class="text-sm shrink-0">访问 Token</span>
              <Input
                v-model="syncTokenInput"
                type="password"
                placeholder="粘贴 Token"
                class="w-64"
              />
            </div>
          </template>
          <template v-else-if="syncProvider === 'webdav'">
            <div class="flex items-center justify-between gap-6 py-3">
              <span class="text-sm shrink-0">服务器地址</span>
              <Input
                v-model="syncWebdavUrlInput"
                placeholder="https://dav.jianguoyun.com/dav"
                class="w-72"
              />
            </div>
            <div class="flex items-center justify-between gap-6 py-3">
              <span class="text-sm shrink-0">用户名</span>
              <Input v-model="syncWebdavUsernameInput" placeholder="用户名" class="w-72" />
            </div>
            <div class="flex items-center justify-between gap-6 py-3">
              <span class="text-sm shrink-0">密码</span>
              <div class="relative w-72">
                <Input
                  v-model="syncWebdavPasswordInput"
                  :type="showWebdavPassword ? 'text' : 'password'"
                  placeholder="密码"
                  class="w-full pr-9"
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
            </div>
          </template>

          <div class="mt-5 flex items-center gap-3">
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
          <p class="mt-4 text-xs text-muted-foreground leading-relaxed">
            <template v-if="syncProvider === 'none'">
              启用后，订阅源与分类会自动同步到云端（未读/已读/星标、文章内容不参与同步）。
            </template>
            <template v-else-if="syncProvider === 'gist'">
              在
              <a class="link" href="https://github.com/settings/tokens" target="_blank"
                >GitHub Personal access tokens</a
              >
              创建 classic token，勾选 gist 权限。
            </template>
            <template v-else-if="syncProvider === 'gitee'">
              在
              <a
                class="link"
                href="https://gitee.com/profile/personal_access_tokens"
                target="_blank"
                >Gitee 私人令牌</a
              >
              创建 token（勾选 gists 权限）。
            </template>
            <template v-else>
              WebDAV 支持
              <a class="link" href="https://www.jianguoyun.com" target="_blank">坚果云</a
              >、Nextcloud 等；地址填写父目录 URL（如 https://dav.jianguoyun.com/dav），应用会
              自动创建 feed-sync 子目录存放同步数据。
            </template>
          </p>
        </section>
      </div>

      <div v-else-if="activeSection === 'translate'">
        <section>
          <h2 class="text-sm font-semibold text-foreground mb-1">文章翻译</h2>
          <div class="flex items-center justify-between gap-6 py-3">
            <div class="min-w-0">
              <div class="text-sm">翻译服务</div>
              <div class="mt-0.5 text-xs text-muted-foreground">
                一键翻译外文文章，译文在本地缓存（标题与正文，代码块不翻译）
              </div>
            </div>
            <div class="w-44 shrink-0">
              <Select
                :model-value="translateProvider"
                @update:model-value="(v) => (translateProvider = v as TranslateConfig['provider'])"
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">暂无翻译</SelectItem>
                  <SelectItem value="baidu">百度翻译</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <template v-if="translateProvider === 'baidu'">
            <div class="flex items-center justify-between gap-6 py-3">
              <span class="text-sm shrink-0">AppID</span>
              <Input
                v-model="translateAppidInput"
                placeholder="百度翻译开放平台 appid"
                class="w-72"
              />
            </div>
            <div class="flex items-center justify-between gap-6 py-3">
              <span class="text-sm shrink-0">密钥</span>
              <div class="relative w-72">
                <Input
                  v-model="translateSecretKeyInput"
                  :type="showTranslateSecretKey ? 'text' : 'password'"
                  placeholder="密钥"
                  class="w-full pr-9"
                />
                <button
                  type="button"
                  class="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                  :aria-label="showTranslateSecretKey ? '隐藏密钥' : '显示密钥'"
                  @click="showTranslateSecretKey = !showTranslateSecretKey"
                >
                  <EyeOff v-if="showTranslateSecretKey" class="size-4" />
                  <Eye v-else class="size-4" />
                </button>
              </div>
            </div>
          </template>

          <div class="flex items-center justify-between gap-6 py-3">
            <span class="text-sm shrink-0">目标语言</span>
            <div class="w-44 shrink-0">
              <Select
                :model-value="translateTargetLang"
                @update:model-value="(v) => (translateTargetLang = v as string)"
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="opt in targetLanguageOptions"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div class="mt-5 flex items-center gap-3">
            <Button variant="outline" size="sm" @click="handleSaveTranslate">
              <Save class="size-3.5" />
              保存翻译设置
            </Button>
            <Button
              variant="outline"
              size="sm"
              :disabled="translating"
              @click="handleTestTranslate"
            >
              <Spinner v-if="translating" />
              <CheckCircle2 v-else class="size-3.5" />
              {{ translating ? '测试中…' : '测试翻译' }}
            </Button>
            <span v-if="translateSaved" class="text-xs text-primary flex items-center gap-1">
              <CheckCircle2 class="size-3" />
              已保存
            </span>
            <span
              v-else-if="translateTestResult"
              class="text-xs text-primary flex items-center gap-1"
            >
              <CheckCircle2 class="size-3" />
              {{ translateTestResult }}
            </span>
            <span v-else-if="translateError" class="text-xs text-destructive">
              {{ translateError }}
            </span>
          </div>

          <p
            v-if="translateProvider === 'baidu'"
            class="mt-4 text-xs text-muted-foreground leading-relaxed"
          >
            在
            <a class="link" href="https://fanyi-api.baidu.com" target="_blank">百度翻译开放平台</a>
            创建应用获取 AppID 与密钥。配置保存后，阅读区 工具栏会出现翻译按钮，也可用 Option+T
            快速翻译当前文章。翻译会把文章正文发送至所选翻译服务商。
          </p>
        </section>
      </div>

      <div v-else-if="activeSection === 'data'">
        <section>
          <h2 class="text-sm font-semibold text-foreground mb-1">数据</h2>
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

<style>
@reference '../assets/css/main.css';

.link {
  cursor: default;
  text-decoration-line: underline;
  font-weight: var(--font-weight-semibold);
  color: var(--color-blue-600);
}

.link:hover {
  color: var(--color-blue-700);
}

[data-theme='dark'] .link {
  color: var(--color-blue-500);
}

[data-theme='dark'] .link:hover {
  color: var(--color-blue-600);
}
</style>
