import { app, ipcMain, Menu } from 'electron'
import { envBool } from '@main/env'
import { ensureMainWindow, isQuitting } from './window'
import { createSettingsWindow } from './settingsWindow'
import { createAddFeedWindow } from './addFeedWindow'

const pendingSends = new WeakMap<Electron.BrowserWindow, string[]>()

function sendToMain(channel: string): void {
  if (isQuitting()) return
  const win = ensureMainWindow()
  if (!win || win.isDestroyed()) return
  if (win.webContents.isLoading() || win.webContents.getURL() === '') {
    let pending = pendingSends.get(win)
    if (!pending) {
      pending = []
      pendingSends.set(win, pending)
      win.webContents.once('did-finish-load', () => {
        const toSend = pendingSends.get(win)
        pendingSends.delete(win)
        if (!toSend || win.isDestroyed()) return
        for (const c of toSend) win.webContents.send(c)
      })
    }
    pending.push(channel)
  } else {
    win.webContents.send(channel)
  }
}

export function buildAppMenu(): void {
  const showDevToolsMenu = envBool(import.meta.env.MAIN_VITE_ENABLE_DEVTOOLS)

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
          label: '设置…',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (isQuitting()) return
            createSettingsWindow()
          }
        },
        {
          label: '检查更新…',
          click: () => sendToMain('menu:checkForUpdates')
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
          click: () => {
            if (isQuitting()) return
            createAddFeedWindow()
          }
        },
        { type: 'separator' },
        {
          id: 'menu-refresh-feed',
          label: '刷新',
          accelerator: 'CmdOrCtrl+R',
          enabled: false,
          click: () => sendToMain('menu:refreshFeed')
        },
        {
          label: '刷新全部',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => sendToMain('menu:refreshAllFeeds')
        },
        { type: 'separator' },
        {
          label: '全部标为已读',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => sendToMain('menu:markAllRead')
        },
        { type: 'separator' },
        {
          label: '关闭窗口',
          accelerator: 'CmdOrCtrl+W',
          role: 'close'
        }
      ]
    },
    {
      label: '文章',
      submenu: [
        {
          label: '搜索文章',
          accelerator: 'CmdOrCtrl+F',
          click: () => sendToMain('menu:focusSearch')
        },
        {
          label: '只看未读/显示全部',
          accelerator: 'Tab',

          registerAccelerator: false,
          click: () => sendToMain('menu:toggleUnread')
        },
        { type: 'separator' },
        {
          id: 'menu-toggle-read',
          label: '标为已读/标记未读',
          accelerator: 'CmdOrCtrl+E',
          enabled: false,
          click: () => sendToMain('menu:toggleRead')
        },
        {
          label: '全部文章标为已读',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => sendToMain('menu:markListRead')
        },
        { type: 'separator' },
        {
          id: 'menu-toggle-star',
          label: '收藏/取消收藏',
          accelerator: 'CmdOrCtrl+D',
          enabled: false,
          click: () => sendToMain('menu:toggleStar')
        },
        { type: 'separator' },
        {
          id: 'menu-translate',
          label: '翻译当前文章',
          accelerator: 'Alt+T',
          enabled: false,
          click: () => sendToMain('menu:translate')
        },
        {
          id: 'menu-translate-refresh',
          label: '强制刷新翻译',
          accelerator: 'Alt+Shift+T',
          enabled: false,
          click: () => sendToMain('menu:translateRefresh')
        }
      ]
    },
    ...(showDevToolsMenu
      ? [
          {
            label: '视图',
            submenu: [
              {
                label: '开发者工具',
                accelerator: 'Alt+Cmd+I',
                click: () => {
                  if (isQuitting()) return
                  ensureMainWindow()?.webContents.toggleDevTools()
                }
              }
            ]
          }
        ]
      : [])
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  ipcMain.on(
    'menu:updateState',
    (
      _event,
      state: {
        hasArticle: boolean
        hasFeedContext: boolean
        isTranslated?: boolean
        translateConfigured?: boolean
      }
    ) => {
      const menu = Menu.getApplicationMenu()
      const read = menu?.getMenuItemById('menu-toggle-read')
      const star = menu?.getMenuItemById('menu-toggle-star')
      const refresh = menu?.getMenuItemById('menu-refresh-feed')
      const translate = menu?.getMenuItemById('menu-translate')
      const translateRefresh = menu?.getMenuItemById('menu-translate-refresh')
      if (read) read.enabled = state.hasArticle
      if (star) star.enabled = state.hasArticle
      if (refresh) refresh.enabled = state.hasFeedContext
      if (translate) {
        translate.enabled = Boolean(state.hasArticle && state.translateConfigured)
        translate.label = state.isTranslated ? '显示原文' : '翻译当前文章'
      }
      if (translateRefresh) {
        translateRefresh.enabled = Boolean(state.hasArticle && state.translateConfigured)
      }
    }
  )
}
