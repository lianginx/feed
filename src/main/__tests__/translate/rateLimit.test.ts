import { describe, it, expect } from 'vitest'
import { createRateLimiter } from '../../services/translate/rateLimit'

describe('createRateLimiter', () => {
  it('并发限制：同时执行的请求不超过 concurrency', async () => {
    const limiter = createRateLimiter({ qps: 1000, concurrency: 2 })
    let active = 0
    let maxActive = 0
    const runs = Array.from({ length: 5 }, () =>
      limiter(async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise((r) => setTimeout(r, 20))
        active--
        return 1
      })
    )
    await Promise.all(runs)
    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it('队列 FIFO：串行（concurrency=1）时按提交顺序执行', async () => {
    const limiter = createRateLimiter({ qps: 1000, concurrency: 1 })
    const order: string[] = []
    const p1 = limiter(async () => {
      order.push('1')
      await new Promise((r) => setTimeout(r, 30))
      order.push('1-end')
      return 1
    })
    const p2 = limiter(async () => {
      order.push('2')
      return 2
    })
    await Promise.all([p1, p2])
    // 串行：p2 必须等 p1 完成（1-end）后才执行
    expect(order).toEqual(['1', '1-end', '2'])
  })

  it('按 qps 限速：burst=1 时相邻请求间隔 ≈ 1000/qps', async () => {
    const limiter = createRateLimiter({ qps: 10, concurrency: 1, burst: 1 })
    const times: number[] = []
    for (let i = 0; i < 3; i++) {
      await limiter(async () => {
        times.push(Date.now())
        return i
      })
    }
    // 令牌桶 burst=1：每个请求都要等令牌，间隔 ≈ 100ms（放宽到 80ms 容忍抖动）
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(80)
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(80)
  })

  it('令牌桶容量允许突发：burst 足够时前几个立即执行', async () => {
    const limiter = createRateLimiter({ qps: 1000, concurrency: 10, burst: 10 })
    const start = Date.now()
    await Promise.all(Array.from({ length: 5 }, () => limiter(async () => undefined)))
    expect(Date.now() - start).toBeLessThan(100)
  })

  it('前一个请求失败不阻塞后续请求', async () => {
    const limiter = createRateLimiter({ qps: 1000, concurrency: 1 })
    await expect(
      limiter(async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    const r = await limiter(async () => 'ok')
    expect(r).toBe('ok')
  })

  it('并发 >1 时令牌桶仍保证平均速率不超 qps', async () => {
    const limiter = createRateLimiter({ qps: 20, concurrency: 5, burst: 1 })
    const start = Date.now()
    await Promise.all(Array.from({ length: 6 }, () => limiter(async () => undefined)))
    const elapsed = Date.now() - start
    // 6 个请求、qps=20、burst=1：首个立即，其余各间隔 ~50ms → 总耗时 ≥ 200ms
    expect(elapsed).toBeGreaterThanOrEqual(200)
  })
})
