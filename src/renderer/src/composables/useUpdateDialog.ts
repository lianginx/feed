import { ref } from 'vue'
import { useToast } from './useToast'

/** 更新弹窗展示形态 */
export type UpdateDialogMode = 'available' | 'preparing' | 'downloading' | 'downloaded'

/** 发现新版时主进程推送的附加信息 */
export interface UpdateDialogInfo {
  newVersion: string
  currentVersion: string
  releaseNotes: string
  releasePageUrl: string
  /** 安装包已下载且校验通过（macOS），直接进入「已就绪」态 */
  alreadyDownloaded?: boolean
}

// 模块级单例状态（与 useConfirmDialog 一致）：
// useUpdater（useMenuCommands 内调用）驱动状态，UpdateDialog.vue 渲染状态
const show = ref(false)
const mode = ref<UpdateDialogMode>('available')
const info = ref<UpdateDialogInfo>({
  newVersion: '',
  currentVersion: '',
  releaseNotes: '',
  releasePageUrl: ''
})
const percent = ref(0)

/**
 * 更新弹窗状态管理：展示「发现新版本 / 准备中 / 下载中 / 更新已就绪」四态，
 * 并把下载、安装、打开发布页等动作封装为可复用方法。
 */
export function useUpdateDialog(): {
  show: typeof show
  mode: typeof mode
  info: typeof info
  percent: typeof percent
  openAvailable: (data: UpdateDialogInfo) => void
  setDownloading: (p: number) => void
  openDownloaded: () => void
  close: () => void
  startDownload: () => Promise<void>
  install: () => Promise<void>
  openReleasePage: () => Promise<void>
} {
  const { showToast } = useToast()

  /** 发现新版本：打开弹窗展示更新日志；安装包已就绪时直接进入「已就绪」态 */
  function openAvailable(data: UpdateDialogInfo): void {
    info.value = { ...data }
    percent.value = 0
    mode.value = data.alreadyDownloaded ? 'downloaded' : 'available'
    show.value = true
  }

  /** 下载中：弹窗仍开着则切换到下载态并更新进度（用户已关闭则不打扰） */
  function setDownloading(p: number): void {
    percent.value = p
    if (show.value) {
      mode.value = 'downloading'
    }
  }

  /** 下载完成：展示「更新已就绪」 */
  function openDownloaded(): void {
    mode.value = 'downloaded'
    show.value = true
  }

  function close(): void {
    show.value = false
  }

  /** 开始下载（用户点击「下载并安装」后调用；下载进度由状态事件驱动） */
  async function startDownload(): Promise<void> {
    // 点击立即进入「准备中」，避免 IPC 往返期间按钮无任何反馈
    mode.value = 'preparing'
    percent.value = 0
    const res = await window.api.updater.download()
    if (!res.success) {
      showToast(res.error || '下载失败', 'error')
      close()
    }
  }

  /** 退出并安装 / 打开安装包 */
  async function install(): Promise<void> {
    const res = await window.api.updater.install()
    if (!res.success) {
      showToast(res.error || '安装失败', 'error')
    }
  }

  /** 在系统浏览器打开 GitHub Releases 发布页 */
  async function openReleasePage(): Promise<void> {
    await window.api.updater.openReleasePage()
  }

  return {
    show,
    mode,
    info,
    percent,
    openAvailable,
    setDownloading,
    openDownloaded,
    close,
    startDownload,
    install,
    openReleasePage
  }
}
