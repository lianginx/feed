import { BrowserWindow, nativeTheme } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getSettings } from '@main/config'
import { endShortcutCapture } from './globalShortcut'
import { setupExternalNavigation } from './window'

let settingsWindow: BrowserWindow | null = null

export function createSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore()
    settingsWindow.show()
    settingsWindow.focus()
    return
  }

  const settings = getSettings()
  nativeTheme.themeSource = settings.theme
  const isDark = nativeTheme.shouldUseDarkColors

  settingsWindow = new BrowserWindow({
    width: 760,
    height: 560,
    show: false,
    autoHideMenuBar: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    resizable: false,
    backgroundColor: isDark ? '#0a0a0a' : '#fafafa',
    title: '设置',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      spellcheck: false
    }
  })

  settingsWindow.on('ready-to-show', () => {
    settingsWindow?.show()
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
    endShortcutCapture()
  })

  settingsWindow.webContents.on('did-start-navigation', () => {
    endShortcutCapture()
  })

  settingsWindow.webContents.on('render-process-gone', () => {
    endShortcutCapture()
  })

  setupExternalNavigation(settingsWindow.webContents)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    settingsWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/windows/settings/index.html`)
  } else {
    settingsWindow.loadFile(join(__dirname, '../renderer/windows/settings/index.html'))
  }
}
