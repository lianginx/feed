import { describe, it, expect, vi } from 'vitest'
import {
  EdgeTranslator,
  EDGE_AUTH_URL,
  EDGE_TRANSLATE_URL
} from '@main/services/translate/providers/edge'
import type { Fetcher } from 'anylang/esm/utils/fetcher/types.js'

/** 构造伪 fetcher：按 URL 分发响应，并可记录请求以便断言 */
function makeFetcher(
  handlers: {
    url: (url: string) => boolean
    status?: number
    statusText?: string
    data: unknown
  }[],
  log: { calls: { url: string; options: Record<string, unknown> }[] } = { calls: [] }
): Fetcher {
  const fake = async (url: string, options: Record<string, unknown>): Promise<unknown> => {
    log.calls.push({ url, options })
    const hit = handlers.find((h) => h.url(url))
    return {
      headers: new Map<string, string>(),
      ok: (hit?.status ?? 200) >= 200 && (hit?.status ?? 200) < 300,
      status: hit?.status ?? 200,
      statusText: hit?.statusText ?? 'OK',
      data: hit?.data
    }
  }
  return fake as unknown as Fetcher
}

const okItem = (
  text: string,
  language = 'en',
  score = 0.9
): {
  translations: { text: string }[]
  detectedLanguage: { language: string; score: number }
} => ({
  translations: [{ text }],
  detectedLanguage: { language, score }
})

