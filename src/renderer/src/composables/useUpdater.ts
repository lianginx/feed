import { onMounted, onUnmounted } from 'vue'
import { useToast } from './useToast'
import { useUpdateDialog } from './useUpdateDialog'

/**
 * 自动更新逻辑：
 * - 订阅主进程推送的更新状态
 * - 发现新版时弹出专用更新弹窗（含更新日志与版本信息）
 * - 下载中按钮内嵌进度与百分比
 * - 下载完成后弹窗询问是否立即安装
 * - 提供 checkForUpdates() 供菜单「检查更新」调用
 */
export function useUpdater(): { checkForUpdates: () => Promise<void> } {
  const { showToast, showLoading, dismissToast } = useToast()
  const { openAvailable, setDownloading, openDownloaded, openUpToDate } = useUpdateDialog()

  let stopStatus: (() => void) | undefined

  /** 手动检查更新（菜单触发） */
  async function checkForUpdates(): Promise<void> {
    // 检查期间显示持续提示，避免「点了没反应」的错觉；
    // 自动检查（后台/启动时）不会走到这里，保持静默
    let loadingId: string | number | undefined
    const loadingTimer = window.setTimeout(() => {
      loadingId = showLoading('正在检查更新…')
    }, 200)

    try {
      const res = await window.api.updater.check()
      if (res.success && res.data?.state === 'disabled') {
        showToast('开发模式未启用自动更新', 'info')
        return
      }
      if (!res.success) {
        showToast(res.error || '检查更新失败', 'error')
      }
    } finally {
      clearTimeout(loadingTimer)
      if (loadingId !== undefined) {
        dismissToast(loadingId)
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
        case 'not-available':
          openUpToDate(status.currentVersion, status.releasePageUrl)
          break
        case 'downloading':
          setDownloading(status.percent)
          break
        case 'downloaded':
          openDownloaded()
          break
        case 'error':
          showToast(status.message || '更新出错', 'error')
          break
      }
    })
  })

  onUnmounted(() => {
    stopStatus?.()
  })

  return { checkForUpdates }
}
