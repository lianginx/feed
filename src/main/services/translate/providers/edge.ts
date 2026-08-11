import { z } from 'zod'
import { BaseTranslator } from 'anylang/esm/translators/BaseTranslator.js'
import type { TranslatorOptions } from 'anylang/esm/translators/BaseTranslator.js'
import { toEdgeCode } from '@main/services/translate/languages'
import { toDetectedLang } from '@main/services/translate/detect'
import type { DetectedLang } from '@main/services/translate/detect'

/**
 * 微软 Edge 内置翻译适配器（免注册 / 免 API key，成本由微软承担）。
 *
 * 复用 Edge 浏览器的公共接口（参考 duo-translator）：
 * - token：GET https://edge.microsoft.com/translate/auth，响应为纯文本
 * - 翻译：POST https://edge.microsoft.com/translate/translatetext?isEnterpriseClient=false&to=<目标语言>
 *   请求体为 JSON 字符串数组，响应为 [{ translations: [{ text }], detectedLanguage: { language, score } }]
 *
 * 特性：
 * - token 缓存约 10 分钟复用；auth 不可用（部分网络/地区 404）时降级无 token 直连
 * - 401 说明 token 失效 → 强制刷新后重试，上限 5 次
 * - 单次请求限 5000 字符 / 1000 条，内部按 4500 字符 / 900 条切子批，并发请求后按原顺序合并
 * - 语言检测复用同一接口（to=en），按源文本字节长度加权投票取最优结果
 *
 * 该接口无 SLA、有频率限制，仅适合免费/轻量场景。
 */

export const EDGE_AUTH_URL = 'https://edge.microsoft.com/translate/auth'
export const EDGE_TRANSLATE_URL = 'https://edge.microsoft.com/translate/translatetext'

/** token 有效期约 10 分钟 */
const TOKEN_TTL_MS = 10 * 60 * 1000
/** 单次请求累计字符上限（官方约 5000，按 9 折保险） */
const MAX_BATCH_CHARS = 4500
/**
 * getLengthLimit 返回的字节口径上限：packPieces 按 UTF-8 字节打包，
 * CJK 最坏 3 字节/字，4500 字符 ≈ 13500 字节；真实字符上限由 splitSubBatches 兜底
 */
const MAX_BATCH_BYTES = MAX_BATCH_CHARS * 3
/** 单次请求条数上限（官方约 1000，按 9 折保险） */
const MAX_BATCH_ITEMS = 900
/** 401 后强制刷新 token 重试上限 */
const MAX_TOKEN_RETRIES = 5
/** 子批并发数（接口无 SLA，保守限流） */
const CONCURRENCY = 3

export interface EdgeApiError extends Error {
  status?: number
  /** false = 确定性错误不重试；undefined/true = 可重试 */
  retryable?: boolean
}

const EdgeItemSchema = z.object({
  detectedLanguage: z.object({ language: z.string(), score: z.number() }).optional(),
  translations: z.array(z.object({ text: z.string() }))
})

const EdgeResponseSchema = z.array(EdgeItemSchema)

type EdgeItem = z.infer<typeof EdgeItemSchema>

/** 翻译单元：text 为待翻译文本，index 记录其在原始数组中的下标（供译文按序合并） */
interface EdgeUnit {
  text: string
  index: number
}

export interface EdgeCredentials {
  [key: string]: unknown
}

/** 带并发上限的批量执行，按任务下标保序返回结果 */
async function runPool<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results = new Array<T>(tasks.length)
  let next = 0
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++
      if (i >= tasks.length) return
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()))
  return results
}

/** 超长单条按 MAX_BATCH_CHARS 切段（带原下标），其余原样 */
function buildUnits(texts: string[]): EdgeUnit[] {
  const units: EdgeUnit[] = []
  texts.forEach((t, i) => {
    if (t.length > MAX_BATCH_CHARS) {
      for (let s = 0; s < t.length; s += MAX_BATCH_CHARS) {
        units.push({ text: t.slice(s, s + MAX_BATCH_CHARS), index: i })
      }
    } else {
      units.push({ text: t, index: i })
    }
  })
  return units
}

