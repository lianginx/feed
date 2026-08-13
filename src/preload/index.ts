import { contextBridge, ipcRenderer } from 'electron'
import type { UpdaterStatus } from '@shared/types/updater'
import type { ArticleListParams } from '@shared/types/articles'

/**
 * 订阅主进程事件：包裹回调并剥离 IpcRendererEvent，只透传业务数据，
 * 避免把底层 ipcRenderer / 事件对象暴露给渲染进程（Electron 安全规则 #20）。
 * 返回取消订阅函数。
 */
function onChannel<A extends unknown[]>(
  channel: string,
  callback: (...args: A) => void
): () => void {
  const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
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
    listAdapters: () => ipcRenderer.invoke('feeds:listAdapters'),
    addAdapter: (input: {
      adapterId: string
      params: Record<string, string>
      title?: string
      categoryId?: number
    }) => ipcRenderer.invoke('feeds:addAdapter', input),
    /** 订阅单个订阅源刷新进度事件，返回取消订阅函数 */
    onRefreshProgress: (
      callback: (data: {
        feedId: number
        status: 'fetching' | 'complete' | 'error'
        inserted?: number
        updated?: number
        error?: string
      }) => void
    ): (() => void) => onChannel('feeds:refresh-progress', callback),
    /** 打开「添加订阅源」独立窗口 */
    openAddFeedWindow: () => ipcRenderer.invoke('feeds:openAddFeedWindow'),
    onAddResult: (callback: (data: { success: boolean; error?: string }) => void): (() => void) =>
      onChannel('feeds:add-result', callback),
    onChanged: (callback: (data: { feedId?: number }) => void): (() => void) =>
      onChannel('feeds:changed', callback)
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
    list: (params: ArticleListParams) => ipcRenderer.invoke('articles:list', params),
    get: (id: number) => ipcRenderer.invoke('articles:get', id),
    toggleRead: (id: number) => ipcRenderer.invoke('articles:toggleRead', id),
    markAllRead: (feedId?: number, isStar?: boolean, isToday?: boolean) =>
      ipcRenderer.invoke('articles:markAllRead', feedId, isStar, isToday),
    toggleStar: (id: number) => ipcRenderer.invoke('articles:toggleStar', id),
    getUnreadCounts: () => ipcRenderer.invoke('articles:getUnreadCounts')
  },
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    update: (settings: Record<string, unknown>) => ipcRenderer.invoke('config:update', settings),
    /** 用内置浏览器登录站点：弹登录窗口，成功后自动保存该域 cookie */
    loginSite: (input: { domain: string; loginUrl: string; loginCookieNames?: string[] }) =>
      ipcRenderer.invoke('settings:loginSite', input),
    /** 订阅配置变更事件，返回取消订阅函数 */
    onChanged: (callback: () => void): (() => void) => onChannel('config:changed', callback)
  },
  cache: {
    /** 本地缓存占用统计（按命名空间） */
    stats: () => ipcRenderer.invoke('cache:stats'),
    /** 清理本地缓存，返回释放字节数 */
    clear: () => ipcRenderer.invoke('cache:clear')
  },
  opml: {
    import: () => ipcRenderer.invoke('opml:import'),
    export: () => ipcRenderer.invoke('opml:export'),
    /** 订阅 OPML 导入完成事件，返回取消订阅函数 */
    onImported: (callback: () => void): (() => void) => onChannel('opml:imported', callback)
  },
  menu: {
    /** 上报菜单可用状态（主进程据此置灰菜单项） */
    updateState: (state: {
      hasArticle: boolean
      hasFeedContext: boolean
      isTranslated?: boolean
      translateConfigured?: boolean
    }) => ipcRenderer.send('menu:updateState', state),
    onRefreshFeed: (callback: () => void): (() => void) => onChannel('menu:refreshFeed', callback),
    onRefreshAllFeeds: (callback: () => void): (() => void) =>
      onChannel('menu:refreshAllFeeds', callback),
    onMarkListRead: (callback: () => void): (() => void) =>
      onChannel('menu:markListRead', callback),
    onMarkAllRead: (callback: () => void): (() => void) => onChannel('menu:markAllRead', callback),
    onToggleRead: (callback: () => void): (() => void) => onChannel('menu:toggleRead', callback),
    onToggleUnread: (callback: () => void): (() => void) =>
      onChannel('menu:toggleUnread', callback),
    onCheckForUpdates: (callback: () => void): (() => void) =>
      onChannel('menu:checkForUpdates', callback),
    onToggleStar: (callback: () => void): (() => void) => onChannel('menu:toggleStar', callback),
    onTranslate: (callback: () => void): (() => void) => onChannel('menu:translate', callback),
    onTranslateRefresh: (callback: () => void): (() => void) =>
      onChannel('menu:translateRefresh', callback),
    onFocusSearch: (callback: () => void): (() => void) => onChannel('menu:focusSearch', callback)
  },
  sync: {
    run: () => ipcRenderer.invoke('sync:run'),
    resolve: (choice: 'local' | 'remote') => ipcRenderer.invoke('sync:resolve', choice),
    status: () => ipcRenderer.invoke('sync:status'),
    onStatus: (callback: (result: unknown) => void): (() => void) =>
      onChannel('sync:status', callback)
  },
  translate: {
    article: (id: number, targetLang?: string, forceRefresh?: boolean) =>
      ipcRenderer.invoke('translate:article', id, targetLang, forceRefresh),
    test: (config: {
      provider: 'none' | 'baidu' | 'edge'
      baiduAppid?: string
      baiduSecretKey?: string
      targetLang: string
    }) => ipcRenderer.invoke('translate:test', config)
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    openReleasePage: () => ipcRenderer.invoke('updater:openReleasePage'),
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
