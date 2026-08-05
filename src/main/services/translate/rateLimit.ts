/**
 * 请求限流器：FIFO 队列 + 令牌桶速率限制 + 并发上限。
 *
 * 百度翻译 QPS 按「每秒请求数」限制（未认证标准版 1，认证后高级版 10）。
 * 正确做法不是"等前一个响应 + 固定 sleep"，而是：
 * - 所有请求进入队列，按提交顺序调度
 * - 令牌桶保证速率 ≤ qps（每秒最多 qps 个请求），容量 burst 允许突发
 * - 并发上限 concurrency 控制同时在途请求数（qps=1 → 串行；qps=10 → 最多 10 并发）
 */

export type Sleep = (ms: number) => Promise<void>

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface RateLimiterOptions {
  /** 每秒最多请求数（百度认证后为 10） */
  qps: number
  /** 同时执行（在途）的请求数上限；默认 1（串行队列） */
  concurrency?: number
  /** 令牌桶容量（允许突发）；默认 = concurrency */
  burst?: number
  sleep?: Sleep
}

export interface RateLimiter {
  /** 排队并按速率调度执行一个请求，返回其结果 */
  <T>(run: () => Promise<T>): Promise<T>
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { qps, concurrency = 1, burst = concurrency, sleep = defaultSleep } = options
  const capacity = Math.max(1, Math.floor(burst))
  let tokens = capacity
  let lastRefill = Date.now()
  let active = 0
  // 等待并发槽的 FIFO 队列
  const waiters: Array<() => void> = []

  /** 获取执行许可：先等并发槽，再取令牌（速率 ≤ qps） */
  async function acquire(): Promise<void> {
    while (active >= concurrency) {
      await new Promise<void>((resolve) => waiters.push(resolve))
    }
    active++
    for (;;) {
      const now = Date.now()
      // 按经过时间补充令牌（上限 capacity）
      const refill = Math.min(capacity, tokens + ((now - lastRefill) / 1000) * qps)
      lastRefill = now
      if (refill >= 1) {
        tokens = refill - 1
        return
      }
      tokens = refill
      // 距下一个令牌补充的时间
      await sleep(((1 - refill) / qps) * 1000)
    }
  }

  function release(): void {
    active--
    waiters.shift()?.()
  }

  return function throttle<T>(run: () => Promise<T>): Promise<T> {
    const task = (async () => {
      await acquire()
      try {
        return await run()
      } finally {
        release()
      }
    })()
    return task
  }
}
