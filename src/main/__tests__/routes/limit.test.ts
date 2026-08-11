import { describe, it, expect, afterEach } from 'vitest'
import {
  Limiter,
  setConcurrency,
  getConcurrency,
  runWithHttpLimit
} from '@main/services/routes/core/limit'
import { runAdapter } from '@main/services/routes/core/runner'
import type { FeedAdapter } from '@main/services/routes/core/types'

/** 每个用例结束恢复默认并发，避免污染其他测试文件（模块级单例） */
afterEach(() => setConcurrency({ http: 6, browser: 2 }))

describe('Limiter 信号量', () => {
  it('并发峰值不超过上限，超出排队', async () => {
    const limiter = new Limiter(2)
    let active = 0
    let peak = 0
    const job = async (): Promise<void> => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 20))
      active--
    }
    await Promise.all(Array.from({ length: 6 }, () => limiter.run(job)))
    expect(peak).toBe(2)
  })

  it('max <= 0 时不限流', async () => {
    const limiter = new Limiter(0)
    let active = 0
    let peak = 0
    const job = async (): Promise<void> => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 10))
      active--
    }
    await Promise.all(Array.from({ length: 5 }, () => limiter.run(job)))
    expect(peak).toBe(5)
  })

  it('setMax 后可动态调整上限', async () => {
    const limiter = new Limiter(1)
    limiter.setMax(3)
    let active = 0
    let peak = 0
    const job = async (): Promise<void> => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 10))
      active--
    }
    await Promise.all(Array.from({ length: 4 }, () => limiter.run(job)))
    expect(peak).toBe(3)
  })
})

describe('全局 HTTP 限流', () => {
  it('runWithHttpLimit 峰值不超过设置上限', async () => {
    setConcurrency({ http: 2 })
    let active = 0
    let peak = 0
    const job = async (): Promise<void> => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 20))
      active--
    }
    await Promise.all(Array.from({ length: 5 }, () => runWithHttpLimit(job)))
    expect(peak).toBe(2)
  })
})

describe('runner 接入限流（mock fetcher，不联网）', () => {
  const httpAdapter: FeedAdapter = {
    id: 't-http',
    name: '测试 HTTP 站',
    domains: ['example.com'],
    params: [],
    needsBrowser: false,
    buildUrl: () => 'https://example.com',
    async parse(_raw: string, ctx) {
      return { title: 'T', link: ctx.url, items: [] }
    }
  }
  const browserAdapter: FeedAdapter = {
    id: 't-browser',
    name: '测试浏览器站',
    domains: ['example.com'],
    params: [],
    needsBrowser: true,
    buildUrl: () => 'https://example.com',
    async parse(_raw, ctx) {
      return { title: 'T', link: ctx.url, items: [] }
    }
  }

  it('HTTP 并发峰值被 http 上限约束', async () => {
    setConcurrency({ http: 3, browser: 1 })
    let active = 0
    let peak = 0
    const http = async (): Promise<string> => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 20))
      active--
      return '<rss/>'
    }
    await Promise.all(
      Array.from({ length: 6 }, () => runAdapter(httpAdapter, {}, { fetchers: { http } }))
    )
    expect(peak).toBe(3)
  })

  it('浏览器并发峰值被 browser 上限约束', async () => {
    setConcurrency({ http: 3, browser: 1 })
    let active = 0
    let peak = 0
    const browser = async (): Promise<{ html: string; title: string }> => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 20))
      active--
      return { html: '<html/>', title: 't' }
    }
    await Promise.all(
      Array.from({ length: 4 }, () => runAdapter(browserAdapter, {}, { fetchers: { browser } }))
    )
    expect(peak).toBe(1)
  })

  it('混合场景：HTTP 与浏览器各自受各自上限约束', async () => {
    setConcurrency({ http: 3, browser: 1 })
    let hActive = 0
    let hPeak = 0
    const http = async (): Promise<string> => {
      hActive++
      hPeak = Math.max(hPeak, hActive)
      await new Promise((r) => setTimeout(r, 30))
      hActive--
      return '<rss/>'
    }
    let bActive = 0
    let bPeak = 0
    const browser = async (): Promise<{ html: string; title: string }> => {
      bActive++
      bPeak = Math.max(bPeak, bActive)
      await new Promise((r) => setTimeout(r, 30))
      bActive--
      return { html: '<html/>', title: 't' }
    }
    const jobs = [
      ...Array.from({ length: 5 }, () => runAdapter(httpAdapter, {}, { fetchers: { http } })),
      ...Array.from({ length: 3 }, () => runAdapter(browserAdapter, {}, { fetchers: { browser } }))
    ]
    await Promise.all(jobs)
    expect(hPeak).toBe(3)
    expect(bPeak).toBe(1)
  })

  it('getConcurrency / setConcurrency 读写', () => {
    setConcurrency({ http: 9, browser: 4 })
    expect(getConcurrency()).toEqual({ http: 9, browser: 4 })
    setConcurrency({ http: 2 })
    expect(getConcurrency()).toEqual({ http: 2, browser: 4 })
  })
})
