import { toast as sonnerToast } from 'vue-sonner'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useToast() {
  function showToast(message: string, type: 'success' | 'error' | 'info' = 'success'): void {
    if (type === 'success') sonnerToast.success(message)
    else if (type === 'error') sonnerToast.error(message)
    else sonnerToast.info(message)
  }

  return { showToast }
}
