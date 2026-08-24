import { ipcMain, app, shell } from 'electron'
import { existsSync } from 'fs'

import electronUpdater from 'electron-updater'
import { getMainWindow } from '@main/app/window'
import { getSettings } from '@main/config'
import { envBool, isEnvConfigured } from '@main/env'
import { installZipSilently } from '@main/services/installer'

import type { UpdaterStatus } from '@shared/types/updater'

const { autoUpdater } = electronUpdater

export type { UpdaterStatus }

let initialized = false
let autoCheckTimer: ReturnType<typeof setInterval> | null = null
let isCheckingUpdate = false
let isDownloadingUpdate = false
let isInstalling = false
let downloadedFile: string | null = null
let expectedSha512: string | null = null

const RELEASE_PAGE_URL = 'https://github.com/lianginx/feed/releases'

function sendStatus(status: UpdaterStatus): void {
  getMainWindow()?.webContents.send('updater:status', status)
}

function toFriendlyError(message: string): string {
  if (/404|latest-mac\.yml|not found/i.test(message)) {
    return '新版正在发布中，请稍后再试'
  }
  if (
    /ENOTFOUND|ERR_INTERNET_DISCONNECTED|ETIMEDOUT|ECONNRESET|socket hang up|network error/i.test(
      message
    )
  ) {
    return '网络连接异常，请检查网络后重试'
  }
  return message
}

function extractReleaseNotes(releaseNotes: unknown): string {
  if (typeof releaseNotes === 'string') return releaseNotes
  if (Array.isArray(releaseNotes)) {
    return releaseNotes
      .map((item) => {
        if (item && typeof item === 'object' && 'note' in item) {
          const note = (item as { note: unknown }).note
          return typeof note === 'string' ? note : ''
        }
        return ''
      })
      .filter(Boolean)
      .join('\n\n')
  }
  return ''
}

async function checkForUpdate(auto: boolean): Promise<{ success: boolean; error?: string }> {
  if (isCheckingUpdate || isDownloadingUpdate) {
    return { success: true }
  }
  isCheckingUpdate = true

  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result || !result.isUpdateAvailable) {
      if (!auto) {
        sendStatus({
          state: 'not-available',
          currentVersion: app.getVersion(),
          releasePageUrl: RELEASE_PAGE_URL
        })
      }
      return { success: true }
    }
    const { updateInfo } = result
    const zipFile = updateInfo.files?.find((f: { url: string; sha512?: string }) =>
      f.url.endsWith('.zip')
    )
    if (!zipFile) {
      return { success: false, error: '未找到 zip 安装包，请检查构建配置' }
    }
    if (expectedSha512 && expectedSha512 !== zipFile.sha512) {
      downloadedFile = null
    }
    expectedSha512 = zipFile.sha512 ?? null

    const alreadyDownloaded = false

    sendStatus({
      state: 'available',
      version: updateInfo.version,
      currentVersion: app.getVersion(),
      releaseNotes: extractReleaseNotes(updateInfo.releaseNotes),
      releasePageUrl: RELEASE_PAGE_URL,
      alreadyDownloaded
    })
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!auto) {
      return { success: false, error: toFriendlyError(message) }
    }
    return { success: true }
  } finally {
    isCheckingUpdate = false
  }
}

async function downloadUpdate(): Promise<{ success: boolean; error?: string }> {
  if (isDownloadingUpdate) {
    return { success: true }
  }
  isDownloadingUpdate = true

  try {
    const files = (await autoUpdater.downloadUpdate()) as unknown
    if (typeof files === 'string' && files) {
      downloadedFile = files
    } else if (Array.isArray(files) && files.length > 0) {
      const last = files[files.length - 1]
      if (typeof last === 'string' && last) downloadedFile = last
    }
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: toFriendlyError(message) }
  } finally {
    isDownloadingUpdate = false
  }
}

export function initUpdater(): void {
  if (!envBool(import.meta.env.MAIN_VITE_ENABLE_UPDATER)) {
    if (!isEnvConfigured(import.meta.env.MAIN_VITE_ENABLE_UPDATER)) {
      console.warn(
        '[updater] 未配置 MAIN_VITE_ENABLE_UPDATER，自动更新已禁用；若为生产构建请确认 .env.production 存在'
      )
    }
    return
  }

  autoUpdater.logger = console
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  if (!app.isPackaged && existsSync('dev-app-update.yml')) {
    autoUpdater.forceDevUpdateConfig = true
  }

  autoUpdater.on('checking-for-update', () => sendStatus({ state: 'checking' }))
  autoUpdater.on('error', (err) => {
    if (isCheckingUpdate || isDownloadingUpdate) {
      return
    }
    sendStatus({ state: 'error', message: err.message })
  })

  autoUpdater.on('download-progress', (progress) =>
    sendStatus({ state: 'downloading', percent: Math.round(progress.percent) })
  )
  autoUpdater.on('update-downloaded', (event: unknown) => {
    const ev = event as { downloadedFile?: string }
    if (ev.downloadedFile) downloadedFile = ev.downloadedFile
    sendStatus({ state: 'downloaded' })
  })

  initialized = true

  setTimeout(() => {
    if (getSettings().autoCheckUpdate) {
      void checkForUpdate(true)
    }
  }, 5000)

  refreshAutoCheckTimer()
}

export function refreshAutoCheckTimer(): void {
  if (!initialized) return
  if (autoCheckTimer) {
    clearInterval(autoCheckTimer)
    autoCheckTimer = null
  }
  const settings = getSettings()
  if (!settings.autoCheckUpdate || settings.updateCheckInterval <= 0) {
    return
  }
  autoCheckTimer = setInterval(
    () => {
      void checkForUpdate(true)
    },
    settings.updateCheckInterval * 60 * 1000
  )
}

export function registerUpdaterHandlers(): void {
  ipcMain.handle('updater:check', async () => {
    if (!initialized) {
      return { success: true, data: { state: 'disabled' } }
    }
    return checkForUpdate(false)
  })

  ipcMain.handle('updater:download', async () => {
    if (!initialized) {
      return { success: false, error: '自动更新未启用' }
    }
    return downloadUpdate()
  })

  ipcMain.handle('updater:install', async () => {
    if (!initialized) {
      return { success: false, error: '自动更新未启用' }
    }
    if (isInstalling) {
      return { success: false, error: '正在安装中，请稍候' }
    }

    if (process.platform === 'darwin') {
      if (!downloadedFile) {
        return { success: false, error: '安装包尚未就绪，请先下载' }
      }
      isInstalling = true
      try {
        await installZipSilently(downloadedFile, expectedSha512)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { success: false, error: toFriendlyError(message) }
      } finally {
        isInstalling = false
      }
      setImmediate(() => {
        app.relaunch()
        app.quit()
      })
      return { success: true }
    }

    if (isInstalling) {
      return { success: false, error: '正在安装中，请稍候' }
    }
    isInstalling = true
    setImmediate(() => {
      try {
        autoUpdater.quitAndInstall()
      } finally {
        isInstalling = false
      }
    })
    return { success: true }
  })

  ipcMain.handle('updater:openReleasePage', async () => {
    if (!initialized) {
      return { success: false, error: '自动更新未启用' }
    }
    if (!/^https?:\/\//i.test(RELEASE_PAGE_URL)) {
      return { success: false, error: '非法链接' }
    }
    try {
      await shell.openExternal(RELEASE_PAGE_URL)
      return { success: true }
    } catch {
      return { success: false, error: '无法打开链接' }
    }
  })
}
