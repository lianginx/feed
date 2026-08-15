import { BrowserWindow, nativeTheme, shell, type WebContents } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getSettings, updateSettings } from '@main/config'
import { shouldLaunchHidden } from '@main/services/autoLaunch'

let mainWindow: BrowserWindow | null = null
let quitting = false

export function setIsQuitting(val: boolean): void {
  quitting = val
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/** 允许在系统浏览器中打开的外部链接协议白名单（安全规则 #15） */
const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/**
 * 在系统浏览器中安全地打开外部链接，仅允许白名单协议。
 */
function openExternalSafe(url: string): void {
  try {
    if (SAFE_EXTERNAL_PROTOCOLS.has(new URL(url).protocol)) {
      shell.openExternal(url).catch(() => {})
    }
  } catch {
    // 忽略无法解析的 URL
  }
}

/**
 * 为窗口的 webContents 配置外部链接处理（安全规则 #12、#15）：
 * - window.open / target="_blank" 新窗口请求 → 在系统浏览器打开并拒绝创建新窗体
 * - 应用内导航到外部 http/https 链接 → 阻止并改为系统浏览器打开
 * 主窗口与设置窗口共用，避免两个窗口行为不一致。
 */
export function setupExternalNavigation(webContents: WebContents): void {
  webContents.setWindowOpenHandler((details) => {
    openExternalSafe(details.url)
    return { action: 'deny' }
  })

  webContents.on('will-navigate', (event, url) => {
    // 开发模式下放行 Vite 开发服务器自身的导航（如 HMR 全量刷新）
    if (
      is.dev &&
      process.env['ELECTRON_RENDERER_URL'] &&
      url.startsWith(process.env['ELECTRON_RENDERER_URL'])
    ) {
      return
    }
    try {
      const protocol = new URL(url).protocol
      if (protocol === 'http:' || protocol === 'https:') {
        event.preventDefault()
        openExternalSafe(url)
      }
    } catch {
      // 忽略无法解析的 URL
    }
  })
}

/**
 * 创建主窗口，绑定窗口状态记忆和关闭时最小化到托盘的行为。
 */
export function createWindow(): void {
  const settings = getSettings()
  const bounds = settings.windowBounds

  nativeTheme.themeSource = settings.theme

  const isDark = nativeTheme.shouldUseDarkColors

  mainWindow = new BrowserWindow({
    acceptFirstMouse: true,
    width: bounds.width || 1440,
    height: bounds.height || 870,
    x: bounds.x,
    y: bounds.y,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: isDark ? '#0a0a0a' : '#fafafa',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    // 开机自动启动且开启「启动时隐藏窗口」时不显示主窗口（可从托盘/Dock 恢复）
    if (!shouldLaunchHidden()) {
      mainWindow?.show()
    }
  })

  // 窗口状态记忆（防抖保存）
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const saveBounds = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isMinimized()) {
        updateSettings({ windowBounds: mainWindow.getBounds() })
      }
    }, 500)
  }

  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)

  mainWindow.on('close', (event) => {
    if (mainWindow) {
      updateSettings({ windowBounds: mainWindow.getBounds() })
    }

    if (!quitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  setupExternalNavigation(mainWindow.webContents)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/windows/main/index.html`)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/windows/main/index.html'))
  }
}
