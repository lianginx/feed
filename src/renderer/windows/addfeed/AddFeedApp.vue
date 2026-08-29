<script setup lang="ts">
import { onMounted, onUnmounted, ref, reactive, computed, watch } from 'vue'
import { Rss, CircleAlert } from '@lucide/vue'
import { useApp } from '@renderer/shared/composables/useApp'
import { Button } from '@renderer/shared/components/ui/button'
import { Input } from '@renderer/shared/components/ui/input'
import { Label } from '@renderer/shared/components/ui/label'
import { Spinner } from '@renderer/shared/components/ui/spinner'
import { Alert, AlertTitle } from '@renderer/shared/components/ui/alert'
import { ScrollArea } from '@renderer/shared/components/ui/scroll-area'
import AdapterParamsForm from '@renderer/windows/addfeed/components/AdapterParamsForm.vue'
import { isValidRssUrl } from '@renderer/windows/addfeed/utils/url'
import { isParamsAdded } from '@shared/lib/adapterParams'
import type { AdapterInfo } from '@renderer/shared/types'

const { loadSettings } = useApp()

/** RSS 源固定 id（左侧第一项，默认选中） */
const RSS_ID = 'rss'

const selectedId = ref<string>(RSS_ID)
const url = ref('')
const title = ref('')
const adapters = ref<AdapterInfo[]>([])
const adapterParams = ref<Record<string, string>>({})
const submittingRss = ref(false)
const submittingAdapter = ref(false)
const error = ref('')
const failedIcons = reactive(new Set<string>())

const isRssSelected = computed(() => selectedId.value === RSS_ID)
const selectedAdapter = computed(() => adapters.value.find((a) => a.id === selectedId.value))
const canAddAdapter = computed(
  () => selectedAdapter.value !== undefined && !submittingAdapter.value
)

const isCurrentComboAdded = computed(() => {
  const adapter = selectedAdapter.value
  if (!adapter) return false
  return isParamsAdded(adapterParams.value, adapter.addedParams ?? [])
})

let stopAddResult: (() => void) | null = null
let stopInitialUrl: (() => void) | null = null
let errorTimer: ReturnType<typeof setTimeout> | undefined

function showError(message: string) {
  error.value = message
  clearTimeout(errorTimer)
  errorTimer = setTimeout(() => {
    error.value = ''
    errorTimer = undefined
  }, 4000)
}

watch(selectedId, () => (error.value = ''))

onMounted(async () => {
  stopInitialUrl = window.api.feeds.onInitialUrl((feedUrl) => {
    selectedId.value = RSS_ID
    url.value = feedUrl
  })
  stopAddResult = window.api.feeds.onAddResult((data) => {
    if (data.success) return
    showError(data.error || '未知错误')
    submittingRss.value = false
    submittingAdapter.value = false
  })
  await loadSettings()
  const result = await window.api.feeds.listAdapters()
  if (result.success && result.data) {
    adapters.value = result.data
  }
})

onUnmounted(() => {
  stopInitialUrl?.()
  stopAddResult?.()
  clearTimeout(errorTimer)
})

function faviconUrl(id: string): string {
  return `favicon://routes/${id}`
}

function selectRss() {
  selectedId.value = RSS_ID
}

function selectAdapter(a: AdapterInfo) {
  selectedId.value = a.id
  const next: Record<string, string> = {}
  for (const p of a.params) {
    if (p.type === 'boolean') {
      next[p.key] = 'true'
    } else if (p.type === 'select' && p.options?.length) {
      const available = p.options.find(
        (opt) => !isParamsAdded({ ...next, [p.key]: opt.value }, a.addedParams ?? [])
      )
      next[p.key] = (available ?? p.options[0]).value
    } else {
      next[p.key] = ''
    }
  }
  adapterParams.value = next
}

function handleAddRss() {
  error.value = ''
  const u = url.value.trim()
  if (!u) {
    error.value = '请输入 RSS 地址'
    return
  }
  if (!isValidRssUrl(u)) {
    error.value = '请输入有效的 RSS 地址'
    return
  }
  submittingRss.value = true
  window.api.feeds.add({
    url: u,
    title: title.value.trim() || undefined
  })
}

function handleAddAdapter() {
  error.value = ''
  // 与添加按钮的禁用态一致：参数组合已存在时不响应 Enter
  if (isCurrentComboAdded.value) return
  const adapter = selectedAdapter.value
  if (!adapter) {
    error.value = '请选择内置路由'
    return
  }
  for (const p of adapter.params) {
    if (p.required && !(adapterParams.value[p.key] ?? '').trim()) {
      error.value = `请填写「${p.label}」`
      return
    }
  }
  submittingAdapter.value = true
  window.api.feeds.addAdapter({
    adapterId: adapter.id,
    params: { ...adapterParams.value }
  })
}
</script>

