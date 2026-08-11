import { BrowserWindow, nativeTheme } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getSettings } from '@main/config'
import { setupExternalNavigation } from './window'

let addFeedWindow: BrowserWindow | null = null

/** 关闭添加订阅源窗口（添加完成后由主进程调用） */
export function closeAddFeedWindow(): void {
  if (addFeedWindow && !addFeedWindow.isDestroyed()) {
    addFeedWindow.close()
  }
}

/**
 * 创建（或聚焦）独立的「添加订阅源」窗口。
 * 单例：已存在则显示并聚焦，否则新建；关闭即销毁。
 */
export function createAddFeedWindow(): void {
  if (addFeedWindow && !addFeedWindow.isDestroyed()) {
    if (addFeedWindow.isMinimized()) addFeedWindow.restore()
    addFeedWindow.show()
    addFeedWindow.focus()
    return
  }

  const settings = getSettings()
  nativeTheme.themeSource = settings.theme
  const isDark =
    settings.theme === 'dark' || (settings.theme === 'system' && nativeTheme.shouldUseDarkColors)

  addFeedWindow = new BrowserWindow({
    width: 760,
    height: 560,
    show: false,
    autoHideMenuBar: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    resizable: false,
    backgroundColor: isDark ? '#0a0a0a' : '#fafafa',
    title: '添加订阅源',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      spellcheck: false
    }
  })

  addFeedWindow.on('ready-to-show', () => {
    addFeedWindow?.show()
  })

  addFeedWindow.on('closed', () => {
    addFeedWindow = null
  })

  // 外部链接统一在系统浏览器中打开，避免在 Electron 中新开窗体（与主窗口一致）
  setupExternalNavigation(addFeedWindow.webContents)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    addFeedWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/windows/addfeed/index.html`)
  } else {
    addFeedWindow.loadFile(join(__dirname, '../renderer/windows/addfeed/index.html'))
  }
}
