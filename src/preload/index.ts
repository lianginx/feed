import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  feeds: {
    list: () => ipcRenderer.invoke('feeds:list'),
    add: (params: { url: string; title?: string; categoryId?: number }) =>
      ipcRenderer.invoke('feeds:add', params),
    update: (id: number, data: { title?: string; categoryId?: number | null }) =>
      ipcRenderer.invoke('feeds:update', id, data),
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
    markAllRead: (categoryId: number) => ipcRenderer.invoke('categories:markAllRead', categoryId)
  },
  articles: {
    list: (params: { feedId?: number; filter?: 'all' | 'unread' | 'starred' }) =>
      ipcRenderer.invoke('articles:list', params),
    get: (id: number) => ipcRenderer.invoke('articles:get', id),
    markRead: (id: number) => ipcRenderer.invoke('articles:markRead', id),
    markAllRead: (feedId?: number) => ipcRenderer.invoke('articles:markAllRead', feedId),
    toggleStar: (id: number) => ipcRenderer.invoke('articles:toggleStar', id),
    search: (query: string) => ipcRenderer.invoke('articles:search', query),
    getUnreadCounts: () => ipcRenderer.invoke('articles:getUnreadCounts')
  },
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    update: (settings: Record<string, unknown>) => ipcRenderer.invoke('config:update', settings)
  },
  opml: {
    import: () => ipcRenderer.invoke('opml:import'),
    export: () => ipcRenderer.invoke('opml:export')
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
