import { ipcMain, app, shell, net } from 'electron'
// electron-updater 是 CommonJS 模块，且 autoUpdater 通过 Object.defineProperty getter 动态导出，
// Node 的 ESM-CJS 互操作无法静态识别它 → 命名导入/namespace 导入都会得到 undefined。
// 只能用默认导入拿到整个 module.exports（含 getter）后再解构。
import electronUpdater from 'electron-updater'
import { is } from '@electron-toolkit/utils'
import { createWriteStream, createReadStream, existsSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import { getMainWindow } from '../app/window'
import { getSettings } from '../config'

const { autoUpdater } = electronUpdater

/**
 * 更新状态（通过 IPC 推送给渲染进程展示）
 */
export type UpdaterStatus =
  | { state: 'disabled' } // 自动更新未启用（开发模式）
  | { state: 'checking' } // 正在检查更新
  | { state: 'available'; version: string } // 发现新版本（尚未下载）
  | { state: 'not-available' } // 已是最新版本
  | { state: 'downloading'; percent: number } // 下载进度（0-100）
  | { state: 'downloaded' } // 下载完成，可安装
  | { state: 'error'; message: string } // 检查/下载出错

/** 已发现的待下载版本信息（渲染层确认下载后使用） */
interface PendingUpdate {
  version: string
  downloadUrl: string
  destPath: string
  expectedSha512: string
}

let initialized = false
let autoCheckTimer: ReturnType<typeof setInterval> | null = null

/** macOS 手动安装模式下已下载的 dmg 路径 */
let macDmgPath: string | null = null

/** 待下载的更新信息（检查发现新版后暂存，等用户确认再下载） */
let pendingUpdate: PendingUpdate | null = null

/** 是否走 macOS 手动安装模式 */
const isMacManualMode = process.platform === 'darwin'

/** 向渲染进程推送当前更新状态 */
function sendStatus(status: UpdaterStatus): void {
  getMainWindow()?.webContents.send('updater:status', status)
}

/**
 * 计算文件的 SHA-512（base64 编码），用于与 latest-mac.yml 里的校验和比对。
 */
function sha512File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('base64')))
    stream.on('error', (err) => reject(err))
  })
}

/**
 * 流式下载 dmg 到目标目录，并回报进度。
 * 下载完成后校验实际大小与 SHA-512，任一不匹配即视为失败。
 */
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
          // 校验文件完整性：实际大小应等于 Content-Length
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

/**
 * 检查是否有新版本（只探测，不下载）。
 * 发现新版时保存待下载信息并发 available 状态，等待用户确认后下载。
 * @param auto 是否自动检查（自动检查时「已是最新」不发提示，避免打扰）
 */
async function checkForUpdate(auto: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result || !result.isUpdateAvailable) {
      if (!auto) {
        sendStatus({ state: 'not-available' })
      }
      return { success: true }
    }
    const { updateInfo } = result
    pendingUpdate = null
    macDmgPath = null

    // macOS 手动模式：自己解析 dmg 下载信息
    if (isMacManualMode) {
      const dmgFile = updateInfo.files?.find((f) => f.url.endsWith('.dmg'))
      const dmgName = dmgFile?.url
      const expectedSha512 = dmgFile?.sha512
      if (!dmgName || !expectedSha512) {
        return { success: false, error: '未找到 dmg 安装包或缺少校验信息' }
      }
      const downloadUrl = `https://github.com/lianginx/feed/releases/download/v${updateInfo.version}/${dmgName}`
      // 下载到用户的「下载」目录（~/Downloads），方便用户找到并安装
      const destPath = join(app.getPath('downloads'), `Feed-${updateInfo.version}.dmg`)
      pendingUpdate = { version: updateInfo.version, downloadUrl, destPath, expectedSha512 }
    } else {
      // Windows/Linux：让 electron-updater 管理下载信息，但关闭自动下载，
      // 由用户确认后手动触发下载
      pendingUpdate = {
        version: updateInfo.version,
        downloadUrl: '',
        destPath: '',
        expectedSha512: ''
      }
    }

    sendStatus({ state: 'available', version: updateInfo.version })
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    sendStatus({ state: 'error', message })
    return { success: false, error: message }
  }
}

/**
 * 执行下载（用户确认后调用）。
 * macOS：下载 dmg 到下载目录；Windows/Linux：调用 electron-updater 下载。
 */
async function downloadUpdate(): Promise<{ success: boolean; error?: string }> {
  if (!pendingUpdate) {
    return { success: false, error: '未发现可下载的更新' }
  }
  try {
    if (isMacManualMode) {
      const { downloadUrl, destPath, expectedSha512 } = pendingUpdate
      // 已存在时先校验 SHA-512 是否匹配；不匹配（残缺/损坏/被篡改）则重新下载
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
    // Windows/Linux：electron-updater 原生下载（autoDownload 已关闭，这里显式触发）
    await autoUpdater.downloadUpdate()
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    sendStatus({ state: 'error', message })
    return { success: false, error: message }
  }
}

/**
 * 初始化自动更新（仅在打包运行、非开发模式时启用）。
 * - 所有平台统一：检查只探测不自动下载，用户确认后才下载
 * - 自动检查：启动后延迟数秒静默检查一次，之后按设置周期定时检查
 */
export function initUpdater(): void {
  if (is.dev) return

  autoUpdater.logger = console
  // 统一关闭自动下载：发现新版后先提示，用户确认才下载
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // 检查/错误事件：全局统一监听（下载由 downloadUpdate 显式触发）
  autoUpdater.on('checking-for-update', () => sendStatus({ state: 'checking' }))
  // 注意：这里不监听 update-not-available，
  // 因为 checkForUpdate() 会在检查完按需手动发送 not-available（自动检查时不发），
  // 若两者都发会导致「已是最新版本」提示重复
  autoUpdater.on('error', (err) => sendStatus({ state: 'error', message: err.message }))

  // Windows/Linux 的下载进度与完成事件
  if (!isMacManualMode) {
    autoUpdater.on('download-progress', (progress) =>
      sendStatus({ state: 'downloading', percent: Math.round(progress.percent) })
    )
    autoUpdater.on('update-downloaded', () => sendStatus({ state: 'downloaded' }))
  }

  initialized = true

  // 启动后延迟几秒静默检查一次，保证用户一打开就能感知新版
  setTimeout(() => {
    if (getSettings().autoCheckUpdate) {
      void checkForUpdate(true)
    }
  }, 5000)

  // 定时自动检查（默认 6 小时），设置变化时由 refreshAutoCheckTimer 重建
  refreshAutoCheckTimer()
}

/**
 * 按当前设置重建自动检查定时器。
 * 设置里的 autoCheckUpdate / updateCheckInterval 变化时调用。
 */
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

/**
 * 注册自动更新相关 IPC 处理器。
 * - updater:check     手动检查更新（发现新版只提示，不下载）
 * - updater:download  用户确认后开始下载已发现的更新
 * - updater:install   退出并安装/打开安装包
 */
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
      // 打开 dmg（系统挂载并弹出 Finder）→ 退出应用，让用户把应用拖到 Applications
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
}
