import { BrowserWindow, nativeTheme, shell, type WebContents } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getSettings, updateSettings } from '@main/config'
import { shouldLaunchHidden } from '@main/services/autoLaunch'

let mainWindow: BrowserWindow | null = null
let quitting = false
let destroyTimer: ReturnType<typeof setTimeout> | null = null

const LOW_MEMORY_DESTROY_DELAY_MS = 1000 * 60 * 5

export function isQuitting(): boolean {
  return quitting
}

export function setIsQuitting(val: boolean): void {
  quitting = val
  if (val && destroyTimer) {
    clearTimeout(destroyTimer)
    destroyTimer = null
  }
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function cancelDestroyTimer(): void {
  if (destroyTimer) {
    clearTimeout(destroyTimer)
    destroyTimer = null
  }
}

export function scheduleDestroyTimer(): void {
  cancelDestroyTimer()
  if (!getSettings().lowMemoryMode) return
  if (quitting) return
  destroyTimer = setTimeout(() => {
    destroyTimer = null
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.destroy()
    }
  }, LOW_MEMORY_DESTROY_DELAY_MS)
}

export function ensureMainWindow(): BrowserWindow | null {
  if (quitting) {
    const existing = getMainWindow()
    if (existing && !existing.isDestroyed()) return existing
    return null
  }
  const existing = getMainWindow()
  if (existing && !existing.isDestroyed()) {
    cancelDestroyTimer()
    if (!existing.isVisible()) existing.show()
    if (existing.isMinimized()) existing.restore()
    existing.focus()
    return existing
  }
  createWindow()
  return mainWindow as BrowserWindow
}

export function showMainWindow(): void {
  ensureMainWindow()
}

const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function openExternalSafe(url: string): void {
  try {
    if (SAFE_EXTERNAL_PROTOCOLS.has(new URL(url).protocol)) {
      shell.openExternal(url).catch(() => {})
    }
  } catch {
    void 0
  }
}

export function setupExternalNavigation(webContents: WebContents): void {
  webContents.setWindowOpenHandler((details) => {
    openExternalSafe(details.url)
    return { action: 'deny' }
  })

  webContents.on('will-navigate', (event, url) => {
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
      void 0
    }
  })
}

export function createWindow(): void {
  const settings = getSettings()
  nativeTheme.themeSource = settings.theme
  const isDark = nativeTheme.shouldUseDarkColors

  const bounds = settings.windowBounds

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
    if (!shouldLaunchHidden()) {
      mainWindow?.show()
    }
  })

  mainWindow.on('show', cancelDestroyTimer)
  mainWindow.on('closed', () => {
    mainWindow = null
    cancelDestroyTimer()
  })
  mainWindow.on('hide', scheduleDestroyTimer)

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
      scheduleDestroyTimer()
    }
  })

  setupExternalNavigation(mainWindow.webContents)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/windows/main/index.html`)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/windows/main/index.html'))
  }
}
