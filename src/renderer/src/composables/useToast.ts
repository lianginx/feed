import { toast as sonnerToast } from 'vue-sonner'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useToast() {
  function showToast(message: string, type: 'success' | 'error' | 'info' = 'success'): void {
    if (type === 'success') sonnerToast.success(message)
    else if (type === 'error') sonnerToast.error(message)
    else sonnerToast.info(message)
  }

  /** 显示持续存在的加载提示，返回其 id（用于后续 dismiss） */
  function showLoading(message: string): string | number {
    return sonnerToast.loading(message)
  }

  function dismissToast(id?: string | number): void {
    sonnerToast.dismiss(id)
  }

  return { showToast, showLoading, dismissToast }
}
