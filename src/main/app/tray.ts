import { app, Tray, Menu, nativeImage } from 'electron'
import { showMainWindow } from './window'
import { createSettingsWindow } from './settingsWindow'
import { refreshAllFeeds } from '@main/services/refresher'
import icon from '../../../resources/icon.png?asset'

let tray: Tray | null = null

export function getTrayRef(): Tray | null {
  return tray
}

export function createTray(): void {
  const trayIcon = nativeImage.createFromPath(icon)
  if (process.platform === 'darwin') {
    trayIcon.setTemplateImage(true)
    tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))
  } else {
    tray = new Tray(trayIcon.resize({ width: 32, height: 32 }))
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => showMainWindow()
    },
    { type: 'separator' },
    {
      label: '刷新所有订阅',
      click: () => {
        void refreshAllFeeds()
      }
    },
    { type: 'separator' },
    {
      label: '设置',
      click: () => createSettingsWindow()
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => app.quit()
    }
  ])

  tray.setToolTip('Feed')
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => showMainWindow())
}
