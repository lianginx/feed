<script setup lang="ts">
import { Input } from '@renderer/shared/components/ui/input'
import { Label } from '@renderer/shared/components/ui/label'
import { Switch } from '@renderer/shared/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/shared/components/ui/select'
import type { AdapterParam } from '@renderer/shared/types'
import { isParamsAdded } from '@shared/lib/adapterParams'

const props = defineProps<{
  params: AdapterParam[]
  modelValue: Record<string, string>
  /** 已添加订阅的参数组合：select 选项与之撞车时禁用（添加前置校验） */
  addedParams?: Record<string, string>[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, string>]
  enter: []
}>()

function update(key: string, value: string): void {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function isOptionAdded(param: AdapterParam, value: string): boolean {
  if (!props.addedParams?.length) return false
  return isParamsAdded({ ...props.modelValue, [param.key]: value }, props.addedParams)
}
</script>

<template>
  <div>
    <div v-for="p in params" :key="p.key" class="flex items-center justify-between gap-6 py-3">
      <div class="min-w-0">
        <Label :for="`adapter-${p.key}`" class="text-sm">
          {{ p.label }}<template v-if="p.required"> *</template>
        </Label>
        <p v-if="p.description" class="mt-0.5 text-xs text-muted-foreground">
          {{ p.description }}
        </p>
      </div>

      <Switch
        v-if="p.type === 'boolean'"
        :id="`adapter-${p.key}`"
        class="shrink-0"
        :checked="modelValue[p.key] === 'true'"
        @update:checked="(v) => update(p.key, v ? 'true' : 'false')"
      />

      <div v-else-if="p.type === 'select'" class="w-44 shrink-0">
        <Select
          :model-value="modelValue[p.key]"
          @update:model-value="(v) => update(p.key, String(v))"
        >
          <SelectTrigger>
            <SelectValue :placeholder="p.placeholder" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="opt in p.options ?? []"
              :key="opt.value"
              :value="opt.value"
              :disabled="isOptionAdded(p, opt.value)"
            >
              {{ opt.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <textarea
        v-else-if="p.type === 'textarea'"
        :id="`adapter-${p.key}`"
        :value="modelValue[p.key]"
        :placeholder="p.placeholder"
        rows="3"
        class="w-64 shrink-0 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        @input="update(p.key, ($event.target as HTMLTextAreaElement).value)"
      />

      <Input
        v-else
        :id="`adapter-${p.key}`"
        class="w-64 shrink-0"
        :model-value="modelValue[p.key]"
        :type="p.type === 'number' ? 'number' : p.type === 'url' ? 'url' : 'text'"
        :placeholder="p.placeholder"
        @update:model-value="(v) => update(p.key, String(v))"
        @keyup.enter="emit('enter')"
      />
    </div>
  </div>
</template>