describe('EdgeTranslator', () => {
  it('静态成员：免凭据、支持自动源语言', () => {
    expect(EdgeTranslator.isRequiredKey()).toBe(false)
    expect(EdgeTranslator.isSupportedAutoFrom()).toBe(true)
  })

  describe('translateBatch', () => {
    it('成功响应按输入顺序映射译文', async () => {
      const t = new EdgeTranslator({
        headers: {},
        fetcher: makeFetcher([
          { url: (u) => u.startsWith(EDGE_AUTH_URL), data: 'fake-token' },
          {
            url: (u) => u.startsWith(EDGE_TRANSLATE_URL),
            data: [okItem('你好'), okItem('世界')]
          }
        ])
      })
      const result = await t.translateBatch(['hello', 'world'], 'auto', 'zh')
      expect(result).toEqual(['你好', '世界'])
    })

    it('请求体为 JSON 字符串数组，目标语言映射为微软码（zh → zh-Hans）', async () => {
      const log = { calls: [] as { url: string; options: Record<string, unknown> }[] }
      const t = new EdgeTranslator({
        headers: {},
        fetcher: makeFetcher(
          [
            { url: (u) => u.startsWith(EDGE_AUTH_URL), data: 'fake-token' },
            { url: (u) => u.startsWith(EDGE_TRANSLATE_URL), data: [okItem('你好')] }
          ],
          log
        )
      })
      await t.translateBatch(['hello'], 'auto', 'zh')
      const translateCall = log.calls.find((c) => c.url.startsWith(EDGE_TRANSLATE_URL))
      expect(translateCall?.url).toContain('to=zh-Hans')
      expect(translateCall?.options.body).toBe('["hello"]')
    })

    it('auth 可用时携带 Bearer token', async () => {
      const log = { calls: [] as { url: string; options: Record<string, unknown> }[] }
      const t = new EdgeTranslator({
        headers: {},
        fetcher: makeFetcher(
          [
            { url: (u) => u.startsWith(EDGE_AUTH_URL), data: 'fake-token' },
            { url: (u) => u.startsWith(EDGE_TRANSLATE_URL), data: [okItem('你好')] }
          ],
          log
        )
      })
      await t.translateBatch(['hello'], 'auto', 'zh')
      const translateCall = log.calls.find((c) => c.url.startsWith(EDGE_TRANSLATE_URL))
      const headers = translateCall?.options.headers as Record<string, string> | undefined
      expect(headers?.Authorization).toBe('Bearer fake-token')
    })

    it('auth 返回 404 时降级为无 token 直连（仍能翻译）', async () => {
      const log = { calls: [] as { url: string; options: Record<string, unknown> }[] }
      const t = new EdgeTranslator({
        headers: {},
        fetcher: makeFetcher(
          [
            {
              url: (u) => u.startsWith(EDGE_AUTH_URL),
              status: 404,
              statusText: 'Not Found',
              data: ''
            },
            { url: (u) => u.startsWith(EDGE_TRANSLATE_URL), data: [okItem('你好')] }
          ],
          log
        )
      })
      const result = await t.translateBatch(['hello'], 'auto', 'zh')
      expect(result).toEqual(['你好'])
      const translateCall = log.calls.find((c) => c.url.startsWith(EDGE_TRANSLATE_URL))
      const headers = translateCall?.options.headers as Record<string, string> | undefined
      expect(headers?.Authorization).toBeUndefined()
    })

    it('401 时强制刷新 token 并重试成功', async () => {
      let authCount = 0
      let translateCount = 0
      const t = new EdgeTranslator({
        headers: {},
        fetcher: (async (url: string): Promise<unknown> => {
          if (url.startsWith(EDGE_AUTH_URL)) {
            authCount++
            return {
              headers: new Map<string, string>(),
              ok: true,
              status: 200,
              statusText: 'OK',
              data: `token-${authCount}`
            }
          }
          translateCount++
          return {
            headers: new Map<string, string>(),
            ok: translateCount > 1, // 第一次翻译 401，刷新后第二次成功
            status: translateCount > 1 ? 200 : 401,
            statusText: translateCount > 1 ? 'OK' : 'Unauthorized',
            data: translateCount > 1 ? [okItem('你好')] : undefined
          }
        }) as Fetcher
      })
      const result = await t.translateBatch(['hello'], 'auto', 'zh')
      expect(result).toEqual(['你好'])
      expect(authCount).toBe(2) // 首次 + 401 后刷新
      expect(translateCount).toBe(2)
    })

    it('401 重试超过上限后抛错', async () => {
      const t = new EdgeTranslator({
        headers: {},
        fetcher: makeFetcher([
          { url: (u) => u.startsWith(EDGE_AUTH_URL), data: 'token' },
          {
            url: (u) => u.startsWith(EDGE_TRANSLATE_URL),
            status: 401,
            statusText: 'Unauthorized',
            data: ''
          }
        ])
      })
      await expect(t.translateBatch(['hello'], 'auto', 'zh')).rejects.toThrow(/授权失效/)
    })

    it('条目过多时按 900 条切子批并按原顺序合并', async () => {
      const texts = Array.from({ length: 1200 }, (_, i) => `word${i}`)
      const totalItems = texts.length
      let translateCount = 0
      const t = new EdgeTranslator({
        headers: {},
        fetcher: (async (url: string, options: Record<string, unknown>): Promise<unknown> => {
          if (url.startsWith(EDGE_AUTH_URL)) {
            return {
              headers: new Map<string, string>(),
              ok: true,
              status: 200,
              statusText: 'OK',
              data: 't'
            }
          }
          translateCount++
          const body = JSON.parse(String(options.body)) as string[]
          return {
            headers: new Map<string, string>(),
            ok: true,
            status: 200,
            statusText: 'OK',
            data: body.map((w) => okItem(`译-${w}`))
          }
        }) as Fetcher
      })
      const result = await t.translateBatch(texts, 'auto', 'zh')
      expect(result).toHaveLength(totalItems)
      expect(result[0]).toBe('译-word0')
      expect(result[totalItems - 1]).toBe('译-word1199')
      expect(translateCount).toBeGreaterThan(1) // 至少拆成 2 批
    })

    it('翻译失败项返回 null 而非抛错', async () => {
      const t = new EdgeTranslator({
        headers: {},
        fetcher: makeFetcher([
          { url: (u) => u.startsWith(EDGE_AUTH_URL), data: 't' },
          {
            url: (u) => u.startsWith(EDGE_TRANSLATE_URL),
            data: [okItem('你好'), okItem('')] // 第二项译文为空
          }
        ])
      })
      const result = await t.translateBatch(['hello', 'world'], 'auto', 'zh')
      expect(result[0]).toBe('你好')
      expect(result[1]).toBeNull()
    })

    it('响应结构不符时抛可重试错误', async () => {
      const t = new EdgeTranslator({
        headers: {},
        fetcher: makeFetcher([
          { url: (u) => u.startsWith(EDGE_AUTH_URL), data: 't' },
          { url: (u) => u.startsWith(EDGE_TRANSLATE_URL), data: { error: { code: 400000 } } }
        ])
      })
      try {
        await t.translateBatch(['hello'], 'auto', 'zh')
        expect.unreachable('应当抛错')
      } catch (e) {
        const err = e as Error & { retryable?: boolean }
        expect(err.retryable).toBe(true)
      }
    })
  })

  describe('detect（语言检测）', () => {
    it('按字节长度加权投票取最优语言', async () => {
      const t = new EdgeTranslator({
        headers: {},
        fetcher: makeFetcher([
          { url: (u) => u.startsWith(EDGE_AUTH_URL), data: 't' },
          {
            url: (u) => u.startsWith(EDGE_TRANSLATE_URL),
            data: [
              okItem('', 'zh-Hans', 1), // 中文段：字节权重高
              okItem('', 'en', 0.5)
            ]
          }
        ])
      })
      const detected = await t.detect(['这是一段中文', 'a'])
      expect(detected).toBe('zh')
    })

    it('日文检测映射为 ja', async () => {
      const t = new EdgeTranslator({
        headers: {},
        fetcher: makeFetcher([
          { url: (u) => u.startsWith(EDGE_AUTH_URL), data: 't' },
          { url: (u) => u.startsWith(EDGE_TRANSLATE_URL), data: [okItem('', 'ja', 0.99)] }
        ])
      })
      expect(await t.detect(['こんにちは'])).toBe('ja')
    })

    it('未知语言归为 unknown', async () => {
      const t = new EdgeTranslator({
        headers: {},
        fetcher: makeFetcher([
          { url: (u) => u.startsWith(EDGE_AUTH_URL), data: 't' },
          { url: (u) => u.startsWith(EDGE_TRANSLATE_URL), data: [okItem('', 'fr', 0.9)] }
        ])
      })
      expect(await t.detect(['bonjour'])).toBe('unknown')
    })

    it('请求失败返回 null（不抛错）', async () => {
      const t = new EdgeTranslator({
        headers: {},
        fetcher: makeFetcher([
          { url: (u) => u.startsWith(EDGE_AUTH_URL), data: 't' },
          {
            url: (u) => u.startsWith(EDGE_TRANSLATE_URL),
            status: 500,
            statusText: 'Internal',
            data: ''
          }
        ])
      })
      expect(await t.detect(['hello'])).toBeNull()
    })
  })

  describe('长度上限口径', () => {
    it('getLengthLimit 返回字节口径上限（4500 字符 × 3 = 13500 字节）', () => {
      const t = new EdgeTranslator({ headers: {}, fetcher: makeFetcher([]) })
      expect(t.getLengthLimit()).toBe(13500)
    })

    it('checkLimitExceeding 按字符数判定（接口真实限制 4500 字符，不受字节口径影响）', () => {
      const t = new EdgeTranslator({ headers: {}, fetcher: makeFetcher([]) })
      expect(t.checkLimitExceeding('a'.repeat(5000))).toBe(500)
      // 1500 汉字 = 4500 字节（未超 13500），但字符数 1500 也未超 4500
      expect(t.checkLimitExceeding('长'.repeat(1500))).toBe(0)
      expect(t.checkLimitExceeding(['a', 'b'])).toBe(0)
    })

    it('单个超长文本（字节未超但字符超 4500）内部仍按字符切子批兜底', async () => {
      const long = 'a'.repeat(9000) // 9000 字节 < 13500，但 9000 字符 > 4500
      let translateCount = 0
      const t = new EdgeTranslator({
        headers: {},
        fetcher: (async (url: string, options: Record<string, unknown>): Promise<unknown> => {
          if (url.startsWith(EDGE_AUTH_URL)) {
            return {
              headers: new Map<string, string>(),
              ok: true,
              status: 200,
              statusText: 'OK',
              data: 't'
            }
          }
          translateCount++
          const body = JSON.parse(String(options.body)) as string[]
          return {
            headers: new Map<string, string>(),
            ok: true,
            status: 200,
            statusText: 'OK',
            data: body.map((w) => okItem(`译-${w.slice(0, 5)}`))
          }
        }) as Fetcher
      })
      const result = await t.translateBatch([long], 'auto', 'zh')
      expect(result).toHaveLength(1)
      expect(result[0]).not.toBeNull()
      expect(translateCount).toBeGreaterThanOrEqual(2)
    })
  })

  describe('token 缓存', () => {
    it('有效期 10 分钟内复用，过期后重新获取', async () => {
      vi.useFakeTimers()
      let authCount = 0
      const t = new EdgeTranslator({
        headers: {},
        fetcher: (async (url: string): Promise<unknown> => {
          if (url.startsWith(EDGE_AUTH_URL)) {
            authCount++
            return {
              headers: new Map<string, string>(),
              ok: true,
              status: 200,
              statusText: 'OK',
              data: `token-${authCount}`
            }
          }
          return {
            headers: new Map<string, string>(),
            ok: true,
            status: 200,
            statusText: 'OK',
            data: [okItem('你好')]
          }
        }) as Fetcher
      })
      await t.translateBatch(['a'], 'auto', 'zh')
      await t.translateBatch(['b'], 'auto', 'zh')
      expect(authCount).toBe(1) // 第二次复用缓存

      vi.advanceTimersByTime(10 * 60 * 1000 + 1)
      await t.translateBatch(['c'], 'auto', 'zh')
      expect(authCount).toBe(2) // 过期后重新获取
      vi.useRealTimers()
    })
  })
})

describe('EDGE 常量', () => {
  it('使用微软 Edge 公共接口地址', () => {
    expect(EDGE_AUTH_URL).toBe('https://edge.microsoft.com/translate/auth')
    expect(EDGE_TRANSLATE_URL).toBe('https://edge.microsoft.com/translate/translatetext')
  })
})
