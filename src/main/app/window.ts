import { BrowserWindow, nativeTheme, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getSettings, updateSettings } from '../config'

let mainWindow: BrowserWindow | null = null
let quitting = false

export function setIsQuitting(val: boolean): void {
  quitting = val
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/**
 * 创建主窗口，绑定窗口状态记忆和关闭时最小化到托盘的行为。
 */
export function createWindow(): void {
  const settings = getSettings()
  const bounds = settings.windowBounds

  nativeTheme.themeSource = settings.theme

  const isDark =
    settings.theme === 'dark' || (settings.theme === 'system' && nativeTheme.shouldUseDarkColors)

  mainWindow = new BrowserWindow({
    width: bounds.width || 1200,
    height: bounds.height || 800,
    x: bounds.x,
    y: bounds.y,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: isDark ? '#0a0a0a' : '#fafafa',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
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

  // 关闭时最小化到托盘
  mainWindow.on('close', (event) => {
    if (mainWindow) {
      updateSettings({ windowBounds: mainWindow.getBounds() })
    }

    if (!quitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}
