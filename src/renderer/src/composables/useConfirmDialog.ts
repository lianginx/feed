import { ref, type Ref } from 'vue'

const show = ref(false)
const title = ref('确认操作')
const message = ref('')
const confirmText = ref('确定')
const variant = ref<'danger' | 'default'>('default')
let pendingResolver: ((ok: boolean) => void) | null = null

export interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  variant?: 'danger' | 'default'
}

export function useConfirmDialog(): {
  show: Ref<boolean>
  title: Ref<string>
  message: Ref<string>
  confirmText: Ref<string>
  variant: Ref<'danger' | 'default'>
  confirm: (options: ConfirmOptions) => Promise<boolean>
  resolveConfirm: (ok: boolean) => void
} {
  function confirm(options: ConfirmOptions): Promise<boolean> {
    title.value = options.title
    message.value = options.message
    confirmText.value = options.confirmText ?? '确定'
    variant.value = options.variant ?? 'default'
    show.value = true
    return new Promise((resolve) => {
      pendingResolver = resolve
    })
  }

  function resolveConfirm(ok: boolean): void {
    show.value = false
    pendingResolver?.(ok)
    pendingResolver = null
  }

  return { show, title, message, confirmText, variant, confirm, resolveConfirm }
}
