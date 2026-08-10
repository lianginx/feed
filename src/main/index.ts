// 副作用：必须在任何读取 userData 的模块（尤其 ./config）之前执行，确定目录并迁移老数据
import './dataMigration'

import { app, nativeTheme } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { APP_METADATA } from '../shared/appMetadata'
import { initializeDatabase, closeConnection } from './database'
import { getConnection } from './database/connection'
import { cleanupTranslations } from './services/translate/cache'
import { registerAllHandlers } from './ipc/index'
import { setupIpcLogger } from './ipc/logger'
import { guardIpcHandlers } from './ipc/util'
import { getSettings } from './config'
import { createWindow, getMainWindow, setIsQuitting } from './app/window'
import { buildAppMenu } from './app/menu'
import { createTray, getTrayRef } from './app/tray'
import { registerAppProtocols } from './app/protocol'
import { startScheduler, stopScheduler } from './services/timer'
import { setTrayRef, scheduleBadgeUpdate } from './services/badge'
import { initUpdater, registerUpdaterHandlers } from './services/updater'
import { initAutoLaunch } from './services/autoLaunch'
import { initProxy } from './services/proxy'

app.whenReady().then(() => {
  electronApp.setAppUserModelId(APP_METADATA.appId)

  // 注册自定义协议和会话 hook
  registerAppProtocols()

  // 构建菜单
  buildAppMenu()

  // 初始化数据库
  initializeDatabase()
  // 启动时兜底清理过期译文缓存（低频率；平时写入侧已节流）
  cleanupTranslations(getConnection())

  // 开发环境 IPC 日志（必须在注册处理器之前）
  setupIpcLogger()

  // 统一校验 IPC 调用来源（安全规则 #17）
  guardIpcHandlers()

  // 注册 IPC 处理器
  registerAllHandlers()
  registerUpdaterHandlers()

  // 初始化自动更新（非开发模式）
  initUpdater()

  // 初始化开机自动启动（非开发模式，按配置注册登录项）
  initAutoLaunch()

  // 应用全局网络代理（Node fetch + 浏览器抓取）
  initProxy(getSettings())

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