/** 把单元列表切为 ≤ MAX_BATCH_ITEMS 条且累计 ≤ MAX_BATCH_CHARS 字符的子批 */
function splitSubBatches(units: EdgeUnit[]): EdgeUnit[][] {
  const batches: EdgeUnit[][] = []
  let cur: EdgeUnit[] = []
  let chars = 0
  for (const u of units) {
    if (cur.length >= MAX_BATCH_ITEMS || chars + u.text.length > MAX_BATCH_CHARS) {
      if (cur.length > 0) {
        batches.push(cur)
        cur = []
        chars = 0
      }
    }
    cur.push(u)
    chars += u.text.length
  }
  if (cur.length > 0) batches.push(cur)
  return batches
}

export class EdgeTranslator extends BaseTranslator<EdgeCredentials> {
  static readonly translatorName = 'EdgeTranslator'
  static isRequiredKey = (): boolean => false
  static isSupportedAutoFrom = (): boolean => true
  static getSupportedLanguages(): string[] {
    return ['zh-Hans', 'zh-Hant', 'en', 'ja', 'ko', 'fr', 'de', 'ru', 'es']
  }

  private token: { value: string; issuedAt: number } | null = null
  /** auth 不可用时在一段时间内不重试（避免每次请求都白打一次） */
  private authUnavailableUntil = 0

  getLengthLimit(): number {
    // packPieces 按字节打包，返回字节口径上限：CJK 下 4500 字符 ≈ 13500 字节，
    // 一批恰好满载一次请求；字符超限由内部 splitSubBatches（≤ MAX_BATCH_CHARS）兜底切批
    return MAX_BATCH_BYTES
  }

  getRequestsTimeout(): number {
    // 接口无 SLA，保守设置请求间隔 300ms（约 3 QPS）
    return 300
  }

  checkLimitExceeding(text: string | string[]): number {
    // 接口真实限制为字符数（MAX_BATCH_CHARS），保持字符口径，
    // 不随 getLengthLimit 的字节化而改变（该口径供 packPieces 使用）
    const plain = Array.isArray(text) ? text.join('') : text
    const extra = plain.length - MAX_BATCH_CHARS
    return extra > 0 ? extra : 0
  }

  async translate(text: string, from: string, to: string): Promise<string> {
    const [result] = await this.translateBatch([text], from, to)
    return result ?? ''
  }

  async translateBatch(texts: string[], _from: string, to: string): Promise<(string | null)[]> {
    const target = toEdgeCode(to)
    const units = buildUnits(texts)
    const subBatches = splitSubBatches(units)
    const results = await runPool(
      subBatches.map((batch) => () => this.requestSubBatch(batch, target)),
      CONCURRENCY
    )
    // 按原下标合并子批译文（同一下标的多个切段按序拼接）
    const byIndex = new Map<number, string[]>()
    subBatches.forEach((batch, i) => {
      const translated = results[i]
      batch.forEach((u, j) => {
        const t = translated?.[j]?.translations[0]?.text
        if (t != null && t !== '') {
          const arr = byIndex.get(u.index) ?? []
          arr.push(t)
          byIndex.set(u.index, arr)
        }
      })
    })
    return texts.map((_, i) => {
      const segs = byIndex.get(i)
      return segs && segs.length > 0 ? segs.join('') : null
    })
  }

