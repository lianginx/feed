import { getConnection } from '@main/database/connection'
import { getSettings, type TranslateConfig } from '@main/config'
import type { TranslatorInstanceMembers } from './providers'
import { createTranslateProvider } from './providers'
import { extractPieces, packPieces, rebuildHtml, type TranslateUnit } from './html'
import { getTranslation, saveTranslation, computeSourceHash } from './cache'
import { detectLanguage, isSameLanguage, SAMPLE_LIMIT } from './detect'
import type { BaiduApiError } from './providers/baidu'
import { createRateLimiter, type RateLimiter } from './rateLimit'

export interface TranslateResult {
  title: string
  content: string
  degraded: boolean
  skipped: boolean
}

const MAX_CHARS = 50000
const MAX_REQUESTS = 20
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

function createProviderThrottle(provider: TranslatorInstanceMembers): RateLimiter {
  const qps = Math.max(1, Math.round(1000 / provider.getRequestsTimeout()))
  return createRateLimiter({ qps, concurrency: qps })
}

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

  if (article.title.length + content.length > MAX_CHARS) {
    throw new Error('文章过长，超出单篇翻译上限（5 万字符）')
  }

  const { $, pieces, units, isFullDocument } = extractPieces(content)

  const sampleText = `${article.title}\n${units.map((u) => u.text).join('\n')}`
  const provider = await createTranslateProvider(settings.translate)

  let detected = detectLanguage(sampleText)
  if (isSameLanguage(detected, to)) {
    return { title: article.title, content, degraded: false, skipped: true }
  }

  if (
    provider &&
    'detect' in provider &&
    typeof (provider as { detect?: unknown }).detect === 'function'
  ) {
    try {
      const edgeDetected = await (
        provider as { detect: (t: string[]) => Promise<string | null> }
      ).detect([sampleText.slice(0, SAMPLE_LIMIT)])
      if (edgeDetected) {
        const mapped = edgeDetected as unknown as string
        const { toDetectedLang } = await import('./detect')
        detected = toDetectedLang(mapped)
      }
    } catch {
      void 0
    }
  }
  if (isSameLanguage(detected, to)) {
    return { title: article.title, content, degraded: false, skipped: true }
  }

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

  const translations: (string | null)[] = new Array(allUnits.length).fill(null)
  let degraded = false
  let offset = 0
  let usedRequests = titleRequestCount
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]
    const texts = batch.map((u) => u.text)
    let results = await translateWithRetry(provider, texts, 'auto', to, MAX_RETRIES, throttle)
    usedRequests++
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

export async function testTranslate(config: TranslateConfig): Promise<void> {
  const provider = await createTranslateProvider(config)
  if (!provider) throw new Error('翻译配置不完整，请选择可用的翻译服务')
  const throttle = createProviderThrottle(provider)
  const [result] = await translateWithRetry(provider, ['你好，世界'], 'auto', 'en', 1, throttle)
  if (!result) throw new Error('翻译测试失败，请检查凭据后重试')
}

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