<template>
  <div class="relative flex p-2 h-screen overflow-hidden bg-canvas text-foreground">
    <!-- 顶部可拖拽区域（macOS hiddenInset 透明标题栏） -->
    <div class="absolute inset-x-0 top-0 z-10 h-10 shrink-0" style="app-region: drag" />

    <nav class="flex w-46 shrink-0 flex-col gap-1 pt-10 pl-1">
      <div class="px-3 pb-1 text-[11px] uppercase tracking-wide text-foreground/45">订阅源</div>
      <button
        type="button"
        class="mr-3 flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent data-[activated=true]:bg-sidebar-accent"
        :data-activated="isRssSelected"
        @click="selectRss"
      >
        <span
          class="flex size-5 shrink-0 items-center justify-center rounded bg-[#EE802F] text-white"
        >
          <Rss class="size-3.5" />
        </span>
        <span class="truncate">RSS 订阅源</span>
      </button>

      <div v-if="adapters.length > 0" class="flex min-h-0 flex-1 flex-col">
        <div class="px-3 pb-1 pt-3 text-[11px] uppercase tracking-wide text-foreground/45">
          内置路由
        </div>
        <ScrollArea class="min-h-0 flex-1 pr-3">
          <div class="flex flex-col gap-1">
            <button
              v-for="a in adapters"
              :key="a.id"
              type="button"
              class="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent data-[activated=true]:bg-sidebar-accent"
              :data-activated="selectedId === a.id"
              @click="selectAdapter(a)"
            >
              <span
                class="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded"
              >
                <img
                  v-if="!failedIcons.has(a.id)"
                  :src="faviconUrl(a.id)"
                  alt=""
                  class="h-full w-full object-contain"
                  loading="lazy"
                  @error="failedIcons.add(a.id)"
                />
                <span v-else class="bg-card text-[10px] font-semibold text-sidebar-foreground/70">{{
                  (a.name || '?').charAt(0)
                }}</span>
              </span>
              <span class="truncate">{{ a.name }}</span>
            </button>
          </div>
        </ScrollArea>
      </div>
    </nav>

    <main class="min-w-0 flex-1">
      <ScrollArea class="h-full rounded-xl bg-card">
        <div class="p-8">
          <Transition name="params" mode="out-in">
            <div v-if="isRssSelected" key="rss">
              <h2 class="text-sm font-semibold text-foreground mb-1">RSS 订阅源</h2>
              <p class="mb-6 text-xs text-muted-foreground">订阅任意 RSS / Atom 地址</p>
              <div class="grid gap-4">
                <div class="grid gap-1.5">
                  <Label for="addfeed-url">RSS 地址</Label>
                  <Input
                    id="addfeed-url"
                    v-model="url"
                    type="url"
                    placeholder="https://example.com/feed.xml"
                    @keyup.enter="handleAddRss"
                  />
                </div>
                <div class="grid gap-1.5">
                  <Label for="addfeed-title">标题（可选）</Label>
                  <Input
                    id="addfeed-title"
                    v-model="title"
                    type="text"
                    placeholder="自动获取"
                    @keyup.enter="handleAddRss"
                  />
                </div>
                <div class="flex justify-end pt-2">
                  <Button :disabled="!url.trim() || submittingRss" @click="handleAddRss">
                    <Spinner v-if="submittingRss" />
                    {{ submittingRss ? '添加中…' : '添加' }}
                  </Button>
                </div>
              </div>
            </div>

            <div v-else-if="selectedAdapter" :key="selectedAdapter.id">
              <div class="mb-6 flex items-center gap-3">
                <span
                  class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-xs font-semibold"
                >
                  <img
                    v-if="!failedIcons.has(selectedAdapter.id)"
                    :src="faviconUrl(selectedAdapter.id)"
                    alt=""
                    class="h-full w-full object-contain"
                    loading="lazy"
                    @error="failedIcons.add(selectedAdapter.id)"
                  />
                  <span v-else class="text-muted-foreground">
                    {{ (selectedAdapter.name || '?').charAt(0) }}
                  </span>
                </span>
                <div class="min-w-0">
                  <h2 class="text-sm font-semibold text-foreground">{{ selectedAdapter.name }}</h2>
                  <p
                    v-if="selectedAdapter.description"
                    class="mt-0.5 truncate text-xs text-muted-foreground"
                  >
                    {{ selectedAdapter.description }}
                  </p>
                </div>
                <span class="ml-auto flex shrink-0 gap-1.5">
                  <span
                    v-if="selectedAdapter.needsBrowser"
                    class="text-[11px] text-muted-foreground/70"
                  >
                    需浏览器
                  </span>
                  <span
                    v-if="selectedAdapter.cookieDomain"
                    class="text-[11px] text-muted-foreground/70"
                  >
                    需登录
                  </span>
                </span>
              </div>

              <div class="grid gap-4">
                <AdapterParamsForm
                  v-model="adapterParams"
                  :params="selectedAdapter.params"
                  :added-params="selectedAdapter.addedParams ?? []"
                  @enter="handleAddAdapter"
                />
                <p v-if="selectedAdapter.cookieDomain" class="text-xs text-muted-foreground">
                  该路由可能需要登录 Cookie，可在「设置 → 内置路由」中配置。
                </p>
                <div class="flex justify-end pt-2">
                  <Button
                    :disabled="!canAddAdapter || isCurrentComboAdded"
                    @click="handleAddAdapter"
                  >
                    <Spinner v-if="submittingAdapter" />
                    {{ submittingAdapter ? '添加中…' : isCurrentComboAdded ? '已添加' : '添加' }}
                  </Button>
                </div>
              </div>
            </div>
          </Transition>

          <Transition name="error" mode="out-in">
            <Alert v-if="error" variant="destructive" class="mt-4">
              <CircleAlert />
              <AlertTitle>{{ error }}</AlertTitle>
            </Alert>
          </Transition>
        </div>
      </ScrollArea>
    </main>
  </div>
</template>

<style>
@reference '../../shared/assets/css/main.css';

/* 右侧内容切换：淡入 + 轻微上移，克制不打扰 */
.params-enter-active,
.params-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.params-enter-from,
.params-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* 错误提示：淡入 + 轻微上移 */
.error-enter-active,
.error-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.error-enter-from,
.error-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
