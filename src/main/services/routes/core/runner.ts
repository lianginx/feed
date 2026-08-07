import type { ParsedFeed } from '../../rss'
import type { BrowserFetchOptions, BrowserFetchResult } from './fetcher/browser'
import { fetchPage, type FetchPageOptions } from './fetcher/http'
import { runWithBrowserLimit, runWithHttpLimit } from './limit'
import type { FeedAdapter } from './types'

export interface AdapterRunResult {
  adapterId: string
  url: string
  feed: ParsedFeed
}

/** fetcher 依赖注入（单测可 mock，避免真实网络 / Electron） */
export interface AdapterFetchers {
  http?: (url: string, options?: FetchPageOptions) => Promise<string>
  browser?: (url: string, options?: BrowserFetchOptions) => Promise<BrowserFetchResult>
}

export interface RunAdapterOptions {
  fetchers?: AdapterFetchers
  /** 登录态 Cookie（name → value），由上层配置提供 */
  cookies?: Record<string, string>
}

/**
 * 执行一个适配器：构建 URL → 按 needsBrowser 选 fetcher → 解析为 ParsedFeed。
 * 基础层编排，不接触数据库 / IPC / 刷新主流程。
 */
export async function runAdapter(
  adapter: FeedAdapter,
  params: Record<string, string>,
  options: RunAdapterOptions = {}
): Promise<AdapterRunResult> {
  const url = adapter.buildUrl(params)
  const fetchers = options.fetchers ?? {}

  let raw: string
  if (adapter.needsBrowser) {
    const browser = fetchers.browser ?? (await import('./fetcher/browser')).fetchBrowserPage
    // 浏览器渲染并发受 browser 上限约束（一个页面 = 一个渲染进程）
    const page = await runWithBrowserLimit(() =>
      browser(url, {
        cookies: options.cookies,
        cookieDomain: adapter.cookieDomain,
        // 声明了 browserExtract 的适配器：渲染进程内直接提取结构化数据，主进程不解析整页大 HTML
        extract: adapter.browserExtract
      })
    )
    raw = page.data ?? page.html
  } else {
    const http = fetchers.http ?? fetchPage
    raw = await runWithHttpLimit(() => http(url, { headers: adapter.headers }))
  }

  const feed = await adapter.parse(raw, { params, url })
  return { adapterId: adapter.id, url, feed }
}
