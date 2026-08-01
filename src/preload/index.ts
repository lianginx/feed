import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

/** 自动更新状态（与主进程 updater.ts 保持一致） */
type UpdaterStatus =
  | { state: 'disabled' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded' }
  | { state: 'error'; message: string }

const api = {
  feeds: {
    list: () => ipcRenderer.invoke('feeds:list'),
    add: (params: { url: string; title?: string; categoryId?: number }) =>
      ipcRenderer.invoke('feeds:add', params),
    update: (
      id: number,
      data: { title?: string; url?: string; categoryId?: number | null; customTitle?: number }
    ) => ipcRenderer.invoke('feeds:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('feeds:delete', id),
    updateSortOrder: (feeds: { id: number; sort_order: number }[]) =>
      ipcRenderer.invoke('feeds:updateSortOrder', feeds),
    refreshFavicon: (id: number) => ipcRenderer.invoke('feeds:refreshFavicon', id),
    refresh: (feedId: number) => ipcRenderer.invoke('feeds:refresh', feedId),
    parseUrl: (url: string) => ipcRenderer.invoke('feeds:parseUrl', url)
  },
  categories: {
    list: () => ipcRenderer.invoke('categories:list'),
    add: (name: string) => ipcRenderer.invoke('categories:add', name),
    update: (id: number, name: string) => ipcRenderer.invoke('categories:update', id, name),
    delete: (id: number) => ipcRenderer.invoke('categories:delete', id),
    markAllRead: (categoryId: number) => ipcRenderer.invoke('categories:markAllRead', categoryId),
    updateSortOrder: (items: { id: number; sort_order: number }[]) =>
      ipcRenderer.invoke('categories:updateSortOrder', items)
  },
  articles: {
    list: (params: {
      feedId?: number
      categoryId?: number | null
      filter?: 'all' | 'unread' | 'starred'
      query?: string
    }) => ipcRenderer.invoke('articles:list', params),
    get: (id: number) => ipcRenderer.invoke('articles:get', id),
    toggleRead: (id: number) => ipcRenderer.invoke('articles:toggleRead', id),
    markAllRead: (feedId?: number, scope?: 'starred') =>
      ipcRenderer.invoke('articles:markAllRead', feedId, scope),
    toggleStar: (id: number) => ipcRenderer.invoke('articles:toggleStar', id),
    getUnreadCounts: () => ipcRenderer.invoke('articles:getUnreadCounts')
  },
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    update: (settings: Record<string, unknown>) => ipcRenderer.invoke('config:update', settings)
  },
  opml: {
    import: () => ipcRenderer.invoke('opml:import'),
    export: () => ipcRenderer.invoke('opml:export')
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (callback: (status: UpdaterStatus) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: UpdaterStatus): void =>
        callback(status)
      ipcRenderer.on('updater:status', listener)
      return () => {
        ipcRenderer.removeListener('updater:status', listener)
      }
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
