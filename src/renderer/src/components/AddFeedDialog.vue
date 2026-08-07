<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { useFeeds } from '../composables/useFeeds'
import type { AdapterInfo } from '../types'

const { addFeed, listAdapters, addAdapter } = useFeeds()

const props = withDefaults(
  defineProps<{
    open?: boolean
  }>(),
  { open: false }
)

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const mode = ref<'rss' | 'adapter'>('rss')
const url = ref('')
const title = ref('')
const adapters = ref<AdapterInfo[]>([])
const adapterId = ref('')
const adapterParams = ref<Record<string, string>>({})
const error = ref('')
const submitting = ref(false)

const selectedAdapter = computed(() => adapters.value.find((a) => a.id === adapterId.value))

watch(
  () => props.open,
  async (val) => {
    if (val) {
      mode.value = 'rss'
      url.value = ''
      title.value = ''
      adapterId.value = ''
      adapterParams.value = {}
      error.value = ''
      try {
        adapters.value = await listAdapters()
      } catch {
        adapters.value = []
      }
    }
  }
)

function close(): void {
  emit('update:open', false)
}

async function handleSubmit(): Promise<void> {
  error.value = ''

  if (mode.value === 'rss') {
    if (!url.value.trim()) {
      error.value = '请输入订阅源地址'
      return
    }
    submitting.value = true
    try {
      const result = await addFeed(url.value.trim(), title.value.trim() || undefined)
      if (result !== false) {
        close()
      } else {
        error.value = '添加失败，请检查地址是否正确'
      }
    } catch (e) {
      error.value = `添加失败：${(e as Error).message}`
    } finally {
      submitting.value = false
    }
    return
  }

  // 适配站点
  const adapter = selectedAdapter.value
  if (!adapter) {
    error.value = '请选择站点'
    return
  }
  for (const p of adapter.params) {
    if (p.required && !(adapterParams.value[p.key] ?? '').trim()) {
      error.value = `请填写「${p.label}」`
      return
    }
  }
  submitting.value = true
  try {
    const result = await addAdapter(adapter.id, { ...adapterParams.value }, undefined)
    if (result !== false) {
      close()
    } else {
      error.value = '添加失败，请检查参数或站点是否可访问'
    }
  } catch (e) {
    error.value = `添加失败：${(e as Error).message}`
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[420px]">
      <DialogHeader>
        <DialogTitle>添加订阅源</DialogTitle>
      </DialogHeader>

      <Tabs v-model="mode" class="grid gap-4 py-2">
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger value="rss">RSS 地址</TabsTrigger>
          <TabsTrigger value="adapter">适配站点</TabsTrigger>
        </TabsList>

        <TabsContent value="rss" class="grid gap-4">
          <div class="grid gap-2">
            <Label for="url">RSS 地址 *</Label>
            <Input
              id="url"
              v-model="url"
              type="url"
              placeholder="https://example.com/feed.xml"
              @keyup.enter="handleSubmit"
            />
          </div>
          <div class="grid gap-2">
            <Label for="title">标题（可选）</Label>
            <Input id="title" v-model="title" type="text" placeholder="自动获取" />
          </div>
        </TabsContent>

        <TabsContent value="adapter" class="grid gap-4">
          <div class="grid gap-2">
            <Label>站点 *</Label>
            <Select v-model="adapterId">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="选择内置适配的站点" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="a in adapters" :key="a.id" :value="a.id">
                  {{ a.name }}
                  <span v-if="a.needsBrowser" class="ml-1 text-muted-foreground">（需浏览器）</span>
                </SelectItem>
              </SelectContent>
            </Select>
            <p v-if="selectedAdapter?.description" class="text-xs text-muted-foreground">
              {{ selectedAdapter.description }}
            </p>
          </div>

          <template v-if="selectedAdapter">
            <div v-for="p in selectedAdapter.params" :key="p.key" class="grid gap-2">
              <Label :for="`adapter-${p.key}`">
                {{ p.label }}<template v-if="p.required"> *</template>
              </Label>
              <Input
                :id="`adapter-${p.key}`"
                v-model="adapterParams[p.key]"
                type="text"
                :placeholder="p.placeholder"
                @keyup.enter="handleSubmit"
              />
            </div>
            <p v-if="selectedAdapter.cookieDomain" class="text-xs text-muted-foreground">
              该站点可能需登录 Cookie，可在「设置 → 站点」中配置。
            </p>
          </template>
        </TabsContent>

        <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
      </Tabs>

      <DialogFooter>
        <Button variant="outline" @click="close">取消</Button>
        <Button :disabled="submitting" @click="handleSubmit">
          <Spinner v-if="submitting" />
          {{ submitting ? '添加中…' : '添加' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
