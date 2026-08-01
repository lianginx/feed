import { ipcMain } from 'electron'
// electron-updater 是 CommonJS 模块，且 autoUpdater 通过 Object.defineProperty getter 动态导出，
// Node 的 ESM-CJS 互操作无法静态识别它 → 命名导入/namespace 导入都会得到 undefined。
// 只能用默认导入拿到整个 module.exports（含 getter）后再解构。
import electronUpdater from 'electron-updater'
import { is } from '@electron-toolkit/utils'
import { getMainWindow } from '../app/window'

const { autoUpdater } = electronUpdater

/**
 * 更新状态（通过 IPC 推送给渲染进程展示）
 */
export type UpdaterStatus =
  | { state: 'disabled' } // 自动更新未启用（开发模式）
  | { state: 'checking' } // 正在检查更新
  | { state: 'available'; version: string } // 发现新版本，已开始下载
  | { state: 'not-available' } // 已是最新版本
  | { state: 'downloading'; percent: number } // 下载进度（0-100）
  | { state: 'downloaded' } // 下载完成，重启后安装
  | { state: 'error'; message: string } // 检查/下载出错

let initialized = false

/** 向渲染进程推送当前更新状态 */
function sendStatus(status: UpdaterStatus): void {
  getMainWindow()?.webContents.send('updater:status', status)
}

/**
 * 初始化自动更新（仅在打包运行、非开发模式时启用）。
 * - 发现新版本后自动后台下载
 * - 应用退出时自动安装
 * - 通过 GitHub Releases 的 latest-mac.yml / blockmap 拉取与差分更新
 */
export function initUpdater(): void {
  if (is.dev) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // 更新日志输出到控制台；如需落盘可替换为 electron-log
  autoUpdater.logger = console

  autoUpdater.on('checking-for-update', () => sendStatus({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    sendStatus({ state: 'available', version: info.version })
  )
  autoUpdater.on('update-not-available', () => sendStatus({ state: 'not-available' }))
  autoUpdater.on('download-progress', (progress) =>
    sendStatus({ state: 'downloading', percent: Math.round(progress.percent) })
  )
  autoUpdater.on('update-downloaded', () => sendStatus({ state: 'downloaded' }))
  autoUpdater.on('error', (err) => sendStatus({ state: 'error', message: err.message }))

  initialized = true
}

/**
 * 注册自动更新相关 IPC 处理器。
 * - updater:check    手动检查更新（发现新版后自动开始下载）
 * - updater:install  立即退出并安装已下载的更新
 */
export function registerUpdaterHandlers(): void {
  ipcMain.handle('updater:check', async () => {
    if (!initialized) {
      return { success: true, data: { state: 'disabled' } }
    }
    try {
      await autoUpdater.checkForUpdates()
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('updater:install', async () => {
    if (!initialized) {
      return { success: false, error: '自动更新未启用' }
    }
    setImmediate(() => autoUpdater.quitAndInstall())
    return { success: true }
  })
}
