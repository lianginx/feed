import './adapters' // 触发内置适配器注册（副作用）

export type {
  FeedAdapter,
  AdapterParam,
  AdapterParseContext,
  SourceKind,
  SourceRunner
} from './types'
export { registerAdapter, getAdapter, listAdapters, findAdaptersByDomain } from './core/registry'
export { runAdapter, registerSource } from './core/runner'
export { setConcurrency, getConcurrency } from './core/limit'
export { fetchPage } from './core/fetcher/http'
export { fetchBrowserPage } from './core/fetcher/browser'
export { htmlToText, firstImage } from './core/extract'
