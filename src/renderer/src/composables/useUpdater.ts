import { onMounted, onUnmounted } from 'vue'
import { useToast } from './useToast'
import { useConfirmDialog } from './useConfirmDialog'

/**
 * 自动更新逻辑：
 * - 订阅主进程推送的更新状态
 * - 发现新版时弹窗询问是否下载（不自动下载）
 * - 下载完成后询问是否立即安装
 * - 提供 checkForUpdates() 供菜单「检查更新」调用
 */
export function useUpdater(): { checkForUpdates: () => Promise<void> } {
  const { showToast, showLoading, dismissToast } = useToast()
  const { confirm } = useConfirmDialog()

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

  /** 询问用户是否下载新版本 */
  async function confirmDownload(version: string): Promise<void> {
    const ok = await confirm({
      title: '发现新版本',
      message: `发现新版本 v${version}，是否现在下载？`,
      confirmText: '立即下载'
    })
    if (ok) {
      const res = await window.api.updater.download()
      if (!res.success) {
        showToast(res.error || '下载失败', 'error')
      }
    }
  }

  /** 询问用户是否立即重启安装 */
  async function applyDownloaded(): Promise<void> {
    const isMac = window.api.system.platform === 'darwin'
    const ok = await confirm({
      title: '更新已就绪',
      message: isMac
        ? '新版本已下载完成。应用将退出并打开安装包，请把 Feed 拖入「应用程序」文件夹完成安装。'
        : '新版本已下载完成，重启应用即可完成安装。现在重启吗？',
      confirmText: isMac ? '退出并打开安装包' : '重启安装'
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
          break // 检查中静默，避免打扰
        case 'available':
          void confirmDownload(status.version)
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
