import { ref } from 'vue'
import { useToast } from '@/composables/useToast'

export type UpdateDialogMode = 'available' | 'preparing' | 'downloading' | 'downloaded'

export interface UpdateDialogInfo {
  newVersion: string
  currentVersion: string
  releaseNotes: string
  releasePageUrl: string
  alreadyDownloaded?: boolean
}

const show = ref(false)
const mode = ref<UpdateDialogMode>('available')
const info = ref<UpdateDialogInfo>({
  newVersion: '',
  currentVersion: '',
  releaseNotes: '',
  releasePageUrl: ''
})
const percent = ref(0)

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

  function openAvailable(data: UpdateDialogInfo): void {
    info.value = { ...data }
    percent.value = 0
    mode.value = data.alreadyDownloaded ? 'downloaded' : 'available'
    show.value = true
  }

  function setDownloading(p: number): void {
    percent.value = p
    if (show.value) {
      mode.value = 'downloading'
    }
  }

  function openDownloaded(): void {
    mode.value = 'downloaded'
    show.value = true
  }

  function close(): void {
    show.value = false
  }

  async function startDownload(): Promise<void> {
    mode.value = 'preparing'
    percent.value = 0
    const res = await window.api.updater.download()
    if (!res.success) {
      showToast(res.error || '下载失败', 'error')
      close()
    }
  }

  async function install(): Promise<void> {
    const res = await window.api.updater.install()
    if (!res.success) {
      showToast(res.error || '安装失败', 'error')
    }
  }

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
