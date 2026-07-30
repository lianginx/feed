import { app, Tray, Menu, nativeImage } from 'electron'
import { getMainWindow } from './window'
import icon from '../../../resources/icon.png?asset'

let tray: Tray | null = null

export function getTrayRef(): Tray | null {
  return tray
}

/**
 * 创建系统托盘，绑定右键菜单和点击恢复窗口的行为。
 */
export function createTray(): void {
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
      click: () => getMainWindow()?.show()
    },
    { type: 'separator' },
    {
      label: '刷新所有订阅',
      click: () => getMainWindow()?.webContents.send('sync:refreshAll')
    },
    { type: 'separator' },
    {
      label: '设置',
      click: () => getMainWindow()?.webContents.send('menu:openSettings')
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => app.quit()
    }
  ])

  tray.setToolTip('Feed')
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => getMainWindow()?.show())
}
