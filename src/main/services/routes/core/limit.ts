/**
 * 并发调度器（FIFO 信号量）。
 *
 * 性能篇约束：浏览器抓取一个页面 = 一个渲染进程，内存几十 MB 起步；
 * 同一时间开的窗口越多，对设备与目标站的压力都越大。因此纯 HTTP 与
 * 浏览器渲染各配独立并发上限，超出排队等待，避免并发铺开打爆设备与站点。
 *
 * 安全篇约束：本层只做限流排队，不触碰页面内容（内容仍由 fetcher / adapter 处理）。
 */

export interface ConcurrencyConfig {
  /** 纯 HTTP 抓取并发上限（默认 6） */
  http?: number
  /** 浏览器渲染并发上限（默认 2） */
  browser?: number
}

/** 默认值：HTTP 便宜可略宽松；浏览器一个页面 = 一个渲染进程，必须收紧 */
const DEFAULT_HTTP = 6
const DEFAULT_BROWSER = 2

/** 简单 FIFO 信号量：同时最多 max 个任务在跑，其余排队 */
export class Limiter {
  private _max: number
  private active = 0
  private queue: Array<() => void> = []

  constructor(max: number) {
    this._max = max
  }

  get max(): number {
    return this._max
  }

  setMax(max: number): void {
    this._max = max
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this._max <= 0) return fn() // <=0 表示不限流（压力测试/临时放行用）
    if (this.active >= this._max) {
      await new Promise<void>((resolve) => this.queue.push(resolve))
    }
    this.active++
    try {
      return await fn()
    } finally {
      this.active--
      this.queue.shift()?.()
    }
  }
}

const httpLimiter = new Limiter(DEFAULT_HTTP)
const browserLimiter = new Limiter(DEFAULT_BROWSER)

/** 运行时调整并发上限（配置加载 / 测试用） */
export function setConcurrency(config: ConcurrencyConfig): void {
  if (config.http !== undefined) httpLimiter.setMax(config.http)
  if (config.browser !== undefined) browserLimiter.setMax(config.browser)
}

export function getConcurrency(): { http: number; browser: number } {
  return { http: httpLimiter.max, browser: browserLimiter.max }
}

/** 限流执行纯 HTTP 抓取 */
export function runWithHttpLimit<T>(fn: () => Promise<T>): Promise<T> {
  return httpLimiter.run(fn)
}

/** 限流执行浏览器渲染抓取 */
export function runWithBrowserLimit<T>(fn: () => Promise<T>): Promise<T> {
  return browserLimiter.run(fn)
}
