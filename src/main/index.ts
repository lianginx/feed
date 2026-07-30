import { app, nativeTheme } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { initializeDatabase, closeConnection } from './database'
import { registerAllHandlers } from './ipc/index'
import { setupIpcLogger } from './ipc/logger'
import { getSettings } from './config'
import { createWindow, getMainWindow, setIsQuitting } from './app/window'
import { buildAppMenu } from './app/menu'
import { createTray, getTrayRef } from './app/tray'
import { registerAppProtocols } from './app/protocol'
import { startScheduler, stopScheduler } from './services/timer'
import { setTrayRef, scheduleBadgeUpdate } from './services/badge'

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.lianginx.feed')

  // 注册自定义协议和会话 hook
  registerAppProtocols()

  // 构建菜单
  buildAppMenu()

  // 初始化数据库
  initializeDatabase()

  // 开发环境 IPC 日志（必须在注册处理器之前）
  setupIpcLogger()

  // 注册 IPC 处理器
  registerAllHandlers()

  // 创建窗口和托盘
  createWindow()
  createTray()
  setTrayRef(getTrayRef())

  // 主题变化监听
  nativeTheme.on('updated', () => {
    const savedTheme = getSettings().theme
    if (savedTheme === 'system') {
      const win = getMainWindow()
      if (win) {
        const isDark = nativeTheme.shouldUseDarkColors
        win.setBackgroundColor(isDark ? '#0a0a0a' : '#fafafa')
      }
    }
  })

  // 初始未读徽标（先显示当前状态）
  scheduleBadgeUpdate()

  // 启动定时刷新（后台拉取最新数据）
  startScheduler()

  app.on('activate', () => {
    const existing = getMainWindow()
    if (existing) {
      existing.show()
      existing.focus()
    } else {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  setIsQuitting(true)
  stopScheduler()
})

app.on('will-quit', () => {
  closeConnection()
})
