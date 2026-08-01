import { onMounted, onUnmounted } from 'vue'
import { useToast } from './useToast'
import { useConfirmDialog } from './useConfirmDialog'

/**
 * 自动更新逻辑：
 * - 订阅主进程推送的更新状态，用 Toast 反馈给用户
 * - 提供 checkForUpdates() 供菜单「检查更新」调用
 * - 下载完成后询问是否立即重启安装
 */
export function useUpdater(): { checkForUpdates: () => Promise<void> } {
  const { showToast } = useToast()
  const { confirm } = useConfirmDialog()

  let stopStatus: (() => void) | undefined

  /** 手动检查更新（菜单触发） */
  async function checkForUpdates(): Promise<void> {
    const res = await window.api.updater.check()
    if (!res.success) {
      showToast(res.error || '检查更新失败', 'error')
    }
  }

  /** 询问用户是否立即重启安装 */
  async function applyDownloaded(): Promise<void> {
    const ok = await confirm({
      title: '更新已就绪',
      message: '新版本已下载完成，重启应用即可完成安装。现在重启吗？',
      confirmText: '重启安装'
    })
    if (ok) {
      await window.api.updater.install()
    }
  }

  onMounted(() => {
    stopStatus = window.api.updater.onStatus((status) => {
      switch (status.state) {
        case 'disabled':
          break // 开发模式未启用自动更新，静默忽略
        case 'checking':
          showToast('正在检查更新…', 'info')
          break
        case 'available':
          showToast(`发现新版本 v${status.version}，正在后台下载…`, 'info')
          break
        case 'not-available':
          showToast('已是最新版本', 'success')
          break
        case 'downloading':
          break // 下载进度在后台进行，无需频繁提示
        case 'downloaded':
          showToast('新版本已下载完成', 'success')
          void applyDownloaded()
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
