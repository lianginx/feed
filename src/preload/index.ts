import { contextBridge, ipcRenderer } from 'electron'

/** 自动更新状态（与主进程 updater.ts 保持一致） */
type UpdaterStatus =
  | { state: 'disabled' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded' }
  | { state: 'error'; message: string }

/**
 * 订阅主进程事件：包裹回调并剥离 IpcRendererEvent，只透传业务数据，
 * 避免把底层 ipcRenderer / 事件对象暴露给渲染进程（Electron 安全规则 #20）。
 * 返回取消订阅函数。
 */
function onChannel<A extends unknown[]>(
  channel: string,
  callback: (...args: A) => void
): () => void {
  const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void =>
    callback(...(args as A))
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.off(channel, listener)
  }
}

const api = {
  system: {
    /** 当前操作系统平台（darwin / win32 / linux） */
    platform: process.platform
  },
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
    parseUrl: (url: string) => ipcRenderer.invoke('feeds:parseUrl', url),
    /** 订阅单个订阅源刷新进度事件，返回取消订阅函数 */
    onRefreshProgress: (
      callback: (data: {
        feedId: number
        status: 'fetching' | 'complete' | 'error'
        inserted?: number
        updated?: number
        error?: string
      }) => void
    ): (() => void) => onChannel('feeds:refresh-progress', callback)
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
    update: (settings: Record<string, unknown>) => ipcRenderer.invoke('config:update', settings),
    /** 订阅配置变更事件，返回取消订阅函数 */
    onChanged: (callback: () => void): (() => void) => onChannel('config:changed', callback)
  },
  opml: {
    import: () => ipcRenderer.invoke('opml:import'),
    export: () => ipcRenderer.invoke('opml:export')
  },
  menu: {
    /** 上报菜单可用状态（主进程据此置灰菜单项） */
    updateState: (state: { hasArticle: boolean; hasFeedContext: boolean }): void =>
      ipcRenderer.send('menu:updateState', state),
    onAddFeed: (callback: () => void): (() => void) => onChannel('menu:addFeed', callback),
    onRefreshFeed: (callback: () => void): (() => void) => onChannel('menu:refreshFeed', callback),
    onRefreshAllFeeds: (callback: () => void): (() => void) =>
      onChannel('menu:refreshAllFeeds', callback),
    onMarkListRead: (callback: () => void): (() => void) =>
      onChannel('menu:markListRead', callback),
    onMarkAllRead: (callback: () => void): (() => void) => onChannel('menu:markAllRead', callback),
    onToggleRead: (callback: () => void): (() => void) => onChannel('menu:toggleRead', callback),
    onCheckForUpdates: (callback: () => void): (() => void) =>
      onChannel('menu:checkForUpdates', callback),
    onToggleStar: (callback: () => void): (() => void) => onChannel('menu:toggleStar', callback),
    onFocusSearch: (callback: () => void): (() => void) => onChannel('menu:focusSearch', callback)
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (callback: (status: UpdaterStatus) => void): (() => void) =>
      onChannel('updater:status', callback)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
