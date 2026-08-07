import './adapters' // 触发内置适配器注册（副作用）

// core 框架层对外 API
export type { FeedAdapter, AdapterParam, AdapterParseContext } from './core/types'
export { registerAdapter, getAdapter, listAdapters, findAdaptersByDomain } from './core/registry'
export { runAdapter } from './core/runner'
export { fetchPage } from './core/fetcher/http'
export { fetchBrowserPage } from './core/fetcher/browser'
export { htmlToText, firstImage } from './core/extract'
