import { app, shell, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initializeDatabase, closeConnection } from './database'
import { registerAllHandlers } from './ipc'
import { getSettings, updateSettings } from './config'
import { startScheduler, stopScheduler } from './services/scheduler'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function createWindow(): void {
  const settings = getSettings()
  const bounds = settings.windowBounds

  mainWindow = new BrowserWindow({
    width: bounds.width || 1200,
    height: bounds.height || 800,
    x: bounds.x,
    y: bounds.y,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
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
        const rect = mainWindow.getBounds()
        updateSettings({ windowBounds: rect })
      }
    }, 500)
  }

  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)

  // 关闭时最小化到托盘
  mainWindow.on('close', (event) => {
    // 保存窗口状态
    if (mainWindow) {
      const rect = mainWindow.getBounds()
      updateSettings({ windowBounds: rect })
    }

    if (!isQuitting) {
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

function createTray(): void {
  // macOS 使用 Template 图标（自动适配深色/浅色）
  const trayIcon = nativeImage.createFromPath(icon)
  if (process.platform === 'darwin') {
    tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))
  } else {
    tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: '刷新所有订阅',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('sync:refreshAll')
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setToolTip('Feed')
  tray.setContextMenu(contextMenu)

  // 点击托盘图标恢复窗口
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus()
      } else {
        mainWindow.show()
      }
    }
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.feed.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 初始化数据库
  initializeDatabase()

  // 注册 IPC 处理器
  registerAllHandlers()

  // 创建窗口和托盘
  createWindow()
  createTray()

  // 启动定时刷新
  startScheduler()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('before-quit', () => {
    isQuitting = true
    stopScheduler()
  })
})

// 关闭窗口时最小化到托盘（不退出）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
})

// 处理关闭事件：最小化到托盘
app.on('will-quit', () => {
  closeConnection()
})
