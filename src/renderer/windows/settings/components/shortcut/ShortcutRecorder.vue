<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { TriangleAlert } from '@lucide/vue'
import { Button } from '@renderer/shared/components/ui/button'

const props = defineProps<{
  accelerator: string
  label: string
  description: string
}>()
const emit = defineEmits<{ updated: [accelerator: string] }>()

const isMac = window.api.system.platform === 'darwin'

const recording = ref(false)
const saving = ref(false)
const errorTip = ref<string | null>(null)

const MODIFIER_LABELS: Record<string, string> = {
  CommandOrControl: isMac ? '⌘' : 'Ctrl',
  Command: '⌘',
  Control: isMac ? '⌃' : 'Ctrl',
  Alt: isMac ? '⌥' : 'Alt',
  Option: '⌥',
  Shift: isMac ? '⇧' : 'Shift',
  Super: 'Win'
}

const KEY_LABELS: Record<string, string> = {
  Space: isMac ? '空格' : 'Space',
  Return: isMac ? '↩' : 'Enter',
  Escape: 'Esc',
  Tab: 'Tab',
  Backspace: '⌫',
  Delete: 'Del',
  Insert: 'Ins',
  Home: 'Home',
  End: 'End',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→'
}

const CODE_KEY_MAP: Record<string, string> = {
  Space: 'Space',
  Enter: 'Return',
  NumpadEnter: 'Return',
  Escape: 'Escape',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  NumpadDecimal: 'numdec'
}

function codeToAcceleratorKey(code: string): string | null {
  if (CODE_KEY_MAP[code]) return CODE_KEY_MAP[code]
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (/^F\d{1,2}$/.test(code)) return code
  if (code.startsWith('Numpad') && /^\d$/.test(code.slice(6))) {
    return `num${code.slice(6)}`
  }
  return null
}

const MODIFIER_ORDER: Record<string, number> = {
  Control: 0,
  Alt: 1,
  Option: 1,
  Shift: 2,
  CommandOrControl: 3,
  Command: 3,
  Super: 3
}

const displayParts = computed(() => {
  const parts = props.accelerator.split('+')
  const modifiers = parts
    .filter((p) => p in MODIFIER_LABELS)
    .sort((a, b) => MODIFIER_ORDER[a] - MODIFIER_ORDER[b])
  const keys = parts.filter((p) => !(p in MODIFIER_LABELS))
  return [...modifiers, ...keys].map((part) => ({
    label: MODIFIER_LABELS[part] ?? KEY_LABELS[part] ?? part,
    isModifier: part in MODIFIER_LABELS
  }))
})

const liveModifiers = ref<string[]>([])

function syncLiveModifiers(e: KeyboardEvent): void {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Control')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push(isMac ? 'Command' : 'Super')
  liveModifiers.value = parts
}

const liveParts = computed(() =>
  liveModifiers.value.map((part) => ({
    label: MODIFIER_LABELS[part] ?? KEY_LABELS[part] ?? part
  }))
)

function startRecord(): void {
  errorTip.value = null
  liveModifiers.value = []
  recording.value = true
  void window.api.shortcut.beginCapture()
}

async function stopCapture(): Promise<void> {
  recording.value = false
  liveModifiers.value = []
  await window.api.shortcut.endCapture()
}

useEventListener(
  window,
  'keyup',
  (e: KeyboardEvent) => {
    if (!recording.value) return
    e.preventDefault()
    e.stopPropagation()
    syncLiveModifiers(e)
  },
  { capture: true }
)

useEventListener(
  window,
  'keydown',
  async (e: KeyboardEvent) => {
    if (!recording.value) return
    e.preventDefault()
    e.stopPropagation()
    if (e.isComposing || e.key === 'Process') return
    if (e.key === 'Globe' || e.code === 'Fn') return

    syncLiveModifiers(e)
    const parts = [...liveModifiers.value]

    if (parts.length === 0 && e.code === 'Escape') {
      await stopCapture()
      return
    }

    if (parts.length === 0 && e.code === 'Backspace') {
      await resetShortcut()
      return
    }

    const key = codeToAcceleratorKey(e.code)
    if (!key || parts.length === 0) return

    await applyShortcut([...parts, key].join('+'))
  },
  { capture: true }
)

onUnmounted(() => {
  if (recording.value) void window.api.shortcut.endCapture()
})

async function applyShortcut(accelerator: string): Promise<void> {
  await stopCapture()
  saving.value = true
  errorTip.value = null
  try {
    const result = await window.api.shortcut.set(accelerator)
    if (result.success) {
      emit('updated', accelerator)
    } else {
      errorTip.value = result.error || '该组合键已被系统或其他应用占用，换一个试试'
    }
  } finally {
    saving.value = false
  }
}

async function resetShortcut(): Promise<void> {
  if (saving.value) return
  await stopCapture()
  saving.value = true
  errorTip.value = null
  try {
    const result = await window.api.shortcut.reset()
    if (result.success && result.data) {
      emit('updated', result.data.accelerator)
    } else {
      errorTip.value = result.error || '恢复默认失败'
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex items-center justify-between gap-6 py-3">
    <div class="min-w-0">
      <div class="text-sm">{{ label }}</div>
      <div class="mt-0.5 text-xs text-muted-foreground">{{ description }}</div>
    </div>

    <button
      v-if="recording"
      type="button"
      class="flex h-8 min-w-44 shrink-0 animate-pulse items-center justify-center gap-1 rounded-md border border-dashed border-primary bg-primary/5 px-2"
      @click.prevent
    >
      <template v-if="liveParts.length">
        <kbd
          v-for="(part, i) in liveParts"
          :key="i"
          class="inline-flex h-6 min-w-6 items-center justify-center rounded border bg-muted px-1.5 font-sans text-[13px] leading-none text-foreground shadow-sm"
        >
          {{ part.label }}
        </kbd>
      </template>
      <span v-else class="text-xs text-muted-foreground">按下组合键…</span>
    </button>
    <button
      v-else
      type="button"
      class="group -mr-1 flex h-8 shrink-0 items-center justify-center gap-1 rounded-md px-1 transition-colors hover:bg-muted"
      :disabled="saving"
      @click="startRecord()"
    >
      <kbd
        v-for="(part, i) in displayParts"
        :key="i"
        class="inline-flex h-6 min-w-6 items-center justify-center rounded border bg-muted px-1.5 font-sans text-[13px] leading-none shadow-sm"
        :class="part.isModifier ? 'text-foreground' : 'font-semibold text-foreground'"
      >
        {{ part.label }}
      </kbd>
    </button>
  </div>

  <p v-if="errorTip" class="mt-1 flex items-center gap-1 text-xs text-destructive">
    <TriangleAlert class="size-3 shrink-0" />
    {{ errorTip }}
  </p>

  <div class="mt-6 flex justify-end border-t pt-4">
    <Button variant="outline" size="sm" :disabled="saving" @click="resetShortcut">
      恢复默认设置
    </Button>
  </div>
</template>
