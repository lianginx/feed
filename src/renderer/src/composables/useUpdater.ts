import { onMounted, onUnmounted } from 'vue'
import { toast } from 'vue-sonner'
import { useUpdateDialog } from '@/composables/useUpdateDialog'

/**
 * 自动更新逻辑：
 * - 订阅主进程推送的更新状态
 * - 发现新版时弹出专用更新弹窗（含更新日志与版本信息）
 * - 下载中按钮内嵌进度与百分比
 * - 下载完成后弹窗询问是否立即安装
 * - 已是最新版本时以 toast 提示
 * - 提供 checkForUpdates() 供菜单「检查更新」调用
 */
export function useUpdater(): { checkForUpdates: () => Promise<void> } {
  const { openAvailable, setDownloading, openDownloaded } = useUpdateDialog()

  let stopStatus: (() => void) | undefined

  async function checkForUpdates(): Promise<void> {
    // 检查期间显示持续提示，避免「点了没反应」的错觉；
    // 自动检查（后台/启动时）不会走到这里，保持静默
    let loadingId: string | number | undefined
    const loadingTimer = window.setTimeout(() => {
      loadingId = toast.loading('正在检查更新…')
    }, 200)

    try {
      const res = await window.api.updater.check()
      if (res.success && res.data?.state === 'disabled') {
        toast.info('开发模式未启用自动更新')
        return
      }
      if (!res.success) {
        toast.error(res.error || '检查更新失败')
      }
    } finally {
      clearTimeout(loadingTimer)
      if (loadingId !== undefined) {
        toast.dismiss(loadingId)
      }
    }
  }

  onMounted(() => {
    stopStatus = window.api.updater.onStatus((status) => {
      switch (status.state) {
        case 'disabled':
          break // 开发模式未启用自动更新，静默忽略
        case 'checking':
          break // 检查中静默，避免打扰
        case 'available':
          openAvailable({
            newVersion: status.version,
            currentVersion: status.currentVersion,
            releaseNotes: status.releaseNotes,
            releasePageUrl: status.releasePageUrl,
            alreadyDownloaded: status.alreadyDownloaded
          })
          break
        case 'downloading':
          setDownloading(status.percent)
          break
        case 'downloaded':
          openDownloaded()
          break
        case 'not-available':
          // 已是最新：手动检查时以 toast 轻提示，不再弹窗打扰
          toast.info(`当前已是最新版本 v${status.currentVersion}`)
          break
        case 'error':
          toast.error(status.message || '更新出错')
          break
      }
    })
  })

  onUnmounted(() => {
    stopStatus?.()
  })

  return { checkForUpdates }
}
