import { getConnection } from '@main/database/connection'
import { getSettings, type TranslateConfig } from '@main/config'
import type { TranslatorInstanceMembers } from './providers'
import { createTranslateProvider } from './providers'
import { extractPieces, packPieces, rebuildHtml, type TranslateUnit } from './html'
import { getTranslation, saveTranslation, computeSourceHash } from './cache'
import { detectLanguage, isSameLanguage, SAMPLE_LIMIT } from './detect'
import type { BaiduApiError } from './providers/baidu'
import { EdgeTranslator } from './providers/edge'
import { createRateLimiter, type RateLimiter } from './rateLimit'

export interface TranslateResult {
  title: string
  content: string
  /** 部分段落翻译失败，已保留原文 */
  degraded: boolean
  /** 文章已为目标语言，未翻译 */
  skipped: boolean
}

/** 单篇翻译上限：5 万字符 / 20 次请求 */
const MAX_CHARS = 50000
const MAX_REQUESTS = 20
/** 可重试错误的最大重试次数（指数退避） */
const MAX_RETRIES = 2

interface ArticleRow {
  id: number
  title: string
  content: string | null
}

function getArticle(id: number): ArticleRow | null {
  const db = getConnection()
  const row = db.prepare('SELECT id, title, content FROM articles WHERE id = ?').get(id) as
    ArticleRow | undefined
  return row ?? null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 按提供商请求间隔推导限流参数（认证后 10 QPS → 并发 10；未认证 1 QPS → 串行）。
 * 百度按「每秒请求数」限速：队列 + 令牌桶保证速率 ≤ qps，并发上限与 qps 对齐。
 */
function createProviderThrottle(provider: TranslatorInstanceMembers): RateLimiter {
  const qps = Math.max(1, Math.round(1000 / provider.getRequestsTimeout()))
  return createRateLimiter({ qps, concurrency: qps })
}

/**
 * 翻译文章标题 + 正文。
 * @param id 文章 id
 * @param targetLang 目标语言应用码；缺省读配置
 * @param forceRefresh 为 true 时忽略缓存，强制重新翻译（用户主动刷新）
 */
export async function translateArticle(
  id: number,
  targetLang?: string,
  forceRefresh = false
): Promise<TranslateResult> {
  const settings = getSettings()
  const to = targetLang ?? settings.translate.targetLang

  const article = getArticle(id)
  if (!article) throw new Error('文章不存在')
  const content = article.content ?? ''

  // 缓存命中直接返回（最省，不提取不检测；除非 forceRefresh 强制重新翻译）
  const sourceHash = computeSourceHash(article.title, content)
  const cached = getTranslation(getConnection(), id, settings.translate.provider, to, sourceHash)
  if (cached && !forceRefresh) {
    return {
      title: cached.translated_title ?? article.title,
      content: cached.translated_content ?? content,
      degraded: false,
      skipped: false
    }
  }

  // 单篇总量上限检查提前：超长直接抛错，不做提取/检测/发请求（防配额失控）
  if (article.title.length + content.length > MAX_CHARS) {
    throw new Error('文章过长，超出单篇翻译上限（5 万字符）')
  }

  // 正文：收集文本节点（标签留在 DOM，只翻译并回填文本节点）
  const { $, pieces, units, isFullDocument } = extractPieces(content)

  // 语言检测：基于提取后的正文纯文本（去掉标签/样式干扰），源 ≈ 目标直接跳过；
  // zh 与 zh-Hant 视为不同语言不跳过。中文网页目标 zh → 直接返回原文（原文变原文）
  const sampleText = `${article.title}\n${units.map((u) => u.text).join('\n')}`
  const provider = createTranslateProvider(settings.translate)

  // 本地轻量检测先判同语言 → 直接跳过（零网络开销，无需已配置翻译服务）
  let detected = detectLanguage(sampleText)
  if (isSameLanguage(detected, to)) {
    return { title: article.title, content, degraded: false, skipped: true }
  }

  // 本地检测不明确/不同语言时，Edge 免费检测复核（复用翻译接口、加权投票，更准），
  // 失败回退本地检测；样本截断对齐本地检测大小，长文不会为检测切批浪费请求
  if (provider instanceof EdgeTranslator) {
    const edgeDetected = await provider.detect([sampleText.slice(0, SAMPLE_LIMIT)])
    if (edgeDetected) detected = edgeDetected
  }
  if (isSameLanguage(detected, to)) {
    return { title: article.title, content, degraded: false, skipped: true }
  }

  // 到此才真正需要翻译服务；源≈目标已提前跳过（无需凭据），未配置在此报错
  if (!provider) throw new Error('未配置翻译服务，请在设置中启用翻译')

  const throttle = createProviderThrottle(provider)

  let translatedTitle = article.title
  let titleRequestCount = 0
  if (article.title.trim()) {
    titleRequestCount = 1
    const [t] = await translateWithRetry(
      provider,
      [article.title],
      'auto',
      to,
      MAX_RETRIES,
      throttle
    )
    translatedTitle = t ?? article.title
  }

  const batches = packPieces(pieces, provider.getLengthLimit())
  if (titleRequestCount + batches.length > MAX_REQUESTS) {
    throw new Error('文章段落过多，超出单篇翻译请求上限（20 次）')
  }
  const allUnits: TranslateUnit[] = batches.flat()

  // 逐批翻译（节流器统一保证请求间隔），失败项保留原文
  const translations: (string | null)[] = new Array(allUnits.length).fill(null)
  let degraded = false
  let offset = 0
  let usedRequests = titleRequestCount
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]
    const texts = batch.map((u) => u.text)
    let results = await translateWithRetry(provider, texts, 'auto', to, MAX_RETRIES, throttle)
    usedRequests++
    // 整批失败：若请求预算允许则拆成单段逐个重试——短文本更不易触发超时/超长，
    // 显著减少长文「部分段落失败」的情况
    if (results.every((r) => r == null) && usedRequests + batch.length <= MAX_REQUESTS) {
      const singles: (string | null)[] = []
      for (let i = 0; i < batch.length; i++) {
        const [single] = await translateWithRetry(
          provider,
          [batch[i].text],
          'auto',
          to,
          MAX_RETRIES,
          throttle
        )
        singles.push(single)
      }
      usedRequests += batch.length
      results = singles
    }
    results.forEach((r, i) => {
      // 输出侧校验：仅空/null 视为失败（译文===原文视为未变化，不误判为失败）
      if (r == null || r.trim() === '') {
        degraded = true
        return
      }
      translations[offset + i] = r
    })
    offset += batch.length
  }

  const rebuilt = rebuildHtml({ $, units, allUnits, translations, isFullDocument })
  degraded = degraded || rebuilt.degraded

  // 完整翻译成功才写缓存；部分失败（degraded）不缓存，下次点翻译会重新执行、重试失败段落
  if (!degraded) {
    saveTranslation(getConnection(), {
      article_id: id,
      provider: settings.translate.provider,
      target_lang: to,
      source_hash: sourceHash,
      translated_title: translatedTitle,
      translated_content: rebuilt.html,
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000)
    })
  }

  return { title: translatedTitle, content: rebuilt.html, degraded, skipped: false }
}

