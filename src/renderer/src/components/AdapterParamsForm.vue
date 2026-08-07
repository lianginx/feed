<script setup lang="ts">
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { AdapterParam } from '../types'

const props = defineProps<{
  params: AdapterParam[]
  modelValue: Record<string, string>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, string>]
}>()

function update(key: string, value: string): void {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <div class="grid gap-3">
    <div v-for="p in params" :key="p.key" class="grid gap-1.5">
      <Label :for="`adapter-${p.key}`">
        {{ p.label }}<template v-if="p.required"> *</template>
      </Label>

      <Select
        v-if="p.type === 'select'"
        :model-value="modelValue[p.key]"
        @update:model-value="(v) => update(p.key, String(v))"
      >
        <SelectTrigger>
          <SelectValue :placeholder="p.placeholder" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="opt in p.options ?? []" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </SelectItem>
        </SelectContent>
      </Select>

      <textarea
        v-else-if="p.type === 'textarea'"
        :id="`adapter-${p.key}`"
        :value="modelValue[p.key]"
        :placeholder="p.placeholder"
        rows="3"
        class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        @input="update(p.key, ($event.target as HTMLTextAreaElement).value)"
      />

      <Input
        v-else
        :id="`adapter-${p.key}`"
        :model-value="modelValue[p.key]"
        :type="p.type === 'number' ? 'number' : p.type === 'url' ? 'url' : 'text'"
        :placeholder="p.placeholder"
        @update:model-value="(v) => update(p.key, String(v))"
      />

      <p v-if="p.description" class="text-xs text-muted-foreground">{{ p.description }}</p>
    </div>
  </div>
</template>
