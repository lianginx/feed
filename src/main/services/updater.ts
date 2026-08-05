import { ipcMain, app, shell, net } from 'electron'
// electron-updater 是 CommonJS 模块，且 autoUpdater 通过 Object.defineProperty getter 动态导出，
// Node 的 ESM-CJS 互操作无法静态识别它 → 命名导入/namespace 导入都会得到 undefined。
// 只能用默认导入拿到整个 module.exports（含 getter）后再解构。
import electronUpdater from 'electron-updater'
import { is } from '@electron-toolkit/utils'
import { createWriteStream, createReadStream, existsSync, statSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import { getMainWindow } from '../app/window'
import { getSettings } from '../config'
// UpdaterStatus 是主进程 / preload / 渲染进程的公共契约，统一在 src/shared/types 定义，
// 供各进程 import type 引用（编译期擦除，无运行时泄漏）
import type { UpdaterStatus } from '../../shared/types/updater'

const { autoUpdater } = electronUpdater

export type { UpdaterStatus }

/** 已发现的待下载版本信息（渲染层确认下载后使用） */
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

/** macOS 手动安装模式下已下载的 dmg 路径 */
let macDmgPath: string | null = null

/** 待下载的更新信息（检查发现新版后暂存，等用户确认再下载） */
let pendingUpdate: PendingUpdate | null = null

/** 是否走 macOS 手动安装模式 */
const isMacManualMode = process.platform === 'darwin'

/** GitHub Releases 发布页（「打开下载页」按钮打开） */
const RELEASE_PAGE_URL = 'https://github.com/lianginx/feed/releases'

/** 向渲染进程推送当前更新状态 */
function sendStatus(status: UpdaterStatus): void {
  getMainWindow()?.webContents.send('updater:status', status)
}

/**
 * 将底层错误消息转换为用户友好的中文提示。
 * - draft 窗口期（刚推 tag、构建未完成）latest-mac.yml 拉不到会 404
 * - 网络类错误（断网/超时/连接重置）转成通用提示，避免暴露英文原文
 */
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

/**
 * 提取 releaseNotes（electron-updater 返回可能是字符串，也可能是
 * ReleaseNoteInfo[] 数组），统一归一化为 HTML 字符串交给渲染层展示。
 */
function extractReleaseNotes(releaseNotes: unknown): string {
  if (typeof releaseNotes === 'string') return releaseNotes
  if (Array.isArray(releaseNotes)) {
    return releaseNotes
      .map((item) => {
        if (item && typeof item === 'object' && 'note' in item) {
          const note = (item as { note: unknown }).note
          // note 可能是 null（ReleaseNoteInfo.note: string | null），不能直接 String()，
          // 否则会把 null 转成字符串 "null" 渲染出来
          return typeof note === 'string' ? note : ''
        }
        return ''
      })
      .filter(Boolean)
      .join('\n\n')
  }
  return ''
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
  // 防重入兜底：手动检查与定时器检查并发时，后到者直接静默返回
  // （正在执行的那次调用会在 finally 中复位标志，这里不能改动它）
  if (isCheckingUpdate) {
    return { success: true }
  }
  // 下载进行中不发起新检查：发现新版本时会重置 pendingUpdate/macDmgPath，
  // 覆盖正在下载的更新信息导致状态不一致（下载完成后安装时找不到安装包）
  if (isDownloadingUpdate) {
    return { success: true }
  }
  isCheckingUpdate = true

  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result || !result.isUpdateAvailable) {
      // 已是最新：自动检查静默；手动检查发 not-available，由渲染端 toast 提示
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
    // macOS 手动模式下安装包是否已存在且校验通过（发现新版时即预检）
    let alreadyDownloaded = false

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

      // 预检：安装包已存在且与元数据一致 → 直接进入「已就绪」，无需再下载。
      // 先比文件大小（元数据含 size 时）快速排除残缺/损坏文件，一致才全量算 SHA-512；
      // 预检失败（文件被占用/无权限读取等）视为未下载，不应让可选的预检拖垮整个检查流程。
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
      // Windows/Linux：让 electron-updater 管理下载信息，但关闭自动下载，
      // 由用户确认后手动触发下载
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
      // 不 sendStatus：渲染端会基于返回的 error 统一弹提示，避免双重 toast
      return { success: false, error: toFriendlyError(message) }
    }

    // 自动检查时可能正好遇到新版构建尚未完成导致的临时元数据不可用，静默忽略
    return { success: true }
  } finally {
    isCheckingUpdate = false
  }
}

/**
 * 执行下载（用户确认后调用）。
 * macOS：下载 dmg 到下载目录；Windows/Linux：调用 electron-updater 下载。
 */
async function downloadUpdate(): Promise<{ success: boolean; error?: string }> {
  // 防重入：下载进行中忽略重复请求；静默返回成功，
  // 避免渲染端把「正在下载中」当成错误弹红色提示
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
    // 不 sendStatus：渲染端会基于返回的 error 统一弹提示，避免双重 toast
    // （autoUpdater 的 error 事件在此期间的触发已被 isDownloadingUpdate 过滤）
    return { success: false, error: toFriendlyError(message) }
  } finally {
    isDownloadingUpdate = false
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
  autoUpdater.on('error', (err) => {
    if (isCheckingUpdate || isDownloadingUpdate) {
      return
    }
    sendStatus({ state: 'error', message: err.message })
  })

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
    // 防重入由 checkForUpdate 内部统一处理（手动检查与定时器检查共用）
    return checkForUpdate(false)
  })

  ipcMain.handle('updater:download', async () => {
    if (!initialized) {
      return { success: false, error: '自动更新未启用' }
    }
    // 防重入由 downloadUpdate 内部统一处理（与 checkForUpdate 模式一致）
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

  ipcMain.handle('updater:openReleasePage', async () => {
    if (!initialized) {
      return { success: false, error: '自动更新未启用' }
    }
    // 与 window.ts 的 openExternalSafe 一致：仅放行 http/https 协议
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
