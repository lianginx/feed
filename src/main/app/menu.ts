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
        {
          label: '关于 Feed',
          click: () => app.showAboutPanel()
        },
        { type: 'separator' },
        {
          label: '隐藏',
          accelerator: 'CmdOrCtrl+H',
          click: () => app.hide()
        },
        {
          label: '显示全部',
          role: 'unhide'
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { type: 'separator' },
        {
          label: '剪切',
          accelerator: 'CmdOrCtrl+X',
          role: 'cut'
        },
        {
          label: '拷贝',
          accelerator: 'CmdOrCtrl+C',
          role: 'copy'
        },
        {
          label: '粘贴',
          accelerator: 'CmdOrCtrl+V',
          role: 'paste'
        },
        {
          label: '全选',
          accelerator: 'CmdOrCtrl+A',
          role: 'selectAll'
        }
      ]
    },
    {
      label: '订阅源',
      submenu: [
        {
          label: '添加订阅源',
          accelerator: 'CmdOrCtrl+N',
          click: () => getMainWindow()?.webContents.send('menu:addFeed')
        },
        { type: 'separator' },
        {
          label: '刷新',
          accelerator: 'CmdOrCtrl+R',
          click: () => getMainWindow()?.webContents.send('menu:refreshFeed')
        },
        {
          label: '刷新全部',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => getMainWindow()?.webContents.send('menu:refreshAllFeeds')
        },
        {
          label: '全部标为已读',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => getMainWindow()?.webContents.send('menu:markAllRead')
        },
        { type: 'separator' },
        {
          label: '收藏/取消收藏',
          accelerator: 'CmdOrCtrl+B',
          click: () => getMainWindow()?.webContents.send('menu:toggleStar')
        },
        { type: 'separator' },
        {
          label: '关闭窗口',
          accelerator: 'CmdOrCtrl+W',
          role: 'close'
        }
      ]
    },
    ...(is.dev
      ? [
          {
            label: '视图',
            submenu: [
              {
                label: '开发者工具',
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
