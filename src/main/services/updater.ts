import { ipcMain, app, shell, net } from 'electron'

import electronUpdater from 'electron-updater'
import { createWriteStream, createReadStream, existsSync, statSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import { getMainWindow } from '@main/app/window'
import { getSettings } from '@main/config'
import { envBool, isEnvConfigured } from '@main/env'

import type { UpdaterStatus } from '@shared/types/updater'

const { autoUpdater } = electronUpdater

export type { UpdaterStatus }

interface PendingUpdate {
  version: string
  downloadUrl: string
  destPath: string
  expectedSha512: string
}

let initialized = false
let autoCheckTimer: ReturnType<typeof setInterval> | null = null
let isCheckingUpdate = false
let isDownloadingUpdate = false

let macDmgPath: string | null = null

let pendingUpdate: PendingUpdate | null = null

const isMacManualMode = process.platform === 'darwin'

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

function sha512File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('base64')))
    stream.on('error', (err) => reject(err))
  })
}

function downloadDmg(
  url: string,
  destPath: string,
  expectedSha512: string,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = net.request(url)
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        if (response.statusCode === 403) {
          reject(new Error('下载被服务器拒绝（403），请检查网络或稍后重试'))
          return
        }
        if (response.statusCode === 404) {
          reject(new Error('下载地址已失效（404），请重新检查更新'))
          return
        }
        reject(new Error(`下载失败：HTTP ${response.statusCode}`))
        return
      }
      const total = Number(response.headers['content-length']) || 0
      let received = 0
      const file = createWriteStream(destPath)
      response.on('data', (chunk) => {
        received += chunk.length
        file.write(chunk)
        if (total > 0) {
          onProgress(Math.round((received / total) * 100))
        }
      })
      response.on('end', () => {
        file.end(async () => {
          if (total > 0 && received !== total) {
            reject(new Error(`下载不完整：期望 ${total} 字节，实际 ${received} 字节`))
            return
          }
          try {
            const actual = await sha512File(destPath)
            if (actual !== expectedSha512) {
              reject(new Error('下载校验失败：SHA-512 不匹配，安装包可能已损坏'))
              return
            }
            resolve()
          } catch (err) {
            reject(err)
          }
        })
      })
      response.on('error', (err) => {
        file.destroy()
        reject(err)
      })
    })
    request.on('error', (err) => reject(err))
    request.end()
  })
}

async function checkForUpdate(auto: boolean): Promise<{ success: boolean; error?: string }> {
  if (isCheckingUpdate) {
    return { success: true }
  }

  if (isDownloadingUpdate) {
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
    pendingUpdate = null
    macDmgPath = null

    let alreadyDownloaded = false

    if (isMacManualMode) {
      const dmgFile = updateInfo.files?.find((f) => f.url.endsWith('.dmg'))
      const dmgName = dmgFile?.url
      const expectedSha512 = dmgFile?.sha512
      if (!dmgName || !expectedSha512) {
        return { success: false, error: '未找到 dmg 安装包或缺少校验信息' }
      }
      const downloadUrl = `https://github.com/lianginx/feed/releases/download/v${updateInfo.version}/${dmgName}`

      const destPath = join(app.getPath('downloads'), `Feed-${updateInfo.version}.dmg`)
      pendingUpdate = { version: updateInfo.version, downloadUrl, destPath, expectedSha512 }

      if (existsSync(destPath)) {
        try {
          const stat = statSync(destPath)
          const sizeMatches = dmgFile.size == null || stat.size === dmgFile.size
          alreadyDownloaded = sizeMatches && (await sha512File(destPath)) === expectedSha512
          if (alreadyDownloaded) {
            macDmgPath = destPath
          }
        } catch {
          alreadyDownloaded = false
        }
      }
    } else {
      pendingUpdate = {
        version: updateInfo.version,
        downloadUrl: '',
        destPath: '',
        expectedSha512: ''
      }
    }

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
  if (!pendingUpdate) {
    return { success: false, error: '未发现可下载的更新' }
  }
  isDownloadingUpdate = true

  try {
    if (isMacManualMode) {
      const { downloadUrl, destPath, expectedSha512 } = pendingUpdate

      const existsValid = existsSync(destPath) && (await sha512File(destPath)) === expectedSha512
      if (!existsValid) {
        await downloadDmg(downloadUrl, destPath, expectedSha512, (percent) =>
          sendStatus({ state: 'downloading', percent })
        )
      }
      macDmgPath = destPath
      sendStatus({ state: 'downloaded' })
      return { success: true }
    }

    await autoUpdater.downloadUpdate()
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
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => sendStatus({ state: 'checking' }))
  autoUpdater.on('error', (err) => {
    if (isCheckingUpdate || isDownloadingUpdate) {
      return
    }
    sendStatus({ state: 'error', message: err.message })
  })

  if (!isMacManualMode) {
    autoUpdater.on('download-progress', (progress) =>
      sendStatus({ state: 'downloading', percent: Math.round(progress.percent) })
    )
    autoUpdater.on('update-downloaded', () => sendStatus({ state: 'downloaded' }))
  }

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
    if (isMacManualMode) {
      if (!macDmgPath) {
        return { success: false, error: '安装包尚未就绪' }
      }

      const openError = await shell.openPath(macDmgPath)
      if (openError) {
        return { success: false, error: `无法打开安装包：${openError}` }
      }
      setImmediate(() => app.quit())
      return { success: true }
    }
    setImmediate(() => autoUpdater.quitAndInstall())
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
