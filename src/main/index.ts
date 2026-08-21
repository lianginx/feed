import './dataMigration'

import { app } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { APP_METADATA } from '@shared/appMetadata'
import { initializeDatabase, closeConnection } from './database'
import { getConnection } from './database/connection'
import { cleanupTranslations } from './services/translate/cache'
import { registerAllHandlers } from './ipc/index'
import { setupIpcLogger } from './ipc/logger'
import { guardIpcHandlers } from './ipc/util'
import { getSettings } from './config'
import { createWindow, ensureMainWindow, setIsQuitting } from './app/window'
import { buildAppMenu } from './app/menu'
import { createTray, getTrayRef } from './app/tray'
import { registerAppProtocols } from './app/protocol'
import {
  handleInitialFeedUrl,
  registerFeedProtocolClient,
  registerFeedProtocolEvents
} from './app/feedProtocol'
import { startScheduler, stopScheduler } from './services/timer'
import { setTrayRef, scheduleBadgeUpdate } from './services/badge'
import { initUpdater, registerUpdaterHandlers } from './services/updater'
import { initAutoLaunch } from './services/autoLaunch'
import { initProxy } from './services/proxy'

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  registerFeedProtocolEvents()

  app.whenReady().then(() => {
    electronApp.setAppUserModelId(APP_METADATA.appId)

    registerAppProtocols()
    registerFeedProtocolClient()

    buildAppMenu()

    initializeDatabase()
    cleanupTranslations(getConnection())

    setupIpcLogger()

    guardIpcHandlers()

    registerAllHandlers()
    registerUpdaterHandlers()

    initUpdater()

    initAutoLaunch()

    initProxy(getSettings())

    createWindow()
    createTray()
    setTrayRef(getTrayRef())

    scheduleBadgeUpdate()

    startScheduler()

    handleInitialFeedUrl()

    app.on('activate', () => {
      ensureMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (getTrayRef()) return
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
}
