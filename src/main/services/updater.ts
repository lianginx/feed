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

const { autoUpdater } = electronUpdater

/**
 * 更新状态（通过 IPC 推送给渲染进程展示）
 */
export type UpdaterStatus =
  | { state: 'disabled' } // 自动更新未启用（开发模式）
  | { state: 'checking' } // 正在检查更新
  | { state: 'available'; version: string } // 发现新版本
  | { state: 'not-available' } // 已是最新版本
  | { state: 'downloading'; percent: number } // 下载进度（0-100）
  | { state: 'downloaded' } // 下载完成，可安装
  | { state: 'error'; message: string } // 检查/下载出错

let initialized = false

/**
 * macOS 手动安装模式下已下载的 dmg 路径。
 * 背景：electron-updater 在 macOS 上依赖 Squirrel.Mac 原生更新，
 * 它要求应用使用 Developer ID 证书签名才能自动替换安装。
 * 当前产物为未签名或 Apple Development 证书签名，Squirrel 会静默失败，
 * 因此 macOS 改为「下载 dmg → 打开安装包 → 用户拖拽安装」的手动流程。
 */
let macDmgPath: string | null = null

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
 * macOS 手动安装模式的检查更新：
 * - 仅做版本检查（autoDownload 关闭，避免触发 Squirrel）
 * - 发现新版后从 release 文件列表里找 dmg 并下载
 */
async function checkMacManualUpdate(): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result || !result.isUpdateAvailable) {
      sendStatus({ state: 'not-available' })
      return { success: true }
    }
    const { updateInfo } = result
    const dmgFile = updateInfo.files?.find((f) => f.url.endsWith('.dmg'))
    const dmgName = dmgFile?.url
    const expectedSha512 = dmgFile?.sha512
    if (!dmgName || !expectedSha512) {
      return { success: false, error: '未找到 dmg 安装包或缺少校验信息' }
    }

    sendStatus({ state: 'available', version: updateInfo.version })

    // 下载地址形如 https://github.com/lianginx/feed/releases/download/vX.Y.Z/Feed-X.Y.Z.dmg
    const downloadUrl = `https://github.com/lianginx/feed/releases/download/v${updateInfo.version}/${dmgName}`

    // 下载到用户的「下载」目录（~/Downloads），方便用户找到并安装，
    // 不要藏在临时目录里
    const destPath = join(app.getPath('downloads'), `Feed-${updateInfo.version}.dmg`)
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    sendStatus({ state: 'error', message })
    return { success: false, error: message }
  }
}

/**
 * 初始化自动更新（仅在打包运行、非开发模式时启用）。
 * - Windows/Linux：electron-updater 原生自动下载 + 退出安装
 * - macOS：Squirrel 因签名限制不可用，改为下载 dmg 让用户手动拖拽安装
 */
export function initUpdater(): void {
  if (is.dev) return

  autoUpdater.logger = console

  if (isMacManualMode) {
    // macOS 手动模式：不自动下载、不在退出时自动安装（由渲染层引导用户打开 dmg）
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.on('checking-for-update', () => sendStatus({ state: 'checking' }))
    // 注意：这里不监听 update-not-available，
    // 因为 checkMacManualUpdate() 会在检查完手动发送 not-available，
    // 若两者都发会导致「已是最新版本」提示重复出现两次
    autoUpdater.on('error', (err) => sendStatus({ state: 'error', message: err.message }))
  } else {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
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
  }

  initialized = true
}

/**
 * 注册自动更新相关 IPC 处理器。
 * - updater:check    手动检查更新（发现新版后自动开始下载）
 * - updater:install  退出并安装/打开安装包
 */
export function registerUpdaterHandlers(): void {
  ipcMain.handle('updater:check', async () => {
    if (!initialized) {
      return { success: true, data: { state: 'disabled' } }
    }
    try {
      if (isMacManualMode) {
        return await checkMacManualUpdate()
      }
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
