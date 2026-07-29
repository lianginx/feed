import {
  app,
  protocol,
  net,
  ipcMain,
  shell,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  nativeTheme,
  session
} from 'electron'
import { join } from 'path'
import { electronApp, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initializeDatabase, closeConnection } from './database'
import { registerAllHandlers } from './ipc'
import { getSettings, updateSettings } from './config'
import { startScheduler, stopScheduler } from './services/scheduler'
import { getFaviconDir } from './services/favicon'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function createWindow(): void {
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
    ...(process.platform === 'linux' ? { icon } : {}),
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
  const trayIcon = nativeImage.createFromPath(icon)
  if (process.platform === 'darwin') {
    trayIcon.setTemplateImage(true)
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
  electronApp.setAppUserModelId('com.lianginx.feed')

  // 图片请求不发送 Referer，避免防盗链 403
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (details.resourceType === 'image') {
      delete details.requestHeaders['Referer']
    }
    callback({ requestHeaders: details.requestHeaders })
  })

  // 注册 favicon:// 协议，用于从本地缓存加载 favicon
  protocol.handle('favicon', (request) => {
    const filePath = join(getFaviconDir(), request.url.slice('favicon://'.length))
    return net.fetch(`file://${filePath}`)
  })

  // 替换为极简菜单：只保留 macOS 必需的 App 菜单和编辑操作，
  // 去掉所有浏览器菜单项（文件、视图、窗口、帮助），
  // 这样 Cmd+W/N/T/U/S/P 等快捷键因没有绑定的菜单项而自动失效
  const minimalMenu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Feed',
      submenu: [
        {
          label: 'Add Feed',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:addFeed')
        },
        { type: 'separator' },
        {
          label: 'Refresh',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.webContents.send('menu:refreshFeed')
        },
        {
          label: 'Mark All Read',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => mainWindow?.webContents.send('menu:markAllRead')
        },
        { type: 'separator' },
        {
          label: 'Toggle Star',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow?.webContents.send('menu:toggleStar')
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    ...(is.dev
      ? [
          {
            label: 'View',
            submenu: [
              {
                label: 'Toggle Developer Tools',
                accelerator: 'Alt+Cmd+I',
                click: () => mainWindow?.webContents.toggleDevTools()
              }
            ]
          }
        ]
      : [])
  ])
  Menu.setApplicationMenu(minimalMenu)

  // 初始化数据库
  initializeDatabase()

  // 监听所有 IPC 通信（开发环境）— 必须在注册处理器之前
  if (is.dev) {
    app.on('web-contents-created', (_event, contents) => {
      contents.on('ipc-message', (_event, channel, ...args) => {
        console.log(`[IPC] >> ${channel}`, args.length > 0 ? args : '')
      })
      contents.on('ipc-message-sync', (_event, channel, ...args) => {
        console.log(`[IPC] >> ${channel} (sync)`, args.length > 0 ? args : '')
      })
    })

    const origHandle = ipcMain.handle.bind(ipcMain)
    ipcMain.handle = ((channel, listener) => {
      console.log(`[IPC] registered handler: ${channel}`)
      return origHandle(channel, async (event, ...args) => {
        console.log(`[IPC] >> ${channel}`, args.length > 0 ? args : '')
        try {
          const result = await listener(event, ...args)
          console.log(`[IPC] << ${channel}`, result)
          return result
        } catch (err) {
          console.error(`[IPC] !! ${channel}`, err)
          throw err
        }
      })
    }) as typeof ipcMain.handle
  }

  // 注册 IPC 处理器
  registerAllHandlers()

  // 创建窗口和托盘
  createWindow()
  createTray()

  nativeTheme.on('updated', () => {
    const savedTheme = getSettings().theme
    if (savedTheme === 'system' && mainWindow) {
      const isDark = nativeTheme.shouldUseDarkColors
      mainWindow.setBackgroundColor(isDark ? '#0a0a0a' : '#fafafa')
    }
  })

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
