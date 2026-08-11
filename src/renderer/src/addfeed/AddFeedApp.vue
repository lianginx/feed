<script setup lang="ts">
import { onMounted, ref, reactive, computed } from 'vue'
import { Rss } from '@lucide/vue'
import { useApp } from '@renderer/composables/useApp'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Spinner } from '@renderer/components/ui/spinner'
import AdapterParamsForm from '@renderer/components/AdapterParamsForm.vue'
import type { AdapterInfo } from '@renderer/types'

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

onMounted(async () => {
  await loadSettings()
  const result = await window.api.feeds.listAdapters()
  if (result.success && result.data) {
    adapters.value = result.data
  }
})

function faviconUrl(id: string): string {
  return `favicon://routes/${id}`
}

function selectRss(): void {
  selectedId.value = RSS_ID
}

function selectAdapter(a: AdapterInfo): void {
  selectedId.value = a.id
  // 切换路由时重置参数，只保留当前路由声明的字段；boolean 开关默认「是」
  const next: Record<string, string> = {}
  for (const p of a.params) {
    next[p.key] = p.type === 'boolean' ? 'true' : ''
  }
  adapterParams.value = next
}

async function handleAddRss(): Promise<void> {
  error.value = ''
  const u = url.value.trim()
  if (!u) {
    error.value = '请输入 RSS 地址'
    return
  }
  submittingRss.value = true
  try {
    const result = await window.api.feeds.add({
      url: u,
      title: title.value.trim() || undefined
    })
    if (result.success && result.data) {
      await window.api.feeds.refresh(result.data.id)
      await window.api.feeds.notifyAdded(result.data.id)
    } else {
      error.value = `添加失败：${result.error || '未知错误'}`
    }
  } catch (e) {
    error.value = `添加失败：${(e as Error).message}`
  } finally {
    submittingRss.value = false
  }
}

async function handleAddAdapter(): Promise<void> {
  error.value = ''
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
  try {
    // Vue ref 的 value 是 reactive Proxy，IPC 无法克隆，需展开成普通对象
    const result = await window.api.feeds.addAdapter({
      adapterId: adapter.id,
      params: { ...adapterParams.value }
    })
    if (result.success && result.data) {
      await window.api.feeds.notifyAdded(result.data.id)
    } else {
      error.value = `添加失败：${result.error || '未知错误'}`
    }
  } catch (e) {
    error.value = `添加失败：${(e as Error).message}`
  } finally {
    submittingAdapter.value = false
  }
}
</script>

<template>
  <div class="relative flex gap-2 p-2 h-screen overflow-hidden bg-canvas text-foreground">
    <!-- 顶部可拖拽区域（macOS hiddenInset 透明标题栏） -->
    <div class="absolute inset-x-0 top-0 z-10 h-10 shrink-0" style="app-region: drag" />

    <nav class="flex w-44 shrink-0 flex-col gap-1 pt-10 px-1">
      <div class="px-3 pb-1 text-[11px] uppercase tracking-wide text-foreground/45">订阅源</div>
      <button
        type="button"
        class="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent data-[activated=true]:bg-sidebar-accent"
        :data-activated="isRssSelected"
        @click="selectRss"
      >
        <span
          class="flex size-5 shrink-0 items-center justify-center rounded bg-sidebar-accent text-sidebar-foreground/80"
        >
          <Rss class="size-3.5" />
        </span>
        <span class="truncate">RSS 订阅源</span>
      </button>

      <div
        v-if="adapters.length > 0"
        class="px-3 pb-1 pt-3 text-[11px] uppercase tracking-wide text-foreground/45"
      >
        内置路由
      </div>
      <button
        v-for="a in adapters"
        :key="a.id"
        type="button"
        class="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent data-[activated=true]:bg-sidebar-accent"
        :data-activated="selectedId === a.id"
        @click="selectAdapter(a)"
      >
        <span
          class="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded bg-sidebar-accent text-[10px] font-semibold"
        >
          <img
            v-if="!failedIcons.has(a.id)"
            :src="faviconUrl(a.id)"
            alt=""
            class="h-full w-full object-contain"
            loading="lazy"
            @error="failedIcons.add(a.id)"
          />
          <span v-else class="text-sidebar-foreground/70">{{ (a.name || '?').charAt(0) }}</span>
        </span>
        <span class="truncate">{{ a.name }}</span>
      </button>
    </nav>

    <main class="min-w-0 flex-1 overflow-y-auto p-8 bg-card rounded-xl">
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
            <AdapterParamsForm v-model="adapterParams" :params="selectedAdapter.params" />
            <p v-if="selectedAdapter.cookieDomain" class="text-xs text-muted-foreground">
              该路由可能需要登录 Cookie，可在「设置 → 内置路由」中配置。
            </p>
            <div class="flex justify-end pt-2">
              <Button :disabled="!canAddAdapter" @click="handleAddAdapter">
                <Spinner v-if="submittingAdapter" />
                {{ submittingAdapter ? '添加中…' : '添加' }}
              </Button>
            </div>
          </div>
        </div>
      </Transition>

      <p v-if="error" class="mt-6 text-sm text-destructive">{{ error }}</p>
    </main>
  </div>
</template>

<style>
@reference '../assets/css/main.css';

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
</style>
