import { ref } from 'vue'

export interface ToastMessage {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

const toasts = ref<ToastMessage[]>([])
let nextId = 0

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useToast() {
  function showToast(message: string, type: ToastMessage['type'] = 'success'): void {
    const id = nextId++
    toasts.value.push({ id, message, type })

    setTimeout((): void => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, 3000)
  }

  function removeToast(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return {
    toast: toasts,
    showToast,
    removeToast
  }
}