/** 用给定配置验证翻译凭据（保存前可测） */
export async function testTranslate(config: TranslateConfig): Promise<void> {
  const provider = createTranslateProvider(config)
  if (!provider) throw new Error('翻译配置不完整，请选择可用的翻译服务')
  const throttle = createProviderThrottle(provider)
  const [result] = await translateWithRetry(provider, ['你好，世界'], 'auto', 'en', 1, throttle)
  if (!result) throw new Error('翻译测试失败，请检查凭据后重试')
}

/**
 * 带重试的批量翻译。
 * 确定性错误（签名/余额等）直接抛出；超时/频率/网络错误指数退避重试，
 * 重试耗尽后返回 null 数组（由调用方降级为原文）。
 * 每次实际请求前经过限流器，保证 QPS 不超限。
 */
async function translateWithRetry(
  provider: TranslatorInstanceMembers,
  texts: string[],
  from: string,
  to: string,
  maxRetries: number,
  throttle: RateLimiter
): Promise<(string | null)[]> {
  let attempt = 0
  for (;;) {
    try {
      // 请求经限流器统一排队：令牌桶限 QPS、并发受 concurrency 约束。
      // 百度认证后按 10 QPS / 10 并发调度（未认证 1 QPS 退化为串行），
      // 无需在调用侧额外做“串行 + sleep”——限流器已保证速率与并发。
      return await throttle(() => provider.translateBatch(texts, from, to))
    } catch (e) {
      const err = e as BaiduApiError
      if (err?.retryable === false) throw e
      attempt++
      if (attempt > maxRetries) {
        return texts.map(() => null)
      }
      await sleep(1000 * Math.pow(2, attempt - 1))
    }
  }
}
