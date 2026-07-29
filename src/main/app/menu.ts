import { app, Menu } from 'electron'
import { is } from '@electron-toolkit/utils'
import { getMainWindow } from './window'

/**
 * 构建并设置应用菜单。
 * 菜单项通过 webContents.send 向渲染进程发送指令。
 */
export function buildAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
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
          click: () => getMainWindow()?.webContents.send('menu:addFeed')
        },
        { type: 'separator' },
        {
          label: 'Refresh',
          accelerator: 'CmdOrCtrl+R',
          click: () => getMainWindow()?.webContents.send('menu:refreshFeed')
        },
        {
          label: 'Mark All Read',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => getMainWindow()?.webContents.send('menu:markAllRead')
        },
        { type: 'separator' },
        {
          label: 'Toggle Star',
          accelerator: 'CmdOrCtrl+B',
          click: () => getMainWindow()?.webContents.send('menu:toggleStar')
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
                click: () => getMainWindow()?.webContents.toggleDevTools()
              }
            ]
          }
        ]
      : [])
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
