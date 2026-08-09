import type { AdapterRunResult, FeedAdapter, RunAdapterOptions, SourceRunner } from '../types'
import { fetchPage } from './fetcher/http'
import { runWithBrowserLimit, runWithHttpLimit } from './limit'

/** 自定义取数通道注册表（source → SourceRunner）。分发器查表，不感知具体通道 */
const sourceRunners = new Map<string, SourceRunner>()

/**
 * 注册自定义取数通道的执行器。
 * 新增数据源：实现 SourceRunner 后在此登记，runAdapter 按 adapter.source 查表分发；
 * 未注册 / 未声明 source 的适配器走内置 http runner（缺省路径）。
 */
export function registerSource(kind: string, runner: SourceRunner): void {
  sourceRunners.set(kind, runner)
}

/**
 * 执行一个适配器：按 adapter.source 分发到对应 SourceRunner；缺省走内置 http 通道。
 * 基础层编排，不接触数据库 / IPC / 刷新主流程。
 */
export async function runAdapter(
  adapter: FeedAdapter,
  params: Record<string, string>,
  options: RunAdapterOptions = {}
): Promise<AdapterRunResult> {
  const custom = adapter.source ? sourceRunners.get(adapter.source) : undefined
  if (custom) {
    return custom.run(adapter, params, options)
  }
  return runHttpAdapter(adapter, params, options)
}

/**
 * 内置 http 取数通道（默认路径）：
 * 构建 URL → 按 needsBrowser 选 fetcher → 解析为 ParsedFeed。
 */
async function runHttpAdapter(
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