  /**
   * 语言检测：复用翻译接口（to=en），对每段文本取 detectedLanguage，
   * 按源文本字节长度 × score 加权投票，取权重最高的语言码。
   * 失败返回 null（调用方回退本地检测）。
   */
  async detect(texts: string[]): Promise<DetectedLang | null> {
    try {
      const units = buildUnits(texts)
      const subBatches = splitSubBatches(units)
      const results = await runPool(
        subBatches.map((batch) => () => this.requestSubBatch(batch, 'en')),
        CONCURRENCY
      )
      const weight = new Map<string, number>()
      subBatches.forEach((batch, i) => {
        const resp = results[i] ?? []
        batch.forEach((u, j) => {
          const lang = resp[j]?.detectedLanguage
          if (!lang) return
          const bytes = Buffer.byteLength(u.text, 'utf8')
          weight.set(lang.language, (weight.get(lang.language) ?? 0) + bytes * lang.score)
        })
      })
      let bestLang: string | null = null
      let bestWeight = -1
      for (const [lang, w] of weight) {
        if (w > bestWeight) {
          bestWeight = w
          bestLang = lang
        }
      }
      return bestLang ? toDetectedLang(bestLang) : null
    } catch {
      return null
    }
  }

  /** 发送一个子批的翻译请求；401 时清空 token 缓存强制刷新后重试（上限 MAX_TOKEN_RETRIES 次） */
  private async requestSubBatch(texts: EdgeUnit[], to: string): Promise<EdgeItem[]> {
    let retries = 0
    for (;;) {
      try {
        const token = await this.getToken()
        const url = `${EDGE_TRANSLATE_URL}?isEnterpriseClient=false&to=${encodeURIComponent(to)}`
        const res = await this.fetch(url, {
          responseType: 'text',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(texts.map((u) => u.text))
        })

        if (res.status === 401) {
          retries++
          if (retries > MAX_TOKEN_RETRIES) {
            const err = new Error('Edge 翻译接口授权失效，请稍后重试') as EdgeApiError
            err.retryable = true
            throw err
          }
          this.token = null
          continue
        }
        if (!res.ok) {
          const err = new Error(
            `Edge 翻译接口返回 ${res.status}${res.statusText ? `：${res.statusText}` : ''}`
          ) as EdgeApiError
          err.status = res.status
          // 5xx / 429 可重试；其余 4xx 为确定性错误（参数/语言不支持等）
          err.retryable = res.status === 429 || res.status >= 500
          throw err
        }

        // 兼容 data 为 JSON 字符串（anylangFetcher text 模式）或已解析对象两种形态
        const raw = res.data as unknown
        const payload = typeof raw === 'string' ? JSON.parse(raw) : raw
        const parsed = EdgeResponseSchema.parse(payload)
        return parsed
      } catch (e) {
        // 响应体非 JSON / 结构不符 → 视为可重试的临时错误
        if (e instanceof SyntaxError || e instanceof z.ZodError) {
          const err = new Error('Edge 翻译接口响应格式异常') as EdgeApiError
          err.retryable = true
          throw err
        }
        throw e
      }
    }
  }

  /**
   * 获取 auth token（缓存约 10 分钟复用）。
   * auth 端点不可用（部分网络/地区返回 404）时降级为 null——实测 translatetext
   * 无 token 亦可调用；降级后一段时间内不重试 auth，避免每次请求白打。
   */
  private async getToken(): Promise<string | null> {
    const now = Date.now()
    if (this.token && now - this.token.issuedAt < TOKEN_TTL_MS) return this.token.value
    if (now < this.authUnavailableUntil) return null
    try {
      const res = await this.fetch(EDGE_AUTH_URL, {
        responseType: 'text',
        method: 'GET',
        headers: {}
      })
      const value = String(res.data ?? '').trim()
      if (!res.ok || !value) {
        this.token = null
        this.authUnavailableUntil = now + TOKEN_TTL_MS
        return null
      }
      this.token = { value, issuedAt: now }
      return value
    } catch {
      this.token = null
      this.authUnavailableUntil = now + TOKEN_TTL_MS
      return null
    }
  }
}

export type EdgeTranslatorOptions = TranslatorOptions<EdgeCredentials>
